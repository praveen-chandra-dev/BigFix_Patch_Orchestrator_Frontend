import { useEffect, useMemo, useState } from "react";
import { useEnvironment } from "../Environment.jsx";

/* ---------------- API helpers (unchanged) ---------------- */
const API_BASE =
  (import.meta.env && import.meta.env.VITE_API_BASE) || "http://localhost:5174";

async function getJSON(url, signal) {
  const r = await fetch(url, { headers: { Accept: "application/json" }, cache: "no-store", signal });
  const t = await r.text();
  if (!r.ok) throw new Error(`HTTP ${r.status}: ${t.slice(0, 400)}`);
  return JSON.parse(t);
}
async function postJSON(url, body) {
  const r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(body),
  });
  const t = await r.text();
  let j; try { j = JSON.parse(t); } catch { throw new Error(`Unexpected response: ${t.slice(0, 400)}`); }
  if (!r.ok || j?.ok === false) throw new Error(j?.error || j?.message || `HTTP ${r.status}`);
  return j;
}
async function getLatestActionId(signal) {
  const j = await getJSON(`${API_BASE}/api/actions/last`, signal);
  return j?.actionId ?? null;
}
async function getActionResults(id, signal) {
  if (!id) return { actionId: null, total: 0, success: 0, rows: [] };
  const j = await getJSON(`${API_BASE}/api/actions/${id}/results`, signal);
  return { actionId: id, ...j };
}
async function getCriticalHealth(signal) {
  return getJSON(`${API_BASE}/api/health/critical`, signal);
}
async function getTotalComputersMaybe(signal) {
  try {
    const j = await getJSON(`${API_BASE}/api/infra/total-computers`, signal);
    if (typeof j?.total === "number") return Number(j.total) || 0;
  } catch {}
  return 0;
}

/* ---------------- small utils ---------------- */
const num = (v, d=0) => (Number.isFinite(Number(v)) ? Number(v) : d);
const pick = (o, k, d=undefined) => (o && o[k] !== undefined ? o[k] : d);

/**
 * Props:
 * - sbxDone   : boolean — Sandbox completed (required for Pilot)
 * - pilotDone : boolean — Pilot completed (required for Production)
 * - mode      : "pilot" | "production" (default "pilot")
 * - readOnly  : boolean — when true, all action buttons are disabled (view-only)
 */
export default function PilotDecisionEngine({ sbxDone = false, pilotDone = false, mode = "pilot", readOnly = false }) {
  const { env } = useEnvironment();

  const inProduction = String(mode).toLowerCase() === "production";
  const gateSatisfied = inProduction ? !!pilotDone : !!sbxDone;

  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const [enableEvaluate, setEnableEvaluate] = useState(false);
  const [enableTriggerPilot, setEnableTriggerPilot] = useState(false);

  const [evaluated, setEvaluated] = useState(false);
  const [decision, setDecision] = useState("Evaluate to see gate status…");

  const [showChg, setShowChg] = useState(false);
  const [chgNumber, setChgNumber] = useState("CHG");
  const [chgErr, setChgErr] = useState("");
  const [chgChecking, setChgChecking] = useState(false);

  const [sandbox, setSandbox] = useState({ success: 0, total: 0, rows: [] });
  const [counts, setCounts]   = useState({ reboot: 0, error1603: 0, critical: 0 });
  const [totalComputers, setTotalComputers] = useState(0);

  // Track when production has actually been triggered to enable Reset button
  const [prodTriggered, setProdTriggered] = useState(false);

  /* ---------- accept KPI counts from other widgets ---------- */
  useEffect(() => {
    const onCounts = (e) => {
      const d = e.detail || {};
      const reboot = num(d.reboot, counts.reboot);
      const error1603 = num(d.error1603, counts.error1603);
      setCounts((c) => ({ ...c, reboot, error1603 }));
      window.__pilotCache = window.__pilotCache || {};
      window.__pilotCache.miscKpis = { reboot, error1603 };
      window.__pilotCache.kpiCounts = { reboot, error1603 };
    };
    window.addEventListener("pilot:miscKpisUpdated", onCounts);
    window.addEventListener("pilot:kpiCountsUpdated", onCounts);
    return () => {
      window.removeEventListener("pilot:miscKpisUpdated", onCounts);
      window.removeEventListener("pilot:kpiCountsUpdated", onCounts);
    };
  }, [counts.reboot, counts.error1603]);

  function syncCountsFromCache() {
    const cache = window.__pilotCache || {};
    const src = cache.miscKpis || cache.kpiCounts || {};
    const reboot = num(src.reboot, counts.reboot);
    const error1603 = num(src.error1603, counts.error1603);
    setCounts((c) => ({ ...c, reboot, error1603 }));
  }

  /* ---------- one button refresh ---------- */
  async function refreshKpis() {
    if (refreshing) return;
    setRefreshing(true);
    const ab = new AbortController();

    try {
      const actionId = await getLatestActionId(ab.signal);
      const results = await getActionResults(actionId, ab.signal);
      const rows = Array.isArray(results?.rows) ? results.rows : [];
      const success = num(pick(results, "success", rows.filter(r => /success/i.test(r?.status || "")).length));
      const total = num(pick(results, "total", rows.length));
      const sandboxPayload = { actionId: results?.actionId ?? actionId ?? null, total, success, rows };
      setSandbox({ success, total, rows });

      const ch = await getCriticalHealth(ab.signal);
      const healthPayload = { count: num(ch?.count, 0), rows: Array.isArray(ch?.rows) ? ch.rows : [] };
      setCounts((c) => ({ ...c, critical: healthPayload.count }));

      const tot = await getTotalComputersMaybe(ab.signal);
      if (tot > 0) setTotalComputers(tot);

      setTimeout(() => {
        window.dispatchEvent(new CustomEvent("pilot:requestKpiCounts"));
      }, 0);
      syncCountsFromCache();
      let tries = 0;
      const timer = setInterval(() => {
        tries += 1;
        syncCountsFromCache();
        if (tries >= 6) clearInterval(timer);
      }, 500);
      setTimeout(() => {
        setCounts((prev) => {
          if (prev.reboot > 0 || prev.error1603 > 0) return prev;
          const scan = (r) => {
            const s = `${r?.status || ""} ${r?.Status || ""} ${r?.PatchName || ""} ${r?.patch || ""} ${r?.notes || ""}`.toLowerCase();
            return {
              reboot: /reboot/.test(s),
              e1603: /1603/.test(s),
            };
          };
          let reboot = 0, error1603 = 0;
          try {
            reboot   = rows.reduce((a, r) => a + (scan(r).reboot ? 1 : 0), 0);
            error1603 = rows.reduce((a, r) => a + (scan(r).e1603 ? 1 : 0), 0);
          } catch {}
          return { ...prev, reboot, error1603 };
        });
      }, 3200);

      window.__pilotCache = window.__pilotCache || {};
      window.__pilotCache.sandboxResults = sandboxPayload;
      window.__pilotCache.criticalHealth = healthPayload;
      if (tot > 0) window.__pilotCache.totals = { computers: tot };

      window.dispatchEvent(new CustomEvent("pilot:sandboxResultsUpdated", { detail: sandboxPayload }));
      window.dispatchEvent(new CustomEvent("pilot:criticalHealthUpdated", { detail: healthPayload }));
      if (tot > 0) {
        window.dispatchEvent(new CustomEvent("pilot:totalsUpdated", { detail: { totalComputers: tot } }));
      }
      window.dispatchEvent(new CustomEvent("pilot:kpiRefreshed", { detail: { ts: Date.now() } }));

      if (gateSatisfied) {
        setEnableEvaluate(true);
        setEnableTriggerPilot(false);
        setEvaluated(false);
        setDecision("Evaluate to see gate status…");
      } else {
        setEnableEvaluate(false);
        setEnableTriggerPilot(false);
        setEvaluated(false);
        setDecision("Evaluate to see gate status…");
      }
    } catch (e) {
      console.error("Refresh KPIs failed:", e);
    } finally {
      setRefreshing(false);
    }
  }

  /* --------- derived KPI % using your rules (unchanged) --------- */
  const derived = useMemo(() => {
    const T = totalComputers > 0 ? totalComputers : Math.max(1, sandbox.total);
    const successPct = sandbox.total > 0 ? Math.round((sandbox.success / sandbox.total) * 100) : 0;
    const rebootPct  = Math.round(((T - (counts.reboot   || 0)) / T) * 100);
    const errorPct   = Math.round(((T - (counts.error1603|| 0)) / T) * 100);
    const healthPct  = Math.round(((T - (counts.critical || 0)) / T) * 100);
    return { T, successPct, rebootPct, errorPct, healthPct };
  }, [sandbox.success, sandbox.total, totalComputers, counts.reboot, counts.error1603, counts.critical]);

  /* ---------- evaluate & decide (unchanged) ---------- */
  function evaluateAndDecide() {
    if (!gateSatisfied || !enableEvaluate || readOnly) return;

    const threshold = num(env?.successThreshold, 90);
    const allowableCHF = num(env?.allowableCriticalHF, 0);

    const okSuccess = derived.successPct >= threshold;
    const okReboot  = derived.rebootPct  >= threshold;
    const okError   = derived.errorPct   >= threshold;
    const okHealth  = derived.healthPct  >= threshold;
    const okCHF     = (counts.critical || 0) <= allowableCHF;

    const allGood = okSuccess && okReboot && okError && okHealth && okCHF;

    setEvaluated(true);

    if (allGood) {
      setDecision("PASS: Meets thresholds. Please enter CHG Number to proceed.");
      setShowChg(true);
      setChgErr("");
      if (!chgNumber) setChgNumber("CHG");
      setEnableTriggerPilot(false);
    } else {
      setDecision(`FAIL: One or more thresholds not met. You may trigger ${inProduction ? "Production" : "Pilot"} manually.`);
      setEnableTriggerPilot(true);
    }
  }

  /* ---------- CHG flow (validate + TRIGGER) (APIs unchanged) ---------- */
  const chgUpper = (chgNumber || "").toUpperCase();
  const chgIsValid = /^CHG/.test(chgUpper) && chgUpper.length > 3;

  async function submitChg(e) {
    e.preventDefault();
    setChgErr("");
    if (!chgIsValid) {
      setChgErr("Change number must start with CHG.");
      return;
    }
    const cleaned = chgUpper.trim();

    try {
      setChgChecking(true);
      const url = `${API_BASE}/api/sn/change/validate?number=${encodeURIComponent(cleaned)}`;
      const r = await fetch(url, { headers: { Accept: "application/json" }, cache: "no-store" });
      const t = await r.text();
      let j;
      try { j = JSON.parse(t); } catch { throw new Error(`Unexpected response: ${t.slice(0, 400)}`); }
      if (!r.ok) throw new Error(j?.error || `HTTP ${r.status}`);

      if (j.ok !== true || j.implement !== true) {
        if (j?.code === "NOT_IMPLEMENT") {
          const current = j?.record?.state ? ` (Current state: ${j.record.state})` : "";
          setChgErr(`Change Request is not at Implement stage.${current}`);
          return;
        }
        if (j?.code === "NOT_FOUND_OR_FORBIDDEN") {
          setChgErr(j?.message || "Change Request doesn't exist or user doesn't have required privileges.");
          return;
        }
        const st = j?.record?.state;
        if (st && !/^implement$/i.test(String(st))) {
          setChgErr(`Change Request is not at Implement stage. (Current state: ${st})`);
          return;
        }
        setChgErr(j?.message || "Change validation failed.");
        return;
      }

      const baselineName = env?.baselineName || env?.baseline || env?.baseline_title || "";
      const pilotGroup   = env?.pilotGroup   || env?.groupName || env?.pilot_group || "";
      if (!baselineName || !pilotGroup) {
        setChgErr("Baseline or Pilot Group not configured in Environment.");
        return;
      }

      const trig = await postJSON(`${API_BASE}/api/pilot/actions`, {
        baselineName,
        groupName: pilotGroup,
        chgNumber: cleaned,
        requireChg: true,
      });

      window.dispatchEvent(new CustomEvent("pilot:kpiRefreshed", { detail: { ts: Date.now() } }));
      setShowChg(false);
      setEnableTriggerPilot(false);
      setDecision(`${inProduction ? "Production" : "Pilot"} triggered (Action ${trig?.actionId || "?"}) with ${cleaned}.`);

      // announce transitions
      if (!inProduction) {
        // Moving Pilot -> Production
        window.dispatchEvent(new CustomEvent("pilot:triggered"));
        window.dispatchEvent(new CustomEvent("flow:navigate", { detail: { stage: "production" } }));
      } else {
        // Production actually triggered; allow reset
        setProdTriggered(true);
        window.dispatchEvent(new CustomEvent("production:triggered"));
      }
    } catch (err) {
      setChgErr(err?.message || String(err));
    } finally {
      setChgChecking(false);
    }
  }

  /* ---------- FORCE trigger when evaluation failed (APIs unchanged) ---------- */
  async function triggerPilot() {
    if (!enableTriggerPilot || busy || readOnly) return;
    setBusy(true);
    try {
      const baselineName = env?.baselineName || env?.baseline || env?.baseline_title || "";
      const pilotGroup   = env?.pilotGroup   || env?.groupName || env?.pilot_group || "";

      if (!baselineName || !pilotGroup) {
        setDecision("Baseline or Pilot Group not configured in Environment.");
        return;
      }

      const trig = await postJSON(`${API_BASE}/api/pilot/actions/force`, {
        baselineName,
        groupName: pilotGroup,
      });

      window.dispatchEvent(new CustomEvent("pilot:kpiRefreshed", { detail: { ts: Date.now() } }));
      setEnableTriggerPilot(false);
      setDecision(`${inProduction ? "Production" : "Pilot"} triggered (forced). Action ${trig?.actionId || "?"}.`);

      if (!inProduction) {
        window.dispatchEvent(new CustomEvent("pilot:triggered"));
        window.dispatchEvent(new CustomEvent("flow:navigate", { detail: { stage: "production" } }));
      } else {
        setProdTriggered(true);
        window.dispatchEvent(new CustomEvent("production:triggered"));
      }
    } catch (e) {
      setDecision(`Trigger ${inProduction ? "Production" : "Pilot"} failed: ${e?.message || e}`);
    } finally {
      setBusy(false);
    }
  }

  /* ---------- Reset to Sandbox (Production only, enabled after trigger) ---------- */
  function resetToSandbox() {
    if (!inProduction || !prodTriggered) return;
    // Ask App to fully reset locks + navigate
    window.dispatchEvent(new CustomEvent("orchestrator:resetToSandbox"));
  }

  const triggerLabel = inProduction ? "Trigger Production" : "Trigger Pilot";

  return (
    <section className="card reveal" data-reveal>
      <h2>Decision Engine</h2>

      {!gateSatisfied && (
        <div className="sub" style={{ marginBottom: 10, color: "#8a8fa3" }}>
          {inProduction
            ? "🔒 Pilot stage must be triggered before Production."
            : "🔒 Complete Sandbox stage to enable Pilot actions"}
        </div>
      )}
      {readOnly && (
        <div className="sub" style={{ marginBottom: 10, color: "#8a8fa3" }}>
          View-only: this stage has already advanced.
        </div>
      )}

      <div className="decision" style={{ marginBottom: 12 }}>
        <span className="tag">{evaluated ? (enableTriggerPilot ? "FAIL" : "PASS") : "HOLD"}</span>
        <span style={{ marginLeft: 10 }}>{decision}</span>
      </div>

      <div className="row" style={{ gap: 8 }}>
        <button className="btn" onClick={refreshKpis} disabled={refreshing}>
          {refreshing ? "Refreshing…" : "Refresh KPIs"}
        </button>

        <button
          className="btn ok"
          onClick={evaluateAndDecide}
          disabled={!gateSatisfied || !enableEvaluate || readOnly}
          title={
            !gateSatisfied
              ? (inProduction ? "Trigger Pilot first" : "Complete Sandbox first")
              : (readOnly ? "Stage is view-only" : (!enableEvaluate ? "Refresh KPIs first" : ""))
          }
        >
          Evaluate &amp; Decide
        </button>

        <button
          className="btn pri"
          onClick={triggerPilot}
          disabled={!gateSatisfied || !enableTriggerPilot || busy || readOnly}
          title={
            !gateSatisfied
              ? (inProduction ? "Trigger Pilot first" : "Complete Sandbox first")
              : (readOnly ? "Stage is view-only" : (!enableTriggerPilot ? "Complete evaluation (or provide CHG) to enable" : ""))
          }
        >
          {busy ? "Triggering…" : triggerLabel}
        </button>

        {/* Production-only Reset (red), enabled only after Production is triggered */}
        {inProduction && (
          <button
            className="btn danger"
            onClick={resetToSandbox}
            disabled={!prodTriggered}
            title={!prodTriggered ? "Available after Production is triggered" : "Reset to Sandbox"}
          >
            Reset to Sandbox
          </button>
        )}
      </div>

      <div className="sub" style={{ marginTop: 10, lineHeight: 1.6 }}>
        Threshold: <b>{num(env?.successThreshold, 90)}%</b> &nbsp;|&nbsp;
        Allowable CHF: <b>{num(env?.allowableCriticalHF, 0)}</b> &nbsp;|&nbsp;
        Success: <b>{derived.successPct}%</b>, Reboot: <b>{derived.rebootPct}%</b>, Error 1603: <b>{derived.errorPct}%</b>, Health: <b>{derived.healthPct}%</b> (Total Computers used: <b>{derived.T}</b>)
      </div>

      {showChg && (
        <div className="modal show" role="dialog" aria-modal="true">
          <div className="box" style={{ maxWidth: 520 }}>
            <h3>Enter Change Number</h3>
            <div className="sub" style={{ marginBottom: 8 }}>
              Must start with <strong>CHG</strong> (e.g., <code>CHG123456</code>).
            </div>
            <form onSubmit={submitChg}>
              <div className="field">
                <input
                  type="text"
                  className="input"
                  placeholder="CHG123456"
                  value={chgNumber}
                  onChange={(e) => { setChgNumber(e.target.value); setChgErr(""); }}
                  autoFocus
                />
              </div>
              {!!chgErr && (
                <div className="sub" style={{ color: "var(--danger)", marginTop: 4 }}>
                  {chgErr}
                </div>
              )}
              <div className="row" style={{ justifyContent: "flex-end", gap: 8, marginTop: 10 }}>
                <button type="button" className="btn" onClick={() => setShowChg(false)} disabled={chgChecking}>
                  Cancel
                </button>
                <button type="submit" className="btn primary" disabled={!chgIsValid || chgChecking}>
                  {chgChecking ? "Validating…" : "Confirm"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </section>
  );
}
