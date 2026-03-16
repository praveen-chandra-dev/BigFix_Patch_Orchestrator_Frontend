// frontend/src/components/DecisionEngine.jsx
import { useState } from "react";
import { useEnvironment } from "./Environment.jsx"; 

export default function DecisionEngine({
  apiBase = window.env.VITE_API_BASE,
  baseline = "",
  group = "",
  autoMail = false,
  onDone = () => {},
  disabled = false,
  username, 
}) {
  const { env } = useEnvironment();
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  
  const [checkingBaseline, setCheckingBaseline] = useState(false);
  const [baselineWarning, setBaselineWarning] = useState(null);

  async function checkBaselineStatus() {
    if (!baseline) return null;
    try {
      const resp = await fetch(`${apiBase.replace(/\/+$/, "")}/api/baseline/validate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ baselineName: baseline })
      });
      if (resp.ok) {
        const j = await resp.json();
        if (j.modified) return j.warning;
      }
    } catch (e) {
      console.warn("Baseline validation error:", e);
    }
    return null;
  }

  async function executeTrigger() {
    if (disabled || busy) return;
    
    setShowConfirmModal(false);
    setBusy(true);
    setStatus("");

    try {
      const url = `${apiBase.replace(/\/+$/, "")}/api/actions`;
      const payload = {
        baselineName: baseline,
        groupName: group,
        autoMail: !!autoMail,
        triggeredBy: username,
        patchWindow: { days: env.patchWindowDays || 0, hours: env.patchWindowHours || 0, minutes: env.patchWindowMinutes || 0 }
      };

      const resp = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const text = await resp.text();
      let data;
      try { data = JSON.parse(text); } catch { data = { ok: false, raw: text }; }

      if (!resp.ok || data.ok === false) {
        const msg = data?.error || data?.message || `HTTP ${resp.status}${text ? `: ${text.slice(0, 300)}` : ""}`;
        setStatus(`Failed to trigger sandbox: ${msg}`);
        onDone({ ok: false, error: msg });
        return;
      }

      let successMsg = "Sandbox trigger sent successfully.";
      if (data.preMailError) successMsg += `\n(Email failed: ${data.preMailError})`;
      setStatus(successMsg);
      onDone({ ok: true, ...data }); 

    } catch (err) {
      const msg = (err && err.message) || String(err);
      setStatus(`Failed to trigger sandbox: ${msg}`);
      onDone({ ok: false, error: msg });
    } finally {
      setBusy(false);
    }
  }

  const isDisabled = disabled || busy || !baseline || !group;

  async function handleTriggerClick() {
    if (isDisabled) return;
    setCheckingBaseline(true);
    setBaselineWarning(null);
    const warning = await checkBaselineStatus();
    if (warning) setBaselineWarning(warning);
    setCheckingBaseline(false);
    setShowConfirmModal(true);
  }

  return (
    <>
      <section className="card reveal" id="card-decision" data-reveal>
        <div className="de-header-row">
          <h2>Decision Engine</h2>
          <button
            type="button"
            className="btn outline small"
            onClick={handleTriggerClick}
            disabled={isDisabled || checkingBaseline}
            title={disabled ? "Sandbox completed - view only mode" : isDisabled ? "Select a baseline and group first" : "Trigger Sandbox"}
          >
            {busy ? "Triggering…" : checkingBaseline ? "Checking..." : "Trigger Sandbox"}
          </button>
        </div>

        <div className="sub de-sub-top">
          {disabled && <span className="pill blue de-view-only-pill">View Only</span>}
        </div>

        {status && <div className="de-status-msg">{status}</div>}

        <div className="sub de-sub-bottom">
          Sandbox → Pilot → Production. Trigger Pilot only in Pilot stage. Promote after Evaluate.
        </div>
      </section>

      {showConfirmModal && (
        <div className="modal show" role="dialog" aria-modal="true">
          <div className="box chg-modal-box">
            <h3 className="de-modal-title">Confirm Sandbox Action</h3>
            {baselineWarning && (
              <div className="banner error de-warning-banner">
                <strong>⚠️ Baseline Modified</strong>
                <div className="baseline-warning-text">{baselineWarning}</div>
              </div>
            )}
            <div className="sub de-confirm-info">
              You are about to trigger the baseline:<br />
              <strong>{baseline || "N/A"}</strong><br /><br />
              This action will target the group:<br />
              <strong>{group || "N/A"}</strong>
            </div>
            <div className="row de-modal-footer">
              <button type="button" className="btn" onClick={() => setShowConfirmModal(false)} disabled={busy}>Cancel</button>
              <button type="button" className="btn pri" onClick={executeTrigger} disabled={busy}>{busy ? "Triggering..." : "Confirm & Trigger"}</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}