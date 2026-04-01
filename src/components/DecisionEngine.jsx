// frontend/src/components/DecisionEngine.jsx
// import { useState } from "react";

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
  const [baselineWarnings, setBaselineWarnings] = useState([]); // 🚀 Now an array

  // 🚀 Filter out any empty rows
  const validDeployments = (env.sandboxDeployments || []).filter(d => d.baseline && d.group);

  // 🚀 Poll current stage actions to unlock the Finish/Reset buttons
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
  // async function checkBaselineStatus() {
  //   if (!baseline) return null;
  //   try {
  //     const resp = await fetch(
  //       `${apiBase.replace(/\/+$/, "")}/api/baseline/validate`,
  //       {
  //         method: "POST",
  //         headers: { "Content-Type": "application/json" },
  //         body: JSON.stringify({ baselineName: baseline }),
  //       },
  //     );
  //     if (resp.ok) {
  //       const j = await resp.json();
  //       if (j.modified) return j.warning;
  //     }
  //   } catch (e) {
  //     console.warn("Baseline validation error:", e);
  //   }
  //   return null;
  // }

  async function checkBaselineStatus() {
    if (validDeployments.length === 0) return [];
    const warnings = [];
    try {
      const uniqueBaselines = [...new Set(validDeployments.map(d => d.baseline))];
      for (const b of uniqueBaselines) {
          const resp = await fetch(`${apiBase.replace(/\/+$/, "")}/api/baseline/validate`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ baselineName: b }),
          });
          if (resp.ok) {
            const j = await resp.json();
            if (j.modified) warnings.push(`[${b}]: ${j.warning}`);
          }
      }
    } catch (e) { console.warn("Baseline validation error:", e); }
    return warnings;
  }

  // async function executeTrigger() {
  //   if (disabled || busy) return;

  //   setShowConfirmModal(false);
  //   setBusy(true);
  //   setStatus("");

  //   try {
  //     const url = `${apiBase.replace(/\/+$/, "")}/api/actions`;
  //     const payload = {
  //       baselineName: baseline,
  //       groupName: group,
  //       autoMail: !!autoMail,
  //       triggeredBy: username,
  //       patchWindow: {
  //         days: env.patchWindowDays || 0,
  //         hours: env.patchWindowHours || 0,
  //         minutes: env.patchWindowMinutes || 0,
  //       },
  //     };

  //     const resp = await fetch(url, {
  //       method: "POST",
  //       headers: { "Content-Type": "application/json" },
  //       body: JSON.stringify(payload),
  //     });
  //     const text = await resp.text();
  //     let data;
  //     try {
  //       data = JSON.parse(text);
  //     } catch {
  //       data = { ok: false, raw: text };
  //     }

  //     if (!resp.ok || data.ok === false) {
  //       const msg =
  //         data?.error ||
  //         data?.message ||
  //         `HTTP ${resp.status}${text ? `: ${text.slice(0, 300)}` : ""}`;
  //       setStatus(`Failed to trigger sandbox: ${msg}`);
  //       onDone({ ok: false, error: msg });
  //       return;
  //     }

  //     let successMsg = "Sandbox trigger sent successfully.";
  //     if (data.preMailError)
  //       successMsg += `\n(Email failed: ${data.preMailError})`;
  //     setStatus(successMsg);
  //     onDone({ ok: true, ...data });
  //   } catch (err) {
  //     const msg = (err && err.message) || String(err);
  //     setStatus(`Failed to trigger sandbox: ${msg}`);
  //     onDone({ ok: false, error: msg });
  //   } finally {
  //     setBusy(false);
  //   }
  // }

  async function executeTrigger() {
    setBusy(true);
    setStatus("Initiating Sandbox Deployments...");
    try {
      const resp = await fetch(`${apiBase.replace(/\/+$/, "")}/api/actions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          deployments: validDeployments, // 🚀 Passing ARRAY
          autoMail,
          environment: "Sandbox",
          patchWindow: { days: env.patchWindowDays, hours: env.patchWindowHours, minutes: env.patchWindowMinutes },
          triggeredBy: username,
        }),
      });
      const j = await resp.json();
      if (resp.ok && j.ok) {
        setStatus("Sandbox Deployments Triggered Successfully.");
        setShowConfirmModal(false);
        // 🚀 Pass array of actions
        onDone({ ok: true, actions: j.actions, actionId: j.actions[0]?.actionId });
      } else {
        setStatus(`Trigger failed: ${j.error || "Unknown error"}`);
      }
    } catch (e) { setStatus(`Trigger error: ${e.message}`); } 
    finally { setBusy(false); }
  }

  // const isDisabled = disabled || busy || !baseline || !group;

  const isDisabled = disabled || busy || validDeployments.length === 0;
  // async function handleTriggerClick() {
  //   if (isDisabled) return;
  //   setCheckingBaseline(true);
  //   setBaselineWarning(null);
  //   const warning = await checkBaselineStatus();
  //   if (warning) setBaselineWarning(warning);
  //   setCheckingBaseline(false);
  //   setShowConfirmModal(true);
  // }

  async function handleTriggerClick() {
    if (validDeployments.length === 0) return setStatus("Please define at least one Deployment.");
    setStatus("");
    setCheckingBaseline(true);
    const warnings = await checkBaselineStatus();
    setCheckingBaseline(false);
    setBaselineWarnings(warnings || []);
    setShowConfirmModal(true);
  }

  // return (
  //   <>
  //     <section className="card reveal" id="card-decision" data-reveal>
  //       <div className="de-header-row">
  //         <h2>Decision Engine</h2>
  //         <button
  //           type="button"
  //           className="btn outline small"
  //           onClick={handleTriggerClick}
  //           disabled={isDisabled || checkingBaseline}
  //           title={
  //             disabled
  //               ? "Sandbox completed - view only mode"
  //               : isDisabled
  //                 ? "Select a baseline and group first"
  //                 : "Trigger Sandbox"
  //           }
  //           style={{ display: "flex", alignItems: "center", gap: "6px" }}
  //         >
  //           {busy ? (
  //             <>
  //               <InlineSpinner size={14} variant="dark" />
  //               <span>Triggering...</span>
  //             </>
  //           ) : checkingBaseline ? (
  //             <>
  //               <InlineSpinner size={14} variant="dark" />
  //               <span>Checking...</span>
  //             </>
  //           ) : (
  //             "Trigger Sandbox"
  //           )}
  //         </button>
  //       </div>

  //       <div className="sub de-sub-top">
  //         {disabled && (
  //           <span className="pill blue de-view-only-pill">View Only</span>
  //         )}
  //       </div>

  //       {status && <div className="de-status-msg">{status}</div>}

  //       <div className="sub de-sub-bottom">
  //         Sandbox → Pilot → Production. Trigger Pilot only in Pilot stage.
  //         Promote after Evaluate.
  //       </div>
  //     </section>

  //     {/* {showConfirmModal && (
  //       <div className="modal show" role="dialog" aria-modal="true">
  //         <div className="box chg-modal-box">
  //           <h3 className="de-modal-title">Confirm Sandbox Action</h3>
  //           {baselineWarning && (
  //             <div className="banner error de-warning-banner">
  //               <strong>⚠️ Baseline Modified</strong>
  //               <div className="baseline-warning-text">{baselineWarning}</div>
  //             </div>
  //           )}
  //           <div className="sub de-confirm-info">
  //             You are about to trigger the baseline:
  //             <br />
  //             <strong>{baseline || "N/A"}</strong>
  //             <br />
  //             <br />
  //             This action will target the group:
  //             <br />
  //             <strong>{group || "N/A"}</strong>
  //           </div>
  //           <div className="row de-modal-footer">
  //             <button
  //               type="button"
  //               className="btn"
  //               onClick={() => setShowConfirmModal(false)}
  //               disabled={busy}
  //             >
  //               Cancel
  //             </button>
  //             <button
  //               type="button"
  //               className="btn pri"
  //               onClick={executeTrigger}
  //               disabled={busy}
  //               style={{ display: "flex", alignItems: "center", gap: "6px" }}
  //             >
  //               {busy ? (
  //                 <>
  //                   <InlineSpinner size={14} variant="light" />
  //                   <span>Triggering...</span>
  //                 </>
  //               ) : (
  //                 "Confirm & Trigger"
  //               )}
  //             </button>
  //           </div>
  //         </div>
  //       </div>
  //     )} */}
  //     {showConfirmModal && (
  //       <div className="de-modal-overlay">
  //         <div className="de-modal-content" style={{ width: '500px', maxWidth: '90vw' }}>
  //           <h3 style={{ marginTop: 0 }}>Confirm Trigger Sandbox</h3>
  //           {baselineWarnings.length > 0 && (
  //             <div className="de-warning-banner">
  //               <strong>⚠️ Baselines Modified</strong>
  //               <div className="baseline-warning-text">
  //                   {baselineWarnings.map((w, idx) => <div key={idx}>{w}</div>)}
  //               </div>
  //             </div>
  //           )}
  //           <div className="sub de-confirm-info">
  //             You are about to trigger the following deployments:
  //             <ul style={{ paddingLeft: '20px', marginTop: '12px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
  //                {validDeployments.map((d, i) => (
  //                    <li key={i}><strong>{d.baseline}</strong> <br/><span style={{ color: 'var(--muted)' }}>➔ {d.group}</span></li>
  //                ))}
  //             </ul>
  //           </div>
  //           <div className="row de-modal-footer" style={{ marginTop: '24px' }}>
  //             <button type="button" className="btn" onClick={() => setShowConfirmModal(false)} disabled={busy}>Cancel</button>
  //             <button type="button" className="btn pri" onClick={executeTrigger} disabled={busy} style={{ display: "flex", alignItems: "center", gap: "6px" }}>
  //               {busy ? <><InlineSpinner size={14} variant="light" /><span>Triggering...</span></> : "Confirm & Trigger"}
  //             </button>
  //           </div>
  //         </div>
  //       </div>
  //     )}
  //   </>
  // );
  return (
    <>
      <section className="card reveal" id="card-decision" data-reveal>
        {/* <div className="de-header-row">
          <h2>Decision Engine</h2>
          <button
            type="button"
            className="btn outline small"
            onClick={handleTriggerClick}
            disabled={isDisabled || checkingBaseline}
            title={
              disabled
                ? "Sandbox completed - view only mode"
                : isDisabled
                  ? "Select a baseline and group first"
                  : "Trigger Sandbox"
            }
            style={{ display: "flex", alignItems: "center", gap: "6px" }}
          >
            {busy ? (
              <>
                <InlineSpinner size={14} variant="dark" />
                <span>Triggering...</span>
              </>
            ) : checkingBaseline ? (
              <>
                <InlineSpinner size={14} variant="dark" />
                <span>Checking...</span>
              </>
            ) : (
              "Trigger Sandbox"
            )}
          </button>
        </div> */}
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
