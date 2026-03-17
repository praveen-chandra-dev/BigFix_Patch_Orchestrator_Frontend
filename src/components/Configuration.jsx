// src/components/Configuration.jsx
import { useEffect, useState, useRef } from "react";
import { useEnvironment } from "./Environment.jsx";

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

function enhanceNativeSelect(selectEl) {
  if (!selectEl || selectEl.dataset.fx === "ok") return;
  selectEl.dataset.fx = "ok";
  selectEl.style.display = "none";
  
  const wrap = document.createElement("div");
  wrap.className = "fx-wrap";
  selectEl.parentNode.insertBefore(wrap, selectEl);
  wrap.appendChild(selectEl);
  
  const getLabel = () => {
    const opt = selectEl.options[selectEl.selectedIndex];
    return opt ? opt.text : "— select —";
  };
  
  const trigger = document.createElement("button");
  trigger.type = "button";
  trigger.className = "fx-trigger";
  trigger.innerHTML = `<span class="fx-value" style="overflow:hidden;text-overflow:ellipsis;">${getLabel()}</span><span class="fx-chevron" style="opacity:0.5;font-size:12px;">▼</span>`;
  wrap.insertBefore(trigger, selectEl);
  
  const menu = document.createElement("div");
  menu.className = "fx-menu";
  const menuInner = document.createElement("div");
  menuInner.className = "fx-menu-inner";
  menu.appendChild(menuInner);
  wrap.appendChild(menu);
  
  const allOptions = Array.from(selectEl.querySelectorAll("option"));
  const itemsOnly = () => allOptions.filter(o => !o.disabled && o.value !== "");
  
  function renderMenu() {
    menuInner.innerHTML = "";
    const real = itemsOnly();
    if (!real.length) {
      menuInner.innerHTML = `<div class="fx-item fx-empty">No options</div>`;
      return;
    }
    real.forEach((option, i) => {
      const it = document.createElement("div");
      const active = option.selected;
      it.className = "fx-item" + (active ? " fx-active" : "");
      it.innerHTML = `<span class="fx-label">${option.textContent}</span>${active ? "" : ""}`;
      it.onclick = () => commit(i);
      menuInner.appendChild(it);
    });
  }
  
  function open() {
    if (wrap.classList.contains("fx-open")) return;
    wrap.classList.add("fx-open");
    renderMenu();
    document.addEventListener("mousedown", onDocDown);
  }
  
  function close() {
    wrap.classList.remove("fx-open");
    document.removeEventListener("mousedown", onDocDown);
  }
  
  function onDocDown(e) { if (!wrap.contains(e.target)) close(); }
  
  function commit(i) {
    const real = itemsOnly();
    if (!real[i]) return;
    allOptions.forEach(o => o.selected = false);
    real[i].selected = true;
    selectEl.value = real[i].value;
    trigger.querySelector(".fx-value").textContent = real[i].textContent;
    close();
    selectEl.dispatchEvent(new Event("change", { bubbles: true }));
  }
  
  trigger.onclick = (e) => { e.stopPropagation(); wrap.classList.contains("fx-open") ? close() : open(); };

  // This ensures the custom dropdown stays synced when React updates the <select> value asynchronously
  const obs = new MutationObserver(() => {
    const selectedOption = selectEl.options[selectEl.selectedIndex];
    const displayText = selectedOption ? selectedOption.text : "— select —";
    const valEl = trigger.querySelector(".fx-value");
    if (valEl) {
      valEl.textContent = displayText;
    }
  });
  obs.observe(selectEl, { childList: true, subtree: true, attributes: true, attributeFilter: ["selected", "value"] });
}

function enhanceNativeSelects(root = document) {
  if (!root) return;
  root.querySelectorAll("select.control").forEach(enhanceNativeSelect);
}

function Switch({ checked, onChange, label, subLabel, disabled }) {
  return (
    <div className={`switch-row ${disabled ? "disabled" : ""}`}>
      <div className="switch-text">
        <div className="switch-label">{label}</div>
        {subLabel && <div className="switch-sub">{subLabel}</div>}
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

        setEnv(f => ({ 
            ...f, 
            autoMail: Boolean(j.autoMail), 
            postMail: Boolean(j.postPatchMail ?? j.postMail), 
            cloneVM: Boolean(j.cloneVM), 
            snapshotVM: Boolean(j.snapshotVM),
            enableSandbox: j.enableSandbox != null ? Boolean(j.enableSandbox) : true, 
            enablePilot: j.enablePilot != null ? Boolean(j.enablePilot) : true      
        }));
        
      } catch (e) { 
        if (e.name !== 'AbortError') setErr(e.message || String(e)); 
      } finally { 
        setTimeout(() => enhanceNativeSelects(configRef.current), 100); 
      }
    })();
    return () => controller.abort();
  }, [setEnv]);

  async function save() {
    if (busy || locked) return;
    setBusy(true); setErr("");
    
    const diskSafe = Math.max(0, Number(disk) || 0);
    const lastSafe = Math.max(0, Number(lastReportValue) || 0);
    
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
          enablePilot: Boolean(enablePilot)
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
            <div className="field">
              <label className="label">Last Report Time Threshold</label>
              <div className="input-combo">
                <div className="env-patch-input"><input type="number" min="0" className="control input-modern" placeholder="10" value={lastReportValue} onChange={handleNumChange(setLastReportValue)} onBlur={() => handleBlur(lastReportValue, setLastReportValue, 0, 365)} disabled={locked} /></div>
                <div style={{ flex: 1.5, minWidth: '140px' }}><select value={lastReportUnit} onChange={(e) => setLastReportUnit(e.target.value)} disabled={locked} className="control"><option value="minutes">Minutes</option><option value="hours">Hours</option><option value="days">Days</option></select></div>
              </div>
              <div className="help-text">Max time allowed since last BigFix report.</div>
            </div>
            {!isLinux && <div style={{ marginTop: 8, paddingTop: 16, borderTop: '1px solid var(--border)' }}><Switch checked={checkService} onChange={setCheckService} label="Check Window Update Service" subLabel="Fail health check if 'wuauserv' is not running." disabled={locked} /></div>}
          </div>
        </Section>
        <Section title="Process Gates & Controls" icon="⚙️">
          <Switch checked={requireChg} onChange={setRequireChg} label="ITSM Change Required" subLabel="Validate CHG status at 'Implement' stage before proceeding." disabled={locked} />
          
          {!isEUC && (
            <>
              <Switch checked={cloneVM} onChange={setCloneVM} label="Clone VM" subLabel="Create a full clone of the VM before patching." disabled={locked} />
              <Switch checked={snapshotVM} onChange={setSnapshotVM} label="Snapshot VM" subLabel="Trigger a VM snapshot for quick rollback capability." disabled={locked} />
              
              <div style={{marginTop: 16, borderTop: "1px solid var(--border)", paddingTop: 16}}>
                 <Switch 
                   checked={enableSandbox} 
                   onChange={setEnableSandbox} 
                   label="Enable Sandbox Stage" 
                   subLabel="Include Sandbox verification in the patch workflow." 
                   disabled={locked || !isAdmin} 
                 />
                 <Switch 
                   checked={enablePilot} 
                   onChange={setEnablePilot} 
                   label="Enable Pilot Stage" 
                   subLabel="Include Pilot group deployment in the patch workflow." 
                   disabled={locked || !isAdmin} 
                 />
                 {!isAdmin && <div style={{fontSize:12, color:'#94a3b8', marginTop:6}}>Only Administrators can modify workflow stages.</div>}
              </div>
            </>
          )}
        </Section>
        <Section title="Notifications" icon="📬">
          <Switch checked={!!env.autoMail} onChange={(val) => setEnv(f => ({ ...f, autoMail: val }))} label="Pre-Patch Notifications" subLabel="Email stakeholders when a new patch cycle is triggered." disabled={locked} />
          <Switch checked={!!env.postMail} onChange={(val) => setEnv(f => ({ ...f, postMail: val }))} label="Post-Patch Report" subLabel="Email results summary after action completion." disabled={locked} />
        </Section>
      </div>
      <div className="footer-actions">
        <button className="btn secondary" disabled={locked} onClick={() => { if(!locked) { setDisk(10); setRequireChg(true); setCheckService(false); setCloneVM(false); setSnapshotVM(false); setEnableSandbox(true); setEnablePilot(true); setLastReportValue(1); setLastReportUnit("days"); setEnv(f => ({ ...f, autoMail: false, postMail: false })); } }}>Reset to Defaults</button>
        <button className="btn outline small" onClick={save} disabled={busy || locked}>{busy ? "Saving Settings..." : "Save Configuration"}</button>
      </div>
    </section>
  );
}