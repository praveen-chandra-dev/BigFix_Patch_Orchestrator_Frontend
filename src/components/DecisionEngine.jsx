// DecisionEngine.jsx - Updated with disabled prop
import { useState } from "react";

/**
 * Props
 * - apiBase   : string   (e.g. http://localhost:5174)
 * - baseline  : string   (selected baseline name from Environment)
 * - group     : string   (selected group name from Environment)
 * - autoMail  : boolean  (Environment's "Auto-mail updates" toggle)
 * - onDone    : function (optional callback with result)
 * - disabled  : boolean  (optional - disables the trigger button)
 */
export default function DecisionEngine({
  apiBase = "http://localhost:5174",
  baseline = "",
  group = "",
  autoMail = false,
  onDone = () => {},
  disabled = false, // New prop
}) {
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");

  async function handleTrigger() {
    setBusy(true);
    setStatus("");

    try {
      const url = `${apiBase.replace(/\/+$/, "")}/api/actions`;
      const resp = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          baselineName: baseline,
          groupName: group,
          autoMail: !!autoMail,
        }),
      });

      const text = await resp.text();
      let data;
      try {
        data = JSON.parse(text);
      } catch {
        data = { ok: false, raw: text };
      }

      if (!resp.ok || data.ok === false) {
        const msg =
          data?.error ||
          data?.message ||
          `HTTP ${resp.status}${text ? `: ${text.slice(0, 300)}` : ""}`;
        setStatus(`Failed to trigger sandbox: ${msg}`);
        onDone({ ok: false, error: msg });
        return;
      }

      setStatus("Sandbox trigger sent successfully.");
      onDone({ ok: true, data });
    } catch (err) {
      const msg = (err && err.message) || String(err);
      setStatus(`Failed to trigger sandbox: ${msg}`);
      onDone({ ok: false, error: msg });
    } finally {
      setBusy(false);
    }
  }

  // Combine existing disabled conditions with new prop
  const isDisabled = disabled || busy || !baseline || !group;

  return (
    <section className="card reveal" id="card-decision" data-reveal>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <h2>Decision Engine</h2>
        <button
          type="button"
          className="btn pri"
          onClick={handleTrigger}
          disabled={isDisabled}
          title={
            disabled 
              ? "Sandbox completed - view only mode" 
              : isDisabled ? "Select a baseline and group first" : "Trigger Sandbox"
          }
        >
          {busy ? "Triggering…" : "Trigger Sandbox"}
        </button>
      </div>

      <div className="sub" style={{ marginTop: 10 }}>
        {disabled && (
          <span style={{ marginLeft: 10 }} className="pill blue">View Only</span>
        )}
      </div>

      {status && (
        <div
          style={{
            marginTop: 12,
            padding: "10px 12px",
            borderRadius: 12,
            border: "1px solid var(--border)",
            background: "var(--panel-2)",
          }}
        >
          {status}
        </div>
      )}

      <div className="sub" style={{ marginTop: 14 }}>
        Sandbox → Pilot → Production. Trigger Pilot only in Pilot stage. Promote after Evaluate.
      </div>
    </section>
  );
}