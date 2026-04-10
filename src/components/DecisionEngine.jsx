
import { useState, useEffect } from "react";
import { useEnvironment } from "./Environment.jsx";
import InlineSpinner from "./common/InlineSpinner";

export default function DecisionEngine({
  apiBase = window.env.VITE_API_BASE,
  baseline = "",
  group = "",
  autoMail = false,
  onDone = () => {},
  disabled = false,
  username,
  onFinish,
  onReset,
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

  const validDeployments = (env.sandboxDeployments || []).filter(d => d.baseline && d.group);

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
          const r = await fetch(`${apiBase.replace(/\/+$/, "")}/api/actions/${act.actionId}/status`, { headers: { "x-user-role": sessionStorage.getItem("user_role") || "Admin" }});
          if (r.status === 404) continue; // 404 means expired/deleted
          const j = await r.json();
          const st = String(j?.state || "").toLowerCase();
          if (st !== "expired" && st !== "stopped") { allDone = false; break; }
        } catch (e) {
          allDone = false; break;
        }
      }
      if (allDone && !cancelled) {
        setIsComplete(true);
        if (timer) clearInterval(timer);
      }
    }
    poll();
    timer = setInterval(poll, 15000); // Poll every 15 seconds
    return () => { cancelled = true; if (timer) clearInterval(timer); };
  }, [disabled, currentActions, apiBase]);
 
  return (
    <>
      <section className="card reveal" id="card-decision" data-reveal>
      
        <div className="de-header-row">
          <h2>Decision Engine</h2>
          
          {!disabled ? (
              <button type="button" className="btn outline small" onClick={handleTriggerClick} disabled={isDisabled || checkingBaseline} title={ isDisabled ? "Select a baseline and group first" : "Trigger Sandbox" } style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                {busy ? <><InlineSpinner size={14} variant="dark" /><span>Triggering...</span></> : checkingBaseline ? <><InlineSpinner size={14} variant="dark" /><span>Checking...</span></> : "Trigger Sandbox"}
              </button>
          ) : !stageFinished ? (
              // 🚀 FIX: Only show these buttons if the stage is NOT finished
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  {!isComplete && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginRight: '8px', color: 'var(--muted)', fontSize: '13px', fontWeight: 600 }}>
                          <InlineSpinner size={14} variant="dark" /> Actions Running
                      </div>
                  )}
                  <button type="button" className="btn outline dan small" onClick={onReset} disabled={!isComplete}>Reset Sandbox</button>
                  <button type="button" className="btn pri small" onClick={onFinish} disabled={!isComplete}>Finish Stage</button>
              </div>
          ) : (
              // 🚀 FIX: Render nothing here if the stage is finished (View Only mode)
              <div style={{ color: 'var(--muted)', fontSize: '13px', fontWeight: 600 }}>Stage Locked</div>
          )}
        </div>

        <div className="sub de-sub-top">
          {disabled && (
            <span className="pill green de-view-only-pill">Action Triggered</span>
          )}
        </div>

        <div className="sub de-sub-top">
          {disabled && (
            <span className="pill blue de-view-only-pill">View Only</span>
          )}
        </div>

        {status && <div className="de-status-msg">{status}</div>}

        <div className="sub de-sub-bottom">
          Sandbox → Pilot → Production. Trigger Pilot only in Pilot stage.
          Promote after Evaluate.
        </div>
      </section>

      {/* 🚀 FIXED MODAL UI */}
      {showConfirmModal && (
        <div className="modal show" role="dialog" aria-modal="true">
          <div className="box chg-modal-box">
            <h3 className="de-modal-title" style={{ marginTop: 0 }}>Confirm Trigger Sandbox</h3>
            
            {baselineWarnings.length > 0 && (
              <div className="banner error de-warning-banner">
                <strong>⚠️ Baselines Modified</strong>
                <div className="baseline-warning-text">
                    {baselineWarnings.map((w, idx) => <div key={idx}>{w}</div>)}
                </div>
              </div>
            )}
            
            <div className="sub de-confirm-info">
              You are about to trigger the following deployments:
              <ul style={{ paddingLeft: '20px', marginTop: '12px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                 {validDeployments.map((d, i) => (
                     <li key={i}>
                        <strong style={{ color: 'var(--text)' }}>{d.baseline}</strong>
                        <br/>
                        <span style={{ color: 'var(--muted)', display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                           <span>➔</span> <strong>{d.group}</strong>
                        </span>
                     </li>
                 ))}
              </ul>
            </div>
            
            <div className="row de-modal-footer" style={{ marginTop: '24px' }}>
              <button 
                 type="button" 
                 className="btn" 
                 onClick={() => setShowConfirmModal(false)} 
                 disabled={busy}
              >
                 Cancel
              </button>
              <button 
                 type="button" 
                 className="btn pri" 
                 onClick={executeTrigger} 
                 disabled={busy} 
                 style={{ display: "flex", alignItems: "center", gap: "6px" }}
              >
                {busy ? (
                  <>
                     <InlineSpinner size={14} variant="light" />
                     <span>Triggering...</span>
                  </>
                ) : "Confirm & Trigger"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
