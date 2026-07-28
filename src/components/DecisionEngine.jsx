// src/components/DecisionEngine.jsx
import { useState, useEffect } from "react";
import PropTypes from "prop-types";
import { useEnvironment } from "./Environment.jsx";
import InlineSpinner from "./common/InlineSpinner";

// FIX: Restored the correct backend port fallback to prevent Vite 404 errors
const API_BASE = globalThis.env?.VITE_API_BASE || "http://localhost:5174";

export default function DecisionEngine({
  apiBase = API_BASE,
  baseline = "",
  group = "",
  autoMail = false,
  onDone = () => {},
  disabled = false,
  username = "",
  onFinish = () => {},
  onReset = () => {},
  currentActions = [],
  stageFinished = false
}) {
  const { env } = useEnvironment();
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [isComplete, setIsComplete] = useState(false);

  const [checkingBaseline, setCheckingBaseline] = useState(false);
  const [baselineWarnings, setBaselineWarnings] = useState([]); 

  let validDeployments = (env.sandboxDeployments || []).filter(d => d.baseline && d.group);
  if (validDeployments.length === 0 && baseline && group) {
      validDeployments = [{ baseline, group }];
  }

  useEffect(() => {
    if (!disabled || currentActions.length === 0) {
      setIsComplete(false);
      return;
    }
    let cancelled = false;
    let timer;
    async function poll() {
      if (cancelled) return;
      let allDone = true;
      for (const act of currentActions) {
        try {
          const r = await fetch(`${apiBase.replace(/\/$/, "")}/api/actions/${act.actionId}/status`, { 
            headers: { "x-user-role": sessionStorage.getItem("user_role") || "Admin" }
          });
          if (r.status === 404) continue; // 404 means expired/deleted
          const text = await r.text();
          let j;
          try { j = JSON.parse(text); } catch { allDone = false; break; }
          const st = String(j?.state || "").toLowerCase();
          if (st !== "expired" && st !== "stopped") { allDone = false; break; }
        } catch (e) {
          console.warn("Poll error", e);
          allDone = false; break;
        }
      }
      if (allDone && !cancelled) {
        setIsComplete(true);
        if (timer) clearInterval(timer);
      }
    }
    poll();
    timer = setInterval(poll, 15000); 
    return () => { cancelled = true; if (timer) clearInterval(timer); };
  }, [disabled, currentActions, apiBase]);

  async function checkBaselineStatus() {
    if (validDeployments.length === 0) return [];
    const warnings = [];
    try {
      const uniqueBaselines = [...new Set(validDeployments.map(d => d.baseline))];
      for (const b of uniqueBaselines) {
          const resp = await fetch(`${apiBase.replace(/\/$/, "")}/api/baseline/validate`, {
              method: "POST",
              headers: { "Content-Type": "application/json", "x-user-role": sessionStorage.getItem("user_role") || "Admin" },
              body: JSON.stringify({ baselineName: b })
          });
          const text = await resp.text();
          let j = {};
          try { j = JSON.parse(text); } catch { /* ignore HTML errors */ }
          if (resp.ok && j.modified) warnings.push(`[${b}]: ${j.warning}`);
      }
    } catch (e) { console.warn("Baseline val failed:", e); }
    return warnings;
  }

  async function handleTriggerClick() {
    if (disabled || busy || validDeployments.length === 0) return;
    setCheckingBaseline(true);
    setBaselineWarnings([]);
    const warnings = await checkBaselineStatus();
    if (warnings && warnings.length > 0) setBaselineWarnings(warnings);
    setCheckingBaseline(false);
    setShowConfirmModal(true);
  }

  async function executeTrigger() {
    if (disabled || busy || validDeployments.length === 0) return;
    setShowConfirmModal(false);
    setBusy(true);
    setStatus("Triggering sandbox deployment...");
    try {
      const payload = {
        deployments: validDeployments,
        triggeredBy: username,
        environment: "Sandbox",
        autoMail: !!autoMail,
        patchWindow: { days: env?.patchWindowDays || 0, hours: env?.patchWindowHours || 0, minutes: env?.patchWindowMinutes || 0 }
      };
      
      const r = await fetch(`${apiBase.replace(/\/$/, "")}/api/actions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-user-role": sessionStorage.getItem("user_role") || "Admin" },
        body: JSON.stringify(payload)
      });
      
      const text = await r.text();
      let j;
      try {
        j = JSON.parse(text);
      } catch {
        throw new Error(`Server error (HTTP ${r.status}). Please check backend logs.`);
      }

      if (!r.ok || j?.ok === false) throw new Error(j?.error || j?.message || `HTTP ${r.status}`);

      setStatus("Sandbox triggered successfully.");
      if (onDone) onDone({ ok: true, actions: j.actions });
    } catch (e) {
      setStatus(`Trigger failed: ${e.message}`);
    } finally {
      setBusy(false);
    }
  }

  // S3800 Fix: Standardized return type (always returning a React Fragment)
  const getTriggerButtonContent = () => {
    if (busy) return <><InlineSpinner size={14} variant="dark" /><span>Triggering...</span></>;
    if (checkingBaseline) return <><InlineSpinner size={14} variant="dark" /><span>Checking...</span></>;
    return <><span>Trigger Sandbox</span></>;
  };

  // S3358 & S7735 Fix: Cleaned up logic out of inline ternaries
  const renderControls = () => {
    if (!disabled) {
        return (
            <button type="button" className="btn outline small" onClick={handleTriggerClick} disabled={checkingBaseline || validDeployments.length === 0} title={validDeployments.length === 0 ? "Select a baseline and group first" : "Trigger Sandbox"} style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              {getTriggerButtonContent()}
            </button>
        );
    }
    if (stageFinished) {
        return <div style={{ color: 'var(--muted)', fontSize: '13px', fontWeight: 600 }}>Stage Locked</div>;
    }
    return (
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            {!isComplete && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginRight: '8px', color: 'var(--muted)', fontSize: '13px', fontWeight: 600 }}>
                    <InlineSpinner size={14} variant="dark" /> Actions Running
                </div>
            )}
            <button type="button" className="btn outline dan small" onClick={onReset} disabled={!isComplete}>Reset Sandbox</button>
            <button type="button" className="btn pri small" onClick={onFinish} disabled={!isComplete}>Finish Stage</button>
        </div>
    );
  };

  return (
    <>
      <section className="card reveal" id="card-decision" data-reveal>
        <div className="de-header-row">
          <h2>Decision Engine</h2>
          {renderControls()}
        </div>

        <div className="sub de-sub-top">
          {disabled && <span className="pill green de-view-only-pill">Action Triggered</span>}
        </div>

        <div className="sub de-sub-top">
          {disabled && <span className="pill blue de-view-only-pill">View Only</span>}
        </div>

        {status && <div className="de-status-msg">{status}</div>}

        <div className="sub de-sub-bottom">
          Sandbox → Pilot → Production. Trigger Pilot only in Pilot stage.
          Promote after Evaluate.
        </div>
      </section>

      {showConfirmModal && (
        <div className="modal show" role="presentation" onMouseDown={() => setShowConfirmModal(false)} tabIndex={-1}>
          <div className="box chg-modal-box" onMouseDown={(e) => e.stopPropagation()} role="presentation">
            <h3 className="de-modal-title" style={{ marginTop: 0 }}>Confirm Trigger Sandbox</h3>
            
            {baselineWarnings.length > 0 && (
              <div className="banner error de-warning-banner">
                <strong>⚠️ Baselines Modified</strong>
                <div className="baseline-warning-text">
                    {baselineWarnings.map((w) => <div key={w}>{w}</div>)}
                </div>
              </div>
            )}
            
            <div className="sub de-confirm-info">
              You are about to trigger the following deployments:
              <ul style={{ paddingLeft: '20px', marginTop: '12px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                 {validDeployments.map((d) => (
                     <li key={`${d.baseline}-${d.group}`}>
                        <strong style={{ color: 'var(--text)' }}>{d.baseline}</strong><br/>
                        <span style={{ color: 'var(--muted)', display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                           <span>➔</span> <strong>{d.group}</strong>
                        </span>
                     </li>
                 ))}
              </ul>
            </div>
            
            <div className="row de-modal-footer" style={{ marginTop: '24px' }}>
              <button type="button" className="btn" onClick={() => setShowConfirmModal(false)} disabled={busy}>Cancel</button>
              <button type="button" className="btn pri" onClick={executeTrigger} disabled={busy} style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                {busy ? <><InlineSpinner size={14} variant="light" /><span>Triggering...</span></> : <><span>Confirm & Trigger</span></>}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// FIX: Added Props Validation (S6774)
DecisionEngine.propTypes = {
  apiBase: PropTypes.string,
  baseline: PropTypes.string,
  group: PropTypes.string,
  autoMail: PropTypes.bool,
  onDone: PropTypes.func,
  disabled: PropTypes.bool,
  username: PropTypes.string,
  onFinish: PropTypes.func,
  onReset: PropTypes.func,
  currentActions: PropTypes.array,
  stageFinished: PropTypes.bool
};