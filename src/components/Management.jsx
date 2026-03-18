// vite-project/src/components/Management.jsx
import { useEffect, useMemo, useRef, useState } from "react";

const API = window.env.VITE_API_BASE;

const REQUIRED_KEYS = new Set(["BIGFIX_BASE_URL", "BIGFIX_USER", "BIGFIX_PASS"]);
const LABELS = {
  BIGFIX_BASE_URL: "BIGFIX BASE URL", BIGFIX_USER: "BIGFIX API USERNAME", BIGFIX_PASS: "BIGFIX API PASSWORD", BIGFIX_ALLOW_SELF_SIGNED: "BIGFIX ALLOW SELF SIGNED",
  SMTP_HOST: "SMTP HOST", SMTP_USER: "SMTP USERNAME", SMTP_PASSWORD: "SMTP PASSWORD", SMTP_FROM: "EMAIL FROM", SMTP_TO: "EMAIL TO", SMTP_CC: "EMAIL CC", SMTP_BCC: "EMAIL BCC", SMTP_PORT: "SMTP PORT", SMTP_SECURE: "SMTP SECURE", SMTP_ALLOW_SELF_SIGNED: "SMTP ALLOW SELF SIGNED",
  SN_URL: "SERVICENOW URL", SN_USER: "SERVICENOW USERNAME", SN_PASSWORD: "SERVICENOW PASSWORD", SN_ALLOW_SELF_SIGNED: "SERVICENOW ALLOW SELF SIGNED",
  VCENTER_URL: "VCENTER URL", VCENTER_USER: "VCENTER USERNAME", VCENTER_PASSWORD: "VCENTER PASSWORD", VCENTER_ALLOW_SELF_SIGNED:"VCENTER ALLOW SELF SIGNED",
  LDAP_ENABLED: "ENABLE DIRECTORY SERVICES", LDAP_URL: "LDAP URL", LDAP_DOMAIN: "LDAP DOMAIN", LDAP_ALLOW_SELF_SIGNED: "LDAP ALLOW SELF SIGNED",
  DEBUG_LOG: "DEBUG LEVEL",
};

const TEMPLATE = [
  { key: "BIGFIX_BASE_URL", value: "", type: "string", secret: false, hint: "https://server:52311", required: true },
  { key: "BIGFIX_USER", value: "", type: "string", secret: false, hint: "e.g. bigfix", required: true },
  { key: "BIGFIX_PASS", value: "", type: "string", secret: true, hint: "", required: true },
  { key: "BIGFIX_ALLOW_SELF_SIGNED", value: "false", type: "boolean", secret: false, hint: "Allow self-signed" },
  { key: "LDAP_ENABLED", value: "false", type: "boolean", secret: false, hint: "Authenticate via Active Directory" },
  { key: "LDAP_URL", value: "", type: "string", secret: false, hint: "ldaps://dc.example.com:636" }, 
  { key: "LDAP_DOMAIN", value: "", type: "string", secret: false, hint: "example.com" },
  { key: "LDAP_ALLOW_SELF_SIGNED", value: "false", type: "boolean", secret: false, hint: "Disable SSL validation (internal)" },
  { key: "SMTP_HOST", value: "", type: "string", secret: false, hint: "smtp.domain.com" },
  { key: "SMTP_USER", value: "", type: "string", secret: false, hint: "" },
  { key: "SMTP_PASSWORD", value: "", type: "string", secret: true, hint: "" },
  { key: "SMTP_FROM", value: "", type: "string", secret: false, hint: "noreply@domain.com" },
  { key: "SMTP_TO", value: "", type: "string", secret: false, hint: "comma-separated" },
  { key: "SMTP_PORT", value: "25", type: "enum", secret: false, hint: "", options: ["25","465","587"] },
  { key: "SMTP_SECURE", value: "false", type: "boolean", secret: false, hint: "Use TLS/SSL" },
  { key: "SMTP_CC", value: "", type: "string", secret: false, hint: "" },
  { key: "SMTP_BCC", value: "", type: "string", secret: false, hint: "" },
  { key: "SMTP_ALLOW_SELF_SIGNED", value: "false", type: "boolean", secret: false, hint: "" },
  { key: "SN_URL", value: "", type: "string", secret: false, hint: "https://instance.service-now.com" },
  { key: "SN_USER", value: "", type: "string", secret: false, hint: "" },
  { key: "SN_PASSWORD", value: "", type: "string", secret: true, hint: "" },
  { key: "SN_ALLOW_SELF_SIGNED", value: "false", type: "boolean", secret: false, hint: "" },
  { key: "VCENTER_URL", value: "", type: "string", secret: false, hint: "https://vcenter.domain.com" },
  { key: "VCENTER_USER", value: "", type: "string", secret: false, hint: "user@vsphere.local" },
  { key: "VCENTER_PASSWORD", value: "", type: "string", secret: true, hint: "" },
  { key: "VCENTER_ALLOW_SELF_SIGNED", value: "false", type: "boolean", secret: false, hint: "" },
  { key: "DEBUG_LOG", value: "0", type: "enum-map", secret: false, hint: "", options: [{ value: "0", label: "Info" }, { value: "1", label: "Debug" }] },
];

function Switch({ checked, onChange, id, disabled = false }) {
  return (
    <button type="button" role="switch" aria-checked={checked} id={id} onClick={() => onChange(!checked)} className={`sw ${checked ? "on" : ""}`} title={checked ? "On" : "Off"} disabled={disabled}>
      <span className="knob" />
    </button>
  );
}

function Select({ value, options, onChange, placeholder, disabled = false }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => { const onDoc = (e) => { if (!ref.current?.contains(e.target)) setOpen(false); }; document.addEventListener("mousedown", onDoc); return () => document.removeEventListener("mousedown", onDoc); }, []);
  const getLabel = (opt) => (typeof opt === "string" ? opt : (opt?.label ?? opt?.value ?? ""));
  const getValue = (opt) => (typeof opt === "string" ? opt : (opt?.value ?? ""));
  const label = (() => { const match = (options || []).find(o => getValue(o) === value); return match ? getLabel(match) : (placeholder || "Select"); })();
  return (
    <div ref={ref} className={`select ${open ? "open" : ""}`}>
      <button type="button" className="select-btn" onClick={() => setOpen(o=>!o)} aria-haspopup="listbox" aria-expanded={open} disabled={disabled}>
        <span>{label}</span>
        <svg width="16" height="16" viewBox="0 0 20 20" aria-hidden><path d="M5 7l5 6 5-6" fill="none" stroke="currentColor" strokeWidth="2"/></svg>
      </button>
      {open && (
        <ul className="menu" role="listbox">
          {(options || []).map((opt, idx) => {
            const v = getValue(opt); const l = getLabel(opt); const sel = v === value;
            return <li key={`${v}-${idx}`} role="option" aria-selected={sel} className={`item ${sel ? "sel" : ""}`} onClick={() => { onChange(v); setOpen(false); }}>{l}{sel && <span className="tick">✓</span>}</li>;
          })}
        </ul>
      )}
    </div>
  );
}

function Field({ item, value, onChange, invalid, disabled = false }) {
  const [show, setShow] = useState(false);
  const isBool = item.type === "boolean";
  const isEnum = item.type === "enum" || item.type === "enum-map";
  const isSecret = item.secret;
  const val = value ?? item.value ?? "";
  return (
    <div className={`field ${invalid ? "invalid" : ""}`}>
      <div className="meta">
        <label htmlFor={item.key}>{LABELS[item.key] ?? item.key}{REQUIRED_KEYS.has(item.key) ? <span className="req">*</span> : null}</label>
        {item.hint && <div className="hint">{item.hint}</div>}
      </div>
      {isBool ? (
        <Switch id={item.key} checked={String(val).toLowerCase() === "true"} onChange={(next) => onChange(item.key, next ? "true" : "false")} disabled={disabled} />
      ) : isEnum ? (
        <div className="inputwrap">
          <Select value={val} options={item.options || []} onChange={(v) => onChange(item.key, v)} placeholder="" disabled={disabled} />
          {item.key === "DEBUG_LOG" && <button type="button" className="ghost tiny" onClick={() => onChange(item.key, val === "1" ? "0" : "1")} disabled={disabled}>{val === "1" ? "Debug" : "Info"}</button>}
        </div>
      ) : (
        <div className="inputwrap">
          <input id={item.key} type={isSecret && !show ? "password" : item.type === "number" ? "number" : "text"} placeholder={item.hint || ""} value={val} onChange={(e) => onChange(item.key, e.target.value)} autoComplete="off" disabled={disabled} />
          {isSecret && <button type="button" className="ghost tiny" onClick={() => setShow(s => !s)} disabled={disabled}>{show ? "Hide" : "Show"}</button>}
        </div>
      )}
    </div>
  );
}

function isEmail(x) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(x).trim()); }
function listValidEmails(s) { if (!s) return true; return String(s).split(",").map(v => v.trim()).filter(Boolean).every(isEmail); }

export default function Management({ onClose, role }) {
  const [values, setValues] = useState({});
  const [originalValues, setOriginalValues] = useState({});
  const [editingSection, setEditingSection] = useState(null); 
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState("");

  const isAdmin = role === 'Admin';

  const sections = useMemo(() => {
    const ord = { BIGFIX_: ["BIGFIX_BASE_URL","BIGFIX_USER","BIGFIX_PASS","BIGFIX_ALLOW_SELF_SIGNED"], LDAP_: ["LDAP_ENABLED", "LDAP_URL", "LDAP_DOMAIN", "LDAP_ALLOW_SELF_SIGNED"], SMTP_: ["SMTP_HOST","SMTP_USER","SMTP_PASSWORD","SMTP_FROM","SMTP_TO","SMTP_PORT","SMTP_SECURE","SMTP_CC","SMTP_BCC","SMTP_ALLOW_SELF_SIGNED"], SN_: ["SN_URL","SN_USER","SN_PASSWORD","SN_ALLOW_SELF_SIGNED"], VCENTER_:["VCENTER_URL", "VCENTER_USER", "VCENTER_PASSWORD", "VCENTER_ALLOW_SELF_SIGNED"], DEBUG_: ["DEBUG_LOG"] };
    const pick = (pfx) => TEMPLATE.filter(i => i.key.startsWith(pfx)).sort((a,b) => (ord[pfx] || []).indexOf(a.key) - (ord[pfx] || []).indexOf(b.key));
    
    // IF NOT ADMIN, ONLY RETURN BIGFIX SECTION
    if (!isAdmin) {
        return { BIGFIX: pick("BIGFIX_") };
    }
    
    return { BIGFIX: pick("BIGFIX_"), LDAP: pick("LDAP_"), SMTP: pick("SMTP_"), SN: pick("SN_"), VCENTER:pick("VCENTER_"), DEBUG: pick("DEBUG_") };
  }, [isAdmin]);

  const smtpTouched = useMemo(() => isAdmin ? ["SMTP_HOST","SMTP_USER","SMTP_PASSWORD","SMTP_FROM","SMTP_TO","SMTP_CC","SMTP_BCC"].some(k => (values[k] ?? "").toString().trim() !== "") : false, [values, isAdmin]);
  const vcenterTouched = useMemo(() => isAdmin ? ["VCENTER_URL", "VCENTER_USER", "VCENTER_PASSWORD"].some(k => (values[k] ?? "").toString().trim() !== "") : false, [values, isAdmin]);
  const ldapEnabled = useMemo(() => isAdmin ? String(values["LDAP_ENABLED"] ?? "false").toLowerCase() === "true" : false, [values, isAdmin]);

  const invalidMap = useMemo(() => {
    const m = {};
    for (const it of TEMPLATE) {
      if (REQUIRED_KEYS.has(it.key)) {
        if (it.secret && editingSection !== 'BIGFIX') { m[it.key] = false; continue; }
        m[it.key] = (values[it.key] ?? it.value ?? "").toString().trim() === "";
      }
    }
    if (isAdmin) {
        if (smtpTouched) { m.SMTP_HOST = (values.SMTP_HOST ?? "").trim() === ""; m.SMTP_FROM = !isEmail((values.SMTP_FROM ?? "").trim()); m.SMTP_TO = !listValidEmails(values.SMTP_TO); }
        if (vcenterTouched) m.VCENTER_URL = (values.VCENTER_URL ?? "").trim() === "";
        if (ldapEnabled) { m.LDAP_URL = (values.LDAP_URL ?? "").trim() === ""; m.LDAP_DOMAIN = (values.LDAP_DOMAIN ?? "").trim() === ""; }
    }
    return m;
  }, [values, smtpTouched, vcenterTouched, ldapEnabled, editingSection, isAdmin]);

  const validationMap = useMemo(() => {
      const map = { BIGFIX: sections.BIGFIX.every(it => !invalidMap[it.key]) };
      if (isAdmin) {
          map.LDAP = sections.LDAP.every(it => !invalidMap[it.key]);
          map.SMTP = sections.SMTP.every(it => !(smtpTouched ? invalidMap[it.key] : false));
          map.SN = true;
          map.VCENTER = sections.VCENTER.every(it => !(vcenterTouched ? invalidMap[it.key] : false));
          map.DEBUG = true;
      }
      return map;
  }, [sections, invalidMap, smtpTouched, vcenterTouched, isAdmin]);

  async function fetchEnv() {
    setMsg(""); setLoading(true);
    try {
      const r = await fetch(`${API}/api/env`); const j = await r.json(); const apiValues = j.values || {}; const dict = {};
      TEMPLATE.forEach(t => dict[t.key] = t.secret ? "" : (apiValues[t.key] ?? t.value ?? ""));
      setValues(dict); setOriginalValues(dict);
    } catch (e) {
      setMsg(`Error: ${e.message}`); const dict = {}; TEMPLATE.forEach(t => dict[t.key] = t.value ?? ""); setValues(dict); setOriginalValues(dict);
    } finally { setLoading(false); }
  }
  
  useEffect(() => { fetchEnv(); }, []);
  const onChange = (k, v) => setValues(prev => ({ ...prev, [k]: v }));

  async function onSave(sectionKey) {
    setSaving(true); setMsg("");
    try {
      const outgoing = {}; sections[sectionKey].forEach(it => outgoing[it.key] = values[it.key] ?? "");
      const r = await fetch(`${API}/api/env`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ updates: outgoing }) });
      if (!r.ok && r.status !== 204) {
        const j = await r.json().catch(()=>({})); setMsg(j.message || "Save failed");
      } else {
        const newOriginals = { ...values }; TEMPLATE.forEach(t => { if (t.secret) newOriginals[t.key] = ""; });
        setValues(newOriginals); setOriginalValues(newOriginals); setEditingSection(null);
        setMsg("Saved successfully!"); setTimeout(() => setMsg(""), 2000);
      }
    } catch (e) { setMsg(e?.message || "Save failed"); } finally { setSaving(false); }
  }

  function onCancel() { setValues(originalValues); setEditingSection(null); setMsg(""); }

  return (
    <div className="mgmtenv">
      <div className="topbar">
        <div className="left"><h2 className="clickable" onClick={onClose}>Environment Settings</h2></div>
        <div className="right"><button className="btn" onClick={onClose}>Close</button></div>
      </div>

      {msg && <div className={`banner ${msg.includes("failed")||msg.includes("Error") ? "error" : "success"}`}>{msg}</div>}
      {loading && <div className="sub mgmt-loading">Loading settings...</div>}

      {!loading && (
        <div className="section overflow-visible">
          <div className="section-head">
            <span className="title">BigFix</span><span className="pill">Required</span><div className="spacer" />
            {editingSection === 'BIGFIX' ? (
              <div className="actions">
                <button className="btn ghost" onClick={onCancel} disabled={saving}>Cancel</button>
                <button className="btn primary" onClick={() => onSave('BIGFIX')} disabled={saving || !validationMap['BIGFIX']}>{saving?"Saving…":"Save"}</button>
              </div>
            ) : <button className="btn" onClick={() => setEditingSection('BIGFIX')} disabled={saving || editingSection !== null}>Edit</button>}
          </div>
          <div className="grid">
            {sections.BIGFIX.map(it => <Field key={it.key} item={it} value={values[it.key]} onChange={onChange} invalid={invalidMap[it.key]} disabled={editingSection !== 'BIGFIX'} />)}
          </div>
        </div>
      )}

      {/* RENDER REMAINING SECTIONS ONLY FOR ADMINS */}
      {!loading && isAdmin && (
        <>
            <details className="section overflow-visible" open>
                <summary className="section-head">
                    <span className="title">Directory Services (LDAP)</span><span className="pill soft">Optional</span><div className="spacer" />
                    {editingSection === 'LDAP' ? (
                    <div className="actions">
                        <button className="btn ghost" onClick={onCancel} disabled={saving}>Cancel</button>
                        <button className="btn primary" onClick={() => onSave('LDAP')} disabled={saving || !validationMap['LDAP']}>{saving?"Saving…":"Save"}</button>
                    </div>
                    ) : <button className="btn" onClick={() => setEditingSection('LDAP')} disabled={saving || editingSection !== null}>Edit</button>}
                </summary>
                <div className="grid">
                    {sections.LDAP.map(it => <Field key={it.key} item={it} value={values[it.key]} onChange={onChange} invalid={invalidMap[it.key]} disabled={editingSection !== 'LDAP' || (it.key !== 'LDAP_ENABLED' && !ldapEnabled)} />)}
                </div>
            </details>

            <div className="section overflow-visible">
              <div className="section-head">
                <span className="title">SMTP / Email</span><span className="pill soft">Optional</span><div className="spacer" />
                {editingSection === 'SMTP' ? (
                  <div className="actions">
                    <button className="btn ghost" onClick={onCancel} disabled={saving}>Cancel</button>
                    <button className="btn primary" onClick={() => onSave('SMTP')} disabled={saving || !validationMap['SMTP']}>{saving?"Saving…":"Save"}</button>
                  </div>
                ) : <button className="btn" onClick={() => setEditingSection('SMTP')} disabled={saving || editingSection !== null}>Edit</button>}
              </div>
              <div className="grid">
                {sections.SMTP.map(it => <Field key={it.key} item={it} value={values[it.key]} onChange={onChange} invalid={smtpTouched ? invalidMap[it.key] : false} disabled={editingSection !== 'SMTP'} />)}
              </div>
            </div>

            <details className="section overflow-visible" open>
              <summary className="section-head">
                <span className="title">ServiceNow</span><span className="pill soft">Optional</span><div className="spacer" />
                {editingSection === 'SN' ? (
                  <div className="actions">
                    <button className="btn ghost" onClick={onCancel} disabled={saving}>Cancel</button>
                    <button className="btn primary" onClick={() => onSave('SN')} disabled={saving || !validationMap['SN']}>{saving?"Saving…":"Save"}</button>
                  </div>
                ) : <button className="btn" onClick={() => setEditingSection('SN')} disabled={saving || editingSection !== null}>Edit</button>}
              </summary>
              <div className="grid">
                {sections.SN.map(it => <Field key={it.key} item={it} value={values[it.key]} onChange={onChange} disabled={editingSection !== 'SN'} />)}
              </div>
            </details>

            <details className="section overflow-visible" open>
              <summary className="section-head">
                <span className="title">VCenter</span><span className="pill soft">Optional</span><div className="spacer" />
                {editingSection === 'VCENTER' ? (
                  <div className="actions">
                    <button className="btn ghost" onClick={onCancel} disabled={saving}>Cancel</button>
                    <button className="btn primary" onClick={() => onSave('VCENTER')} disabled={saving || !validationMap['VCENTER']}>{saving?"Saving…":"Save"}</button>
                  </div>
                ) : <button className="btn" onClick={() => setEditingSection('VCENTER')} disabled={saving || editingSection !== null}>Edit</button>}
              </summary>
              <div className="grid">
                {sections.VCENTER.map(it => <Field key={it.key} item={it} value={values[it.key]} onChange={onChange} invalid={vcenterTouched ? invalidMap[it.key] : false} disabled={editingSection !== 'VCENTER'} />)}
              </div>
            </details>

            <details className="section overflow-visible" open>
              <summary className="section-head">
                <span className="title">Logging</span><span className="pill soft">Optional</span><div className="spacer" />
                {editingSection === 'DEBUG' ? (
                  <div className="actions">
                    <button className="btn ghost" onClick={onCancel} disabled={saving}>Cancel</button>
                    <button className="btn primary" onClick={() => onSave('DEBUG')} disabled={saving || !validationMap['DEBUG']}>{saving?"Saving…":"Save"}</button>
                  </div>
                ) : <button className="btn" onClick={() => setEditingSection('DEBUG')} disabled={saving || editingSection !== null}>Edit</button>}
              </summary>
              <div className="grid">
                {sections.DEBUG.map(it => <Field key={it.key} item={it} value={values[it.key]} onChange={onChange} disabled={editingSection !== 'DEBUG'} />)}
              </div>
            </details>
        </>
      )}
    </div>
  );
}