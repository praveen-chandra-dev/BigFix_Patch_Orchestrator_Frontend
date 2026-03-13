// vite-project/src/components/ValidationGate.jsx
import { useState, useEffect } from "react";

export default function ValidationGate({ targetGroupName, onValidationChange }) {
  const [status, setStatus] = useState("idle"); 
  const [data, setData] = useState(null);

  useEffect(() => {
    setStatus("idle");
    setData(null);
    onValidationChange(false); 
  }, [targetGroupName, onValidationChange]);

  const handleValidate = async () => {
    setStatus("checking");
    const API = window.env?.VITE_API_BASE || "http://localhost:5174";
    
    try {
      const res = await fetch(`${API}/api/vcenter/validate`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-user-role": sessionStorage.getItem("user_role") || "Admin" },
        body: JSON.stringify({ groupName: targetGroupName, lookbackHours: 24 })
      });
      const json = await res.json();
      setData(json);
      
      if (json.ok && json.ready) {
        setStatus("success");
        onValidationChange(true); 
      } else {
        setStatus("error");
        onValidationChange(false); 
      }
    } catch (e) {
      console.error(e);
      setStatus("error");
      onValidationChange(false);
    }
  };

  return (
    <div className="val-gate-wrap">
      <div className="val-gate-header">
        <div>
          <h4 className="val-gate-title">🛡️ Pre-Flight: Backup Validation</h4>
          <div className="val-gate-sub">Checking group: <b>{targetGroupName || "None"}</b></div>
        </div>

        {status === "idle" && (
           <button className="btn outline small" onClick={handleValidate} disabled={!targetGroupName}>Validate</button>
        )}
        {status === "checking" && <span className="val-gate-pill blue">Checking...</span>}
        {status === "success" && <span className="val-gate-pill green">✓ All {data?.total || 0} Protected</span>}
        {status === "error" && data?.missing && <span className="val-gate-pill red">⚠ {data.missing.length} Missing</span>}
        {status === "error" && !data?.missing && <span className="val-gate-pill red">⚠ Error</span>}
      </div>

      {status === "error" && data?.missing?.length > 0 && (
        <div className="val-gate-error-box">
          <b>Validation Failed.</b> These servers have no Snapshot or Clone in the last 24h:
          <ul className="val-gate-ul">
            {data.missing.map(m => <li key={m}>{m}</li>)}
            {data.total > (data.protected || 0) + data.missing.length && <li>...and others</li>}
          </ul>
        </div>
      )}
    </div>
  );
}