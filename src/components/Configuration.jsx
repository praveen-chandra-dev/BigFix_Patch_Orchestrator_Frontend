// src/components/Configuration.jsx
import { useEffect, useState, useRef } from "react";
import { useEnvironment } from "./Environment.jsx";
import FancySelect from "./common/FancySelect";

const API_BASE = window.env.VITE_API_BASE;

/* --- Helpers --- */
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

function Switch({ checked, onChange, id, disabled = false }) {
  return (
    <div className={`switch-row ${disabled ? "disabled" : ""}`}>
      <div className="switch-text">
        <div className="switch-label">{id}</div>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => !disabled && onChange(!checked)}
        className={`switch-toggle ${checked ? "on" : "off"}`}
        disabled={disabled}
      >
        <div className="knob" />
      </button>
    </div>
  );
}

function Section({ title, children, icon }) {
  return (
    <div className="config-section">
      <div className="section-header">
        {icon && <span className="section-icon">{icon}</span>}
        <h3>{title}</h3>
      </div>
      <div className="section-body">{children}</div>
    </div>
  );
}

export default function Configuration({ onSaved, locked = false }) {
  const { env, setEnv } = useEnvironment();
  const [disk, setDisk] = useState(10);
  const [lastReportValue, setLastReportValue] = useState(1);
  const [lastReportUnit, setLastReportUnit] = useState("days");
  const [requireChg, setRequireChg] = useState(true);
  const [checkService, setCheckService] = useState(false);
  const [cloneVM, setCloneVM] = useState(false);
  const [snapshotVM, setSnapshotVM] = useState(false);
  
  const [enableSandbox, setEnableSandbox] = useState(true);
  const [enablePilot, setEnablePilot] = useState(true);
  
  const [successThreshold, setSuccessThreshold] = useState(90);
  const [allowableCriticalHF, setAllowableCriticalHF] = useState(0);

  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const configRef = useRef(null);

  const role = sessionStorage.getItem("user_role") || "Admin";
  const isLinux = role === "Linux";
  const isEUC = role === "EUC";
  const isAdmin = role === "Admin";

  const handleNumChange = (setter) => (e) => {
    const val = e.target.value;
    if (val === "") setter(""); 
    else setter(Number(val)); 
  };
  
  const handleBlur = (val, setter, min, max) => {
    let num = Number(val);
    if (!Number.isFinite(num) || val === "") num = min;
    num = Math.min(max, Math.max(min, num));
    setter(num);
  };

  useEffect(() => {
    const controller = new AbortController();
    (async () => {
      try {
        const j = await getJSON(`${API_BASE}/api/config`, controller.signal);
        if (!j) return;
        
        const diskVal = j.diskThresholdGB ?? j.diskThreshold;
        if (diskVal != null) setDisk(Number(diskVal));
        
        if (j.requireChg != null) setRequireChg(Boolean(j.requireChg));
        if (j.checkServiceStatus != null) setCheckService(Boolean(j.checkServiceStatus));
        
        setCloneVM(Boolean(j.cloneVM));
        setSnapshotVM(Boolean(j.snapshotVM));
        
        if (j.enableSandbox != null) setEnableSandbox(Boolean(j.enableSandbox));
        if (j.enablePilot != null) setEnablePilot(Boolean(j.enablePilot));
        
        if (j.lastReportValue != null) setLastReportValue(Number(j.lastReportValue));
        if (j.lastReportUnit != null) setLastReportUnit(String(j.lastReportUnit));

        if (j.successThreshold != null) setSuccessThreshold(Number(j.successThreshold));
        if (j.allowableCriticalHF != null) setAllowableCriticalHF(Number(j.allowableCriticalHF));

        setEnv(f => ({ 
            ...f, 
            autoMail: Boolean(j.autoMail), 
            postMail: Boolean(j.postPatchMail ?? j.postMail), 
            cloneVM: Boolean(j.cloneVM), 
            snapshotVM: Boolean(j.snapshotVM),
            enableSandbox: j.enableSandbox != null ? Boolean(j.enableSandbox) : true, 
            enablePilot: j.enablePilot != null ? Boolean(j.enablePilot) : true,
            successThreshold: j.successThreshold != null ? Number(j.successThreshold) : 90,
            allowableCriticalHF: j.allowableCriticalHF != null ? Number(j.allowableCriticalHF) : 0
        }));
        
      } catch (e) { 
        if (e.name !== 'AbortError') setErr(e.message || String(e)); 
      }
    })();
    return () => controller.abort();
  }, [setEnv]);

  async function save() {
    if (busy || locked) return;
    setBusy(true); setErr("");
    
    const diskSafe = Math.max(0, Number(disk) || 0);
    const lastSafe = Math.max(0, Number(lastReportValue) || 0);
    const stSafe = Math.min(100, Math.max(0, Number(successThreshold) || 0));
    const chSafe = Math.max(0, Number(allowableCriticalHF) || 0);
    
    const newConfigValues = {
        diskThreshold: diskSafe,
        requireChg: Boolean(requireChg),
        prePatchMail:  !!env.autoMail,  
        postPatchMail: !!env.postMail,
        checkServiceStatus: Boolean(checkService),
        cloneVM: Boolean(cloneVM),
        snapshotVM: Boolean(snapshotVM),
        enableSandbox: Boolean(enableSandbox),
        enablePilot: Boolean(enablePilot),
        lastReportValue: lastSafe,
        lastReportUnit: String(lastReportUnit),
        successThreshold: stSafe,
        allowableCriticalHF: chSafe
    };

    try {
      await postJSON(`${API_BASE}/api/config`, newConfigValues);
      
      setEnv(f => ({ 
          ...f, 
          autoMail: !!env.autoMail,
          postMail: !!env.postMail,
          cloneVM: Boolean(cloneVM), 
          snapshotVM: Boolean(snapshotVM),
          enableSandbox: Boolean(enableSandbox),
          enablePilot: Boolean(enablePilot),
          successThreshold: stSafe,
          allowableCriticalHF: chSafe
      }));

      if (onSaved) {
        onSaved({
            enableSandbox: Boolean(enableSandbox),
            enablePilot: Boolean(enablePilot)
        });
      }

    } catch (e) { setErr(e.message || String(e)); } finally { setBusy(false); }
  }

  return (
    <section className="config-container card reveal" data-reveal ref={configRef}>
      <div className="header-row">
        <div><h2>Environment Configuration</h2><p className="config-subtitle">Configure critical health checks, notification rules, and process gates.</p></div>
        {locked && <div className="badge locked">🔒 Configuration Locked</div>}
      </div>
      {err && <div className="banner error">{err}</div>}
      <div className="config-grid">
        <Section title="Health Thresholds" icon="🩺">
          <div className="field-group">
            <div className="field">
              <label className="label">Minimum Disk Space (GB)</label>
              <input type="number" min="0" className="control input-modern" value={disk} onChange={handleNumChange(setDisk)} onBlur={() => handleBlur(disk, setDisk, 0, 1000)} disabled={locked} placeholder="e.g. 10" />
              <div className="help-text">Servers below this limit will fail health checks.</div>
            </div>
            
            {isAdmin && (
              <>
                <div className="field">
                  <label className="label">Success Threshold (%)</label>
                  <input type="number" min="0" max="100" className="control input-modern" value={successThreshold} onChange={handleNumChange(setSuccessThreshold)} onBlur={() => handleBlur(successThreshold, setSuccessThreshold, 0, 100)} disabled={locked} />
                  <div className="help-text">Minimum success percentage to proceed.</div>
                </div>

                <div className="field">
                  <label className="label">Allowable Critical Health Failures</label>
                  <input type="number" min="0" className="control input-modern" value={allowableCriticalHF} onChange={handleNumChange(setAllowableCriticalHF)} onBlur={() => handleBlur(allowableCriticalHF, setAllowableCriticalHF, 0, 999)} disabled={locked} />
                  <div className="help-text">Maximum acceptable critical failures.</div>
                </div>
              </>
            )}

            <div className="field">
              <label className="label">Last Report Time Threshold</label>
              <div className="input-combo">
                <div className="env-patch-input"><input type="number" min="0" className="control input-modern" placeholder="10" value={lastReportValue} onChange={handleNumChange(setLastReportValue)} onBlur={() => handleBlur(lastReportValue, setLastReportValue, 0, 365)} disabled={locked} /></div>
                <div style={{ flex: 1.5, minWidth: '140px' }}>
                   <FancySelect 
                     options={[{value:"minutes", label:"Minutes"}, {value:"hours", label:"Hours"}, {value:"days", label:"Days"}]}
                     value={lastReportUnit} 
                     onChange={setLastReportUnit} 
                     disabled={locked} 
                     searchable={false}
                   />
                </div>
              </div>
              <div className="help-text">Max time allowed since last BigFix report.</div>
            </div>
            {!isLinux && <div style={{ marginTop: 8, paddingTop: 16, borderTop: '1px solid var(--border)' }}><Switch id="Check Window Update Service" checked={checkService} onChange={setCheckService} disabled={locked} /></div>}
          </div>
        </Section>
        <Section title="Process Gates & Controls" icon="⚙️">
          <Switch id="ITSM Change Required" checked={requireChg} onChange={setRequireChg} disabled={locked} />
          
          {!isEUC && (
            <>
              <Switch id="Clone VM" checked={cloneVM} onChange={setCloneVM} disabled={locked} />
              <Switch id="Snapshot VM" checked={snapshotVM} onChange={setSnapshotVM} disabled={locked} />
              
              {isAdmin && (
                  <div style={{marginTop: 16, borderTop: "1px solid var(--border)", paddingTop: 16, display: 'flex', flexDirection: 'column', gap: '12px'}}>
                     <Switch id="Enable Sandbox Stage" checked={enableSandbox} onChange={setEnableSandbox} disabled={locked} />
                     <Switch id="Enable Pilot Stage" checked={enablePilot} onChange={setEnablePilot} disabled={locked} />
                  </div>
              )}
            </>
          )}
        </Section>
        <Section title="Notifications" icon="📬">
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <Switch id="Pre-Patch Notifications" checked={!!env.autoMail} onChange={(val) => setEnv(f => ({ ...f, autoMail: val }))} disabled={locked} />
              <Switch id="Post-Patch Report" checked={!!env.postMail} onChange={(val) => setEnv(f => ({ ...f, postMail: val }))} disabled={locked} />
          </div>
        </Section>
      </div>
      <div className="footer-actions">
        <button className="btn outline" disabled={locked} onClick={() => { if(!locked) { setDisk(10); setRequireChg(true); setCheckService(false); setCloneVM(false); setSnapshotVM(false); setEnableSandbox(true); setEnablePilot(true); setLastReportValue(1); setLastReportUnit("days"); setSuccessThreshold(90); setAllowableCriticalHF(0); setEnv(f => ({ ...f, autoMail: false, postMail: false })); } }}>Reset to Defaults</button>
        <button className="btn pri small" onClick={save} disabled={busy || locked}>{busy ? "Saving Settings..." : "Save Configuration"}</button>
      </div>
    </section>
  );
}