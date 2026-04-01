// src/components/ValidationGate.jsx
import { useState, useEffect } from "react";

export default function ValidationGate({ targetGroupName, onValidationChange }) {
  const [status, setStatus] = useState("idle"); 
  const [data, setData] = useState(null);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    setStatus("idle");
    setData(null);
    setErrorMessage("");
    onValidationChange(false); 
  }, [targetGroupName, onValidationChange]);

  const handleValidate = async () => {
    setStatus("checking");
    setErrorMessage("");
    const API = window.env?.VITE_API_BASE || "http://localhost:5174";
    
    try {
      // 🚀 Split comma-separated string into an array of individual groups
      const groups = targetGroupName ? targetGroupName.split(",").map(g => g.trim()).filter(Boolean) : [];
      
      if (groups.length === 0) {
         setStatus("error");
         setErrorMessage("No target group specified.");
         onValidationChange(false);
         return;
      }

      let total = 0;
      let protectedCount = 0;
      let missingServers = [];
      let hasError = false;
      let errorList = [];

      // 🚀 Fetch validation for every group concurrently
      await Promise.all(groups.map(async (gName) => {
          try {
            const res = await fetch(`${API}/api/vcenter/validate`, {
              method: "POST",
              headers: { "Content-Type": "application/json", "x-user-role": sessionStorage.getItem("user_role") || "Admin" },
              body: JSON.stringify({ groupName: gName, lookbackHours: 24 })
            });
            const json = await res.json();
            
            if (json.ok && json.ready !== false) {
                total += (json.total || 0);
                protectedCount += (json.protected || 0);
                if (Array.isArray(json.missing)) {
                    missingServers.push(...json.missing);
                }
            } else {
                hasError = true;
                if (Array.isArray(json.missing)) missingServers.push(...json.missing);
                errorList.push(json.error || `Failed for ${gName}`);
            }
          } catch (e) {
              hasError = true;
              errorList.push(`Network error for ${gName}`);
          }
      }));

      // Deduplicate missing servers in case a server belongs to multiple groups
      missingServers = [...new Set(missingServers)];

      const aggregatedData = {
          total,
          protected: protectedCount,
          missing: missingServers,
          ready: !hasError && missingServers.length === 0
      };

      setData(aggregatedData);
      
      if (aggregatedData.ready) {
        setStatus("success");
        onValidationChange(true); 
      } else {
        setStatus("error");
        // If we have actual missing servers, don't just show the generic group empty error
        setErrorMessage(missingServers.length > 0 ? "" : (errorList.length > 0 ? errorList.join(" | ") : "Validation failed."));
        onValidationChange(false); 
      }
    } catch (e) {
      console.error(e);
      setStatus("error");
      setErrorMessage(e.message || "Failed to connect to validation server.");
      onValidationChange(false);
    }
  };

  return (
    <div className="val-gate-wrap">
      <div className="val-gate-header">
        <div>
          <h4 className="val-gate-title">🛡️ Pre-Flight: Backup Validation</h4>
          <div className="val-gate-sub">Checking groups: <b>{targetGroupName || "None"}</b></div>
        </div>

        {status === "idle" && (
           <button className="btn outline small" onClick={handleValidate} disabled={!targetGroupName}>Validate</button>
        )}
        {status === "checking" && <span className="val-gate-pill blue">Checking...</span>}
        {status === "success" && <span className="val-gate-pill green">✓ All {data?.total || 0} Protected</span>}
        {status === "error" && data?.missing?.length > 0 && <span className="val-gate-pill red">⚠ {data.missing.length} Missing</span>}
        {status === "error" && (!data?.missing || data.missing.length === 0) && <span className="val-gate-pill red">⚠ Error</span>}
      </div>

      {status === "error" && (
        <div className="val-gate-error-box">
          {data?.missing?.length > 0 ? (
            <>
              <b>Validation Failed.</b> These servers have no Snapshot or Clone in the last 24h:
              <ul className="val-gate-ul">
                {data.missing.slice(0, 10).map(m => <li key={m}>{m}</li>)}
                {data.missing.length > 10 && <li>...and {data.missing.length - 10} others</li>}
              </ul>
            </>
          ) : (
             <><b>Validation Error:</b> {errorMessage}</>
          )}
        </div>
      )}
    </div>
  );
}