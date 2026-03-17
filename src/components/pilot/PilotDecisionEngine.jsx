// src/components/pilot/PilotDecisionEngine.jsx
import { useEffect, useMemo, useState, useCallback } from "react";
import { useEnvironment } from "../Environment.jsx";
import ValidationGate from "../ValidationGate";

/* ---------------- API helpers ---------------- */
const API_BASE = window.env.VITE_API_BASE;

function getHeaders() {
  return {
    "Content-Type": "application/json",
    "Accept": "application/json",
    "x-user-role": sessionStorage.getItem("user_role") || "Admin",
  };
}

async function getJSON(url, signal) {
  const headers = getHeaders();
  delete headers["Content-Type"]; 
  const r = await fetch(url, { headers, cache: "no-store", signal });
  const t = await r.text();
  if (!r.ok) throw new Error(`HTTP ${r.status}: ${t.slice(0, 400)}`);
  return JSON.parse(t);
}

async function postJSON(url, body) {
  const r = await fetch(url, {
    method: "POST",
    headers: getHeaders(),
    body: JSON.stringify(body),
  });
  const t = await r.text();
  let j; try { j = JSON.parse(t); } catch { throw new Error(`Unexpected response: ${t.slice(0, 400)}`); }
  if (!r.ok || j?.ok === false) throw new Error(j?.error || j?.message || `HTTP ${r.status}`);
  return j;
}

async function getActionResults(id, signal) {
  if (!id) return { actionId: null, total: 0, success: 0, rows: [] };
  const j = await getJSON(`${API_BASE}/api/actions/${id}/results`, signal);
  return { actionId: id, ...j };
}
async function getCriticalHealth(scopeGroup, signal) {
  const groupQuery = scopeGroup ? `?group=${encodeURIComponent(scopeGroup)}` : "";
  return getJSON(`${API_BASE}/api/health/critical${groupQuery}`, signal);
}
async function getTotalComputersMaybe(scopeGroup, signal) {
  try {
    const groupQuery = scopeGroup ? `?group=${encodeURIComponent(scopeGroup)}` : "";
    const j = await getJSON(`${API_BASE}/api/infra/total-computers${groupQuery}`, signal);
    if (typeof j?.total === "number") return Number(j.total) || 0;
  } catch {}
  return 0;
}
async function getActionMailStatus(id, signal) {
  if (!id || id === "null" || id === "undefined") return { state: "N/A", mailSent: true };
  try {
    const j = await getJSON(`${API_BASE}/api/actions/${id}/status`, signal);
    return { state: j?.state, mailSent: j?.mailSent === true };
  } catch (e) {
    if (e.message.includes("404")) return { state: "expired", mailSent: true };
    return { state: "error", mailSent: false }; 
  }
}

async function getPrediction(baselineName, groupName) {
  try {
    const res = await postJSON(`${API_BASE}/api/predict/success`, { baselineName, groupName });
    return res.ok ? res : { ok: false, error: "Unknown error" };
  } catch (e) {
    console.warn("Prediction failed:", e);
    return { ok: false, error: e.message };
  }
}

const num = (v, d=0) => (Number.isFinite(Number(v)) ? Number(v) : d);
const pick = (o, k, d=undefined) => (o && o[k] !== undefined ? o[k] : d);
const isSuccess = (s) => /success|fixed|completed|succeeded|complete/i.test(String(s || ""));

function ConfirmationModal({ open, title, children, onClose, onConfirm, busy = false }) {
  if (!open) return null;
  return (
    <div className="modal show" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="box max-w-520" onClick={(e) => e.stopPropagation()}>
        <h3 className="kpi-modal-title">{title || "Confirm Action"}</h3>
        <div className="sub kpi-confirm-sub">{children}</div>
        <div className="flex-row justify-end gap-8 mt-10">
          <button type="button" className="btn" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="button" className="btn pri" onClick={onConfirm} disabled={busy}>{busy ? "Processing..." : "Confirm"}</button>
        </div>
      </div>
    </div>
  );
}

export default function PilotDecisionEngine({ 
  sbxDone = false, 
  pilotDone = false, 
  mode = "pilot", 
  readOnly = false,
  autoMail = false,
  lastActions = {},
  username,
  onOpenSnapshot, 
  onOpenClone     
}) {
  const { env, setEnv } = useEnvironment();
  const inProduction = String(mode).toLowerCase() === "production";

  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [enableEvaluate, setEnableEvaluate] = useState(false);
  const [enableTriggerPilot, setEnableTriggerPilot] = useState(false);
  const [evaluated, setEvaluated] = useState(false);
  const [decision, setDecision] = useState("Evaluate to see gate status…");

  const [snapshotDone, setSnapshotDone] = useState(false);
  const [cloneDone, setCloneDone]       = useState(false);
  const [validationReady, setValidationReady] = useState(false);

  const [showChg, setShowChg] = useState(false);
  const [chgNumber, setChgNumber] = useState("CHG");
  const [chgErr, setChgErr] = useState("");
  const [chgChecking, setChgChecking] = useState(false);
  const chgUpper = (chgNumber || "").toUpperCase();
  const chgIsValid = /^CHG/.test(chgUpper) && chgUpper.length > 3;
  const [requireChg, setRequireChg] = useState(true);
  const [chgValidated, setChgValidated] = useState(false);

  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [showUnlockConfirm, setShowUnlockConfirm] = useState(false); // NEW UNLOCK MODAL
  const [baselineWarning, setBaselineWarning] = useState(null);
  const [checkingBaseline, setCheckingBaseline] = useState(false);
  const [prediction, setPrediction] = useState(null);
  
  const [currentPage, setCurrentPage] = useState(1);
  const ITEMS_PER_PAGE = 5;

  const [sandbox, setSandbox] = useState({ success: 0, total: 0, rows: [] });
  const [counts, setCounts]   = useState({ reboot: 0, error1603: 0, critical: 0 });
  const [totalComputers, setTotalComputers] = useState(0);
  const [isPrevStageComplete, setIsPrevStageComplete] = useState(false);

  const userRole = sessionStorage.getItem("user_role") || "Admin";
  const isEUC = userRole === "EUC";

  const handleValidationChange = useCallback((isValid) => { setValidationReady(isValid); }, []);

  const [localPilotEnabled, setLocalPilotEnabled] = useState(env?.enablePilot !== false && String(env?.enablePilot) !== "false");
  const [localSandboxEnabled, setLocalSandboxEnabled] = useState(env?.enableSandbox !== false && String(env?.enableSandbox) !== "false");

  useEffect(() => {
    if (env?.enablePilot !== undefined) setLocalPilotEnabled(String(env.enablePilot) !== "false");
    if (env?.enableSandbox !== undefined) setLocalSandboxEnabled(String(env.enableSandbox) !== "false");
  }, [env?.enablePilot, env?.enableSandbox]);

  let isGateSatisfied = false;
  if (inProduction) {
      if (localPilotEnabled) isGateSatisfied = !!pilotDone;
      else if (localSandboxEnabled) isGateSatisfied = !!sbxDone;
      else isGateSatisfied = true;
  } else {
      if (localSandboxEnabled) isGateSatisfied = !!sbxDone;
      else isGateSatisfied = true;
  }

  const showResetToSandbox = !isEUC && localSandboxEnabled;
  const showResetToPilot = !isEUC && localPilotEnabled;

  useEffect(() => {
    const ctl = new AbortController();
    (async () => { 
        try { 
            const cfg = await getJSON(`${API_BASE}/api/config`, ctl.signal); 
            const c = cfg?.config ?? cfg; 
            if (typeof c?.requireChg === "boolean") setRequireChg(c.requireChg); 
            if (typeof c?.enablePilot === "boolean") setLocalPilotEnabled(c.enablePilot);
            if (typeof c?.enableSandbox === "boolean") setLocalSandboxEnabled(c.enableSandbox);
        } catch {} 
    })();
    return () => ctl.abort();
  }, []);

  useEffect(() => {
    const skippedPrevForProduction = inProduction && !localPilotEnabled && !localSandboxEnabled;
    const skippedPrevForPilot = !inProduction && !localSandboxEnabled;
    
    if ((skippedPrevForProduction || skippedPrevForPilot) && isGateSatisfied) {
       setEnableTriggerPilot(true);
       setIsPrevStageComplete(true);
       setDecision("Ready to trigger (Prior stages bypassed).");
    }
  }, [inProduction, localPilotEnabled, localSandboxEnabled, isGateSatisfied]);

  useEffect(() => {
    if (!isGateSatisfied || readOnly) { 
        setIsPrevStageComplete(false); setEnableEvaluate(false); return; 
    }

    let prevActionId;
    if (inProduction) {
      prevActionId = localPilotEnabled ? lastActions?.PILOT?.id : lastActions?.SANDBOX?.id;
    } else {
      prevActionId = lastActions?.SANDBOX?.id;
    }

    const skippedPrevForProduction = inProduction && !localPilotEnabled && !localSandboxEnabled;
    const skippedPrevForPilot = !inProduction && !localSandboxEnabled;
    if (skippedPrevForProduction || skippedPrevForPilot) return;

    if (!prevActionId) return; 

    if (isPrevStageComplete) { setEnableEvaluate(true); return; }

    let cancelled = false; let timer;
    async function poll() {
      if (cancelled) return;
      const { mailSent, state } = await getActionMailStatus(prevActionId);
      if (mailSent || String(state).toLowerCase() === "expired") { 
          if (cancelled) return; 
          setIsPrevStageComplete(true); setEnableEvaluate(true); 
          if (timer) clearInterval(timer); 
      }
    }
    
    poll(); timer = setInterval(poll, 30000); 
    return () => { cancelled = true; if (timer) clearInterval(timer); };
  }, [inProduction, lastActions, isPrevStageComplete, isGateSatisfied, readOnly, localPilotEnabled, localSandboxEnabled]);

  useEffect(() => {
    const onCounts = (e) => { 
        const d = e.detail || {}; 
        setCounts(c => ({ ...c, reboot: num(d.reboot, c.reboot), error1603: num(d.error1603, c.error1603) })); 
    };
    const onCritical = (e) => {
        const d = e.detail || {};
        setCounts(c => ({ ...c, critical: num(d.count, c.critical) }));
    };

    window.addEventListener("pilot:miscKpisUpdated", onCounts); 
    window.addEventListener("pilot:kpiCountsUpdated", onCounts);
    window.addEventListener("pilot:criticalHealthUpdated", onCritical);
    
    return () => { 
        window.removeEventListener("pilot:miscKpisUpdated", onCounts); 
        window.removeEventListener("pilot:kpiCountsUpdated", onCounts); 
        window.removeEventListener("pilot:criticalHealthUpdated", onCritical);
    };
  }, []);

  useEffect(() => { if (showConfirmModal) setCurrentPage(1); }, [showConfirmModal]);

  useEffect(() => {
    if (isEUC && isGateSatisfied && isPrevStageComplete) {
       setEnableTriggerPilot(true);
       setDecision("Ready to trigger (EUC Mode)");
    }
  }, [isEUC, isGateSatisfied, isPrevStageComplete]);

  async function refreshKpis() {
    if (refreshing) return; setRefreshing(true);
    const ab = new AbortController();
    try {
      let actionId, scopeGroup;
      if (inProduction) {
        actionId = localPilotEnabled ? lastActions?.PILOT?.id : lastActions?.SANDBOX?.id;
        scopeGroup = localPilotEnabled ? lastActions?.PILOT?.group : lastActions?.SANDBOX?.group;
      } else {
        actionId = lastActions?.SANDBOX?.id;
        scopeGroup = lastActions?.SANDBOX?.group;
      }

      if (!actionId) { setEnableEvaluate(false); setDecision("Loading previous stage data..."); return; }
      
      const results = await getActionResults(actionId, ab.signal);
      const rows = Array.isArray(results?.rows) ? results.rows : [];
      setSandbox({ success: num(pick(results, "success", rows.filter(r => isSuccess(r?.status)).length)), total: num(pick(results, "total", rows.length)), rows });
      
      const ch = await getCriticalHealth(scopeGroup, ab.signal);
      setCounts(c => ({ ...c, critical: num(ch?.count, 0) }));
      const tot = await getTotalComputersMaybe(scopeGroup, ab.signal); 
      if (tot > 0) setTotalComputers(tot);
      
      setTimeout(() => { window.dispatchEvent(new CustomEvent("pilot:requestKpiCounts")); }, 0);
      setEnableEvaluate(isGateSatisfied && isPrevStageComplete); setEnableTriggerPilot(false); setEvaluated(false); setDecision("Evaluate to see gate status…"); setChgValidated(false);
    } catch (e) { console.error("Refresh KPIs failed:", e); } finally { setRefreshing(false); }
  }

  function evaluateAndDecide() {
    if (!isGateSatisfied || !enableEvaluate || readOnly) return;
    
    let threshold = num(env?.successThreshold, 90); 
    let allowableCHF = num(env?.allowableCriticalHF, 0);

    const T = totalComputers > 0 ? totalComputers : Math.max(1, sandbox.total);
    const successPct = sandbox.total > 0 ? Math.round((sandbox.success / sandbox.total) * 100) : 0;
    
    if (sandbox.total === 0 && (counts.critical === undefined)) { setDecision("FAIL: No data loaded."); setEnableTriggerPilot(false); setEvaluated(true); return; }
    
    const okSuccess = successPct >= threshold; 
    const okHealth = (counts.critical || 0) <= allowableCHF;
    setEvaluated(true);
    
    if (okSuccess && okHealth) {
      setEnv(p => ({ ...p, [`${mode}Evaluated`]: true }));
      if (requireChg) { setDecision("PASS: Thresholds met. Validate CHG."); setShowChg(true); setChgErr(""); if (!chgNumber) setChgNumber("CHG"); setEnableTriggerPilot(false); } 
      else { setDecision("PASS: Thresholds met. Group Dropdown Unlocked."); setEnableTriggerPilot(true); }
    } else { 
      setEnv(p => ({ ...p, [`${mode}Evaluated`]: false }));
      setDecision(`FAIL: Thresholds not met (Success: ${successPct}%, Critical Fails: ${counts.critical}).`); 
      setEnableTriggerPilot(false); 
    }
  }

  async function submitChg(e) {
    e.preventDefault(); setChgErr(""); const cleaned = (chgUpper || "").trim();
    if (!(/^CHG/.test(cleaned) && cleaned.length > 3)) { setChgErr("Change number must start with CHG."); return; }
    try { 
        setChgChecking(true); 
        const url = `${API_BASE}/api/sn/change/validate?number=${encodeURIComponent(cleaned)}`; 
        const j = await getJSON(url); 
        if (j.ok !== true || j.implement !== true) { setChgErr(j?.message || "Validation failed."); return; } 
        setChgValidated(true); setShowChg(false); setEnableTriggerPilot(true); 
        setDecision(`CHG validated. Group Dropdown Unlocked.`); 
        setEnv(p => ({ ...p, [`${mode}Evaluated`]: true }));
    } catch (err) { setChgErr(err?.message || String(err)); } finally { setChgChecking(false); }
  }

  async function checkBaselineStatus() {
    const baseline = env?.baselineName || env?.baseline || ""; if (!baseline) return null;
    try { const resp = await postJSON(`${API_BASE.replace(/\/+$/, "")}/api/baseline/validate`, { baselineName: baseline }); if (resp.ok && resp.modified) return resp.warning; } catch (e) { console.warn("Baseline val failed:", e); } return null;
  }

  async function handleTriggerClick() {
    const canProceed = enableTriggerPilot || (isEUC && isGateSatisfied);
    if (!canProceed || busy || readOnly) return;
    if (requireChg && !chgValidated) { setShowChg(true); setChgErr(""); if (!chgNumber) setChgNumber("CHG"); return; }

    setCheckingBaseline(true); setBaselineWarning(null); setPrediction(null);
    const baseline = env?.baselineName || env?.baseline || "";
    const group = inProduction ? env?.prodGroup : env?.pilotGroup;

    const [warning, predResult] = await Promise.all([ checkBaselineStatus(), getPrediction(baseline, group) ]);
    if (warning) setBaselineWarning(warning);
    setPrediction(predResult && predResult.ok ? predResult : { error: true, analysis: "AI Service Connection Failed", details: [] });
    
    setCheckingBaseline(false); setShowConfirmModal(true);
  }

  async function executeTrigger() {
    const canProceed = enableTriggerPilot || (isEUC && isGateSatisfied);
    if (!canProceed || busy || readOnly) return;
    
    setShowConfirmModal(false); setBusy(true);
    try {
      const baselineName = env?.baselineName || env?.baseline || "";
      const groupName = inProduction ? (env?.prodGroup || "") : (env?.pilotGroup || "");
      const endpoint = inProduction ? (!requireChg ? "/api/production/actions/force" : "/api/production/actions") : (!requireChg ? "/api/pilot/actions/force" : "/api/pilot/actions");
      const payload = { baselineName, groupName, triggeredBy: username, environment: inProduction ? "Production" : "Pilot", autoMail: !!autoMail, patchWindow: { days: env?.patchWindowDays||0, hours: env?.patchWindowHours||0, minutes: env?.patchWindowMinutes||0 } };
      if (requireChg && chgValidated) { payload.chgNumber = chgUpper; payload.requireChg = true; } else { payload.requireChg = false; }
      
      const trig = await postJSON(`${API_BASE}${endpoint}`, payload);
      window.dispatchEvent(new CustomEvent("pilot:kpiRefreshed", { detail: { ts: Date.now() } }));
      setEnableTriggerPilot(false); setDecision(`${inProduction ? "Production" : "Pilot"} triggered. Action ${trig?.actionId || "?"}.`);
      
      window.dispatchEvent(new CustomEvent(inProduction ? "production:triggered" : "pilot:triggered", { detail: { actionId: trig?.actionId, group: groupName } }));
    } catch (e) { setDecision(`Trigger failed: ${e?.message || e}`); } finally { setBusy(false); }
  }

  function resetToSandbox() { window.dispatchEvent(new CustomEvent("orchestrator:resetToSandbox")); }
  function resetToPilot()   { window.dispatchEvent(new CustomEvent("orchestrator:resetToPilot")); }
  const handleSnapshotClick = () => { if (onOpenSnapshot) onOpenSnapshot(); setSnapshotDone(true); };
  const handleCloneClick = () => { if (onOpenClone) onOpenClone(); setCloneDone(true); };

  const baselineToConfirm = env?.baselineName || env?.baseline || "N/A";
  const targetGroup = inProduction ? env?.prodGroup : env?.pilotGroup;
  const needsBackup = env?.snapshotVM || env?.cloneVM; const isTriggerBlocked = needsBackup && !validationReady;

  const currentItems = useMemo(() => {
    if (!prediction?.details) return [];
    const idxLast = currentPage * ITEMS_PER_PAGE;
    const idxFirst = idxLast - ITEMS_PER_PAGE;
    return prediction.details.slice(idxFirst, idxLast);
  }, [prediction, currentPage]);

  const totalPages = prediction?.details ? Math.ceil(prediction.details.length / ITEMS_PER_PAGE) : 0;

  const canTrigger = enableTriggerPilot || (isEUC && isGateSatisfied);
  const isTriggerDisabled = !isGateSatisfied || !canTrigger || busy || readOnly || isTriggerBlocked;

  return (
    <section className="card reveal" data-reveal style={{ marginBottom: 0 }}>
      <h2>Decision Engine</h2>
      {!isGateSatisfied && <div className="sub" style={{ marginBottom: 10, color: "#8a8fa3" }}>
        {inProduction 
          ? (localPilotEnabled ? "🔒 Pilot stage must be triggered first." : "🔒 Sandbox stage must be triggered first.") 
          : "🔒 Complete Sandbox stage first."}
      </div>}
      {readOnly && <div className="sub" style={{ marginBottom: 10, color: "#8a8fa3" }}>View-only: stage advanced.</div>}

      <div className="decision" style={{ marginBottom: 12 }}>
        <span className={`tag ${evaluated ? (enableTriggerPilot || chgValidated ? "pass" : "fail") : "hold"}`}>{evaluated ? (enableTriggerPilot || chgValidated ? "PASS" : "FAIL") : "HOLD"}</span>
        <span style={{ marginLeft: 10 }}>{decision}</span>
      </div>

      {!isEUC && (
        <div style={{background:"#f8fafc", padding:12, borderRadius:8, marginBottom:16, display:"flex", flexWrap: "wrap", gap:12, alignItems:"center", border:"1px solid #e2e8f0"}}>
          <strong style={{color:"#64748b", fontSize:13, textTransform:"uppercase"}}>VM Actions:</strong>
          <button className="btn outline small" onClick={handleSnapshotClick} disabled={!env.snapshotVM || !isGateSatisfied}>{snapshotDone ? "Snapshot Done ✓" : "Take Snapshot"}</button>
          <button className="btn outline small" onClick={handleCloneClick} disabled={!env.cloneVM || !isGateSatisfied}>{cloneDone ? "Clone Done ✓" : "Clone VMs"}</button>
          <span style={{fontSize:12, color:"#888", marginLeft:"auto"}}>Target: <strong>{targetGroup || "None"}</strong></span>
        </div>
      )}

      {needsBackup && isGateSatisfied && <ValidationGate targetGroupName={targetGroup} onValidationChange={handleValidationChange} />}

      <div className="row" style={{ gap: 8, flexWrap: "wrap", display: 'flex' }}>
        <button className="btn outline small" onClick={refreshKpis} disabled={refreshing}>{refreshing ? "Refreshing…" : ""}
<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16"><path d="M23 4v6h-6"></path><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path></svg>        </button>
        
        {!isEUC && (
          <button className="btn outline ok" onClick={evaluateAndDecide} disabled={!isGateSatisfied || !enableEvaluate || readOnly}>Evaluate &amp; Approve</button>
        )}
        
        {/* UNLOCK OVERRIDE BUTTON */}
        {evaluated && !enableTriggerPilot && !chgValidated && !readOnly && !isEUC && (
           <button className="btn outline amber" onClick={() => setShowUnlockConfirm(true)}>Unlock Settings</button>
        )}

        <button 
            className="btn outline small" 
            onClick={handleTriggerClick} 
            disabled={isTriggerDisabled} 
            title={isTriggerBlocked ? "Complete Validation first" : "Trigger"}
        >
          {busy ? "Triggering…" : checkingBaseline ? "AI Analysis..." : (inProduction ? "Trigger Production" : "Trigger Pilot")}
        </button>

        {isEUC && (
          <button 
              className="btn outline dan" 
              onClick={() => window.dispatchEvent(new CustomEvent("orchestrator:resetAll"))}
              title="Reset the entire flow back to Configuration"
          >
              Reset Deployment Flow
          </button>
        )}

        {!inProduction && showResetToSandbox && <button className="btn outline dan" onClick={resetToSandbox} disabled={!isPrevStageComplete}>Reset to Sandbox</button>}
        
        {inProduction && (
          <>
            {showResetToPilot && <button className="btn outline small" onClick={resetToPilot} disabled={!isPrevStageComplete}>Reset to Pilot</button>}
            {showResetToSandbox && <button className="btn outline dan" onClick={resetToSandbox} disabled={!isPrevStageComplete}>Reset to Sandbox</button>}
          </>
        )}
      </div>

      {showUnlockConfirm && (
        <ConfirmationModal
          open={showUnlockConfirm}
          title="Override Configuration Limits"
          onClose={() => setShowUnlockConfirm(false)}
          onConfirm={() => {
             setEnv(p => ({ ...p, [`${mode}Unlocked`]: true }));
             setShowUnlockConfirm(false);
          }}
        >
          <p style={{ marginTop: 0 }}>The evaluation failed to meet the configured thresholds.</p>
          <p style={{ marginTop: '10px' }}>Do you want to forcefully unlock and modify the configuration (Baseline, Group, Thresholds) for this stage?</p>
          <p className="muted-text text-12" style={{ marginTop: '10px' }}>Note: To completely abandon this deployment and start over, we recommend using the <strong>Reset to Sandbox</strong> button instead.</p>
        </ConfirmationModal>
      )}

      {showChg && (
        <div className="modal show" role="dialog" aria-modal="true">
          <div className="box" style={{ maxWidth: 520 }}>
            <h3>Enter Change Number</h3>
            <form onSubmit={submitChg}>
              <div className="field"><input type="text" className="input" placeholder="CHG123456" value={chgNumber} onChange={(e) => { setChgNumber(e.target.value); setChgErr(""); }} autoFocus /></div>
              {!!chgErr && <div className="sub" style={{ color: "var(--danger)", marginTop: 4 }}>{chgErr}</div>}
              <div className="row" style={{ justifyContent: "flex-end", gap: 8, marginTop: 10 }}>
                <button type="button" className="btn" onClick={() => setShowChg(false)} disabled={chgChecking}>Cancel</button>
                <button type="submit" className="btn primary" disabled={!chgIsValid || chgChecking}>{chgChecking ? "Validating…" : "Validate"}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showConfirmModal && (
        <div className="modal show" role="dialog" aria-modal="true">
          <div className="box" style={{ maxWidth: 800, width: '90%' }}>
            <h3 style={{color: 'var(--primary)', marginBottom: 20}}>Confirm Action</h3>
            
            {prediction && (
                <div style={{
                    background: prediction.error ? '#fef2f2' : (prediction.probability > 80 ? '#ecfdf5' : '#fffbeb'),
                    border: `1px solid ${prediction.error ? '#f87171' : (prediction.probability > 80 ? '#6ee7b7' : '#fcd34d')}`,
                    borderRadius: 8, padding: 16, marginBottom: 16
                }}>
                    <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:8}}>
                        <strong style={{fontSize: 16, color: prediction.error ? '#dc2626' : (prediction.probability > 80 ? '#065f46' : '#92400e')}}>
                            {prediction.error ? "AI Service Error" : `Predicted Success Rate: ${prediction.probability}%`}
                        </strong>
                        <span style={{fontSize:24}}>{prediction.error ? '⚠️' : (prediction.probability > 80 ? '🤖✅' : '🤖⚠️')}</span>
                    </div>
                </div>
            )}

            {prediction && !prediction.error && prediction.details && prediction.details.length > 0 && (
                <>
                  <div style={{ border: '1px solid #e5e7eb', borderRadius: 8, marginBottom: 16, overflow: 'hidden', overflowX: 'auto' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 400 }}>
                          <thead style={{ background: '#f9fafb' }}>
                              <tr>
                                  <th style={{ padding: '10px 12px', textAlign: 'left', color: '#6b7280', borderBottom: '1px solid #e5e7eb' }}>Action Name</th>
                                  <th style={{ padding: '10px 12px', textAlign: 'left', color: '#6b7280', borderBottom: '1px solid #e5e7eb' }}>Target Computer</th>
                                  <th style={{ padding: '10px 12px', textAlign: 'left', color: '#6b7280', borderBottom: '1px solid #e5e7eb' }}>Outcome</th>
                                  <th style={{ padding: '10px 12px', textAlign: 'right', color: '#6b7280', borderBottom: '1px solid #e5e7eb' }}>Success Rate</th>
                              </tr>
                          </thead>
                          <tbody>
                              {currentItems.map((row, idx) => (
                                  <tr key={idx} style={{ borderBottom: '1px solid #f3f4f6' }}>
                                      <td style={{ padding: '10px 12px', color: '#111827', fontWeight: 500 }}>{row.action}</td>
                                      <td style={{ padding: '10px 12px', color: '#374151' }}>{row.computer}</td>
                                      <td style={{ padding: '10px 12px' }}>
                                          <span style={{ 
                                              background: row.rate > 80 ? '#dcfce7' : '#fee2e2', 
                                              color: row.rate > 80 ? '#166534' : '#991b1b',
                                              padding: '2px 8px', borderRadius: 12, fontSize: 11, fontWeight: 700 
                                          }}>
                                              {row.outcome}
                                          </span>
                                      </td>
                                      <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 600, color: row.rate > 80 ? '#059669' : '#d97706' }}>
                                          {row.rate}%
                                      </td>
                                  </tr>
                              ))}
                          </tbody>
                      </table>
                  </div>

                  {totalPages > 1 && (
                    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '12px', marginBottom: '20px' }}>
                      <button 
                        className="btn" 
                        onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                        disabled={currentPage === 1}
                        style={{ padding: '4px 12px', fontSize: '13px' }}
                      >
                        Previous
                      </button>
                      <span style={{ fontSize: '13px', color: '#6b7280' }}>
                        Page {currentPage} of {totalPages}
                      </span>
                      <button 
                        className="btn" 
                        onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                        disabled={currentPage === totalPages}
                        style={{ padding: '4px 12px', fontSize: '13px' }}
                      >
                        Next
                      </button>
                    </div>
                  )}
                </>
            )}

            {baselineWarning && (
              <div className="banner error" style={{ marginBottom: 16 }}>
                <strong>⚠️ Baseline Modified</strong>
                <div style={{ marginTop: 4 }}>{baselineWarning}</div>
              </div>
            )}
            
            <div className="sub" style={{ fontSize: 14, lineHeight: 1.6, margin: '16px 0' }}>
              Baseline: <strong>{baselineToConfirm}</strong><br/>
              Target: <strong>{targetGroup}</strong><br/>
              {chgValidated && <span>Change Number: <strong>{chgUpper}</strong></span>}
            </div>
            
            <div className="row" style={{ justifyContent: "flex-end", gap: 8 }}>
              <button type="button" className="btn" onClick={() => setShowConfirmModal(false)} disabled={busy}>Cancel</button>
              <button type="button" className="btn pri" onClick={executeTrigger} disabled={busy}>
                {busy ? "Triggering..." : "Confirm & Trigger"}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}