// FlowCard.jsx - Updated to handle stage changes properly
import { useEffect, useState, useCallback } from "react";

export const Stage = { SANDBOX: "SANDBOX", PILOT: "PILOT", PRODUCTION: "PRODUCTION" };

function TimelineStep({ stage, label, onClick, activeStage, currentStage }) {
  let className = "step clickable";
  if (activeStage === Stage.PRODUCTION) className += " pass";
  else if (activeStage === Stage.PILOT) {
    if (stage === Stage.PILOT) className += " hold";
    if (stage === Stage.SANDBOX) className += " pass";
  } else if (activeStage === Stage.SANDBOX && stage === Stage.SANDBOX) className += " hold";

  const handleActivate = useCallback(() => onClick?.(stage), [onClick, stage]);
  const onKeyDown = (e) => {
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); handleActivate(); }
  };

  return (
    <div className={className} onClick={handleActivate} onKeyDown={onKeyDown}
         role="button" tabIndex={0} aria-label={`Go to ${label}`}>
      <span className="dot" />{label}
    </div>
  );
}

export default function FlowCard({ activeStage, viewStage, gotoStage }) {
  const [activeTab, setActiveTab] = useState("flow");
  const [revealed, setRevealed] = useState(false);
  useEffect(() => { const t = setTimeout(()=>setRevealed(true), 50); return ()=>clearTimeout(t); }, []);
  
  return (
    <section className={`card ${revealed ? "reveal" : ""}`}>
      <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <h2>Orchestration Flow</h2>
          <div className="sub">Sandbox → Pilot → Production. Promotions only after Evaluate. Sandbox drives Pilot; Pilot drives Production.</div>
        </div>
        <div className="timeline" id="timeline">
          <TimelineStep 
            stage={Stage.SANDBOX}   
            label="Sandbox"    
            onClick={gotoStage} 
            activeStage={activeStage} 
            currentStage={viewStage}
          />
          <svg width="34" height="6" viewBox="0 0 34 6" aria-hidden="true"><path d="M2 3h30" stroke="currentColor" opacity=".35" /></svg>
          <TimelineStep 
            stage={Stage.PILOT}     
            label="Pilot"      
            onClick={gotoStage} 
            activeStage={activeStage} 
            currentStage={viewStage}
          />
          <svg width="34" height="6" viewBox="0 0 34 6" aria-hidden="true"><path d="M2 3h30" stroke="currentColor" opacity=".35" /></svg>
          <TimelineStep 
            stage={Stage.PRODUCTION} 
            label="Production" 
            onClick={gotoStage} 
            activeStage={activeStage} 
            currentStage={viewStage}
          />
        </div>
      </div>

      <div className="sep" />

      <div className="tabs">
        <button className={`tab ${activeTab === "flow" ? "active" : ""}`} onClick={() => setActiveTab("flow")}>Flow</button>
        <button className={`tab ${activeTab === "gates" ? "active" : ""}`} onClick={() => setActiveTab("gates")}>Gates & Decisions</button>
        <button className={`tab ${activeTab === "reporting" ? "active" : ""}`} onClick={() => setActiveTab("reporting")}>Reporting</button>
        <div className="spacer" />
      </div>

      <div className={`tabpanel ${activeTab === "flow" ? "active" : ""}`} id="tab-flow">
        <div className="sub">
          Current Stage: <strong>{activeStage}</strong>
          <br />
          Sandbox (Lab/UAT) → Pilot (canary ring) → Production. Use <strong>Evaluate &amp; Decide</strong> between stages.
        </div>
      </div>
      <div className={`tabpanel ${activeTab === "gates" ? "active" : ""}`} id="tab-gates">
        <div className="sub"><strong>Gates enabled:</strong> PASS if <strong>Success ≥ Threshold</strong> and <strong>Critical Health Failures ≤ Limit</strong>. Pilot PASS ⇒ CHG ⇒ auto-promote to Production. Production PASS ⇒ CHG ⇒ run patch.</div>
      </div>
      <div className={`tabpanel ${activeTab === "reporting" ? "active" : ""}`} id="tab-reporting">
        <div className="sub"><strong>Reporting:</strong> Wire Web Reports/webhooks for telemetry &amp; audit.</div>
      </div>
    </section>
  );
}