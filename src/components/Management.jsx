// vite-project/src/components/Management.jsx
import { useEffect, useMemo, useRef, useState } from "react";

const API = window.env.VITE_API_BASE;

const REQUIRED_KEYS = new Set(["BIGFIX_BASE_URL", "BIGFIX_USER", "BIGFIX_PASS", "SESSION_TIMEOUT"]);
const LABELS = {
  SESSION_TIMEOUT: "SESSION TIMEOUT (MINUTES)",
  BIGFIX_BASE_URL: "BIGFIX BASE URL", BIGFIX_USER: "BIGFIX API USERNAME", BIGFIX_PASS: "BIGFIX API PASSWORD", BIGFIX_ALLOW_SELF_SIGNED: "BIGFIX ALLOW SELF SIGNED",
  SANDBOX_BIGFIX_BASE_URL: "SANDBOX BIGFIX BASE URL", SANDBOX_BIGFIX_USER: "SANDBOX BIGFIX API USERNAME", SANDBOX_BIGFIX_PASS: "SANDBOX BIGFIX API PASSWORD", SANDBOX_BIGFIX_ALLOW_SELF_SIGNED: "SANDBOX BIGFIX ALLOW SELF SIGNED",
  PILOT_BIGFIX_BASE_URL: "PILOT BIGFIX BASE URL", PILOT_BIGFIX_USER: "PILOT BIGFIX API USERNAME", PILOT_BIGFIX_PASS: "PILOT BIGFIX API PASSWORD", PILOT_BIGFIX_ALLOW_SELF_SIGNED: "PILOT BIGFIX ALLOW SELF SIGNED",
  PRODUCTION_BIGFIX_BASE_URL: "PRODUCTION BIGFIX BASE URL", PRODUCTION_BIGFIX_USER: "PRODUCTION BIGFIX API USERNAME", PRODUCTION_BIGFIX_PASS: "PRODUCTION BIGFIX API PASSWORD", PRODUCTION_BIGFIX_ALLOW_SELF_SIGNED: "PRODUCTION BIGFIX ALLOW SELF SIGNED",
  SMTP_HOST: "SMTP HOST", SMTP_USER: "SMTP USERNAME", SMTP_PASSWORD: "SMTP PASSWORD", SMTP_FROM: "EMAIL FROM", SMTP_TO: "EMAIL TO", SMTP_CC: "EMAIL CC", SMTP_BCC: "EMAIL BCC", SMTP_PORT: "SMTP PORT", SMTP_SECURE: "SMTP SECURE", SMTP_ALLOW_SELF_SIGNED: "SMTP ALLOW SELF SIGNED",
  SN_URL: "SERVICENOW URL", SN_USER: "SERVICENOW USERNAME", SN_PASSWORD: "SERVICENOW PASSWORD", SN_ALLOW_SELF_SIGNED: "SERVICENOW ALLOW SELF SIGNED",
  VCENTER_URL: "VCENTER URL", VCENTER_USER: "VCENTER USERNAME", VCENTER_PASSWORD: "VCENTER PASSWORD", VCENTER_ALLOW_SELF_SIGNED:"VCENTER ALLOW SELF SIGNED",
  LDAP_ENABLED: "ENABLE DIRECTORY SERVICES", LDAP_URL: "LDAP URL", LDAP_DOMAIN: "LDAP DOMAIN", LDAP_ALLOW_SELF_SIGNED: "LDAP ALLOW SELF SIGNED",
  PRISM_BASE_URL: "PRISM URL", PRISM_USER: "PRISM USERNAME", PRISM_PASS: "PRISM PASSWORD",
  DEBUG_LOG: "DEBUG LEVEL",
};

const TEMPLATE = [
  { key: "SESSION_TIMEOUT", value: "15", type: "number", secret: false, hint: "15", required: true },
  { key: "BIGFIX_BASE_URL", value: "", type: "string", secret: false, hint: "https://server:52311", required: true },
  { key: "BIGFIX_USER", value: "", type: "string", secret: false, hint: "e.g. bigfix", required: true },
  { key: "BIGFIX_PASS", value: "", type: "string", secret: true, hint: "", required: true },
  { key: "BIGFIX_ALLOW_SELF_SIGNED", value: "false", type: "boolean", secret: false, hint: "Allow self-signed" },
  // Stage-specific BigFix
  { key: "SANDBOX_BIGFIX_BASE_URL", value: "", type: "string", secret: false, hint: "https://sandbox-server:52311", required: false },
  { key: "SANDBOX_BIGFIX_USER", value: "", type: "string", secret: false, hint: "sandbox-user", required: false },
  { key: "SANDBOX_BIGFIX_PASS", value: "", type: "string", secret: true, hint: "", required: false },
  { key: "SANDBOX_BIGFIX_ALLOW_SELF_SIGNED", value: "false", type: "boolean", secret: false, hint: "Allow self-signed (sandbox)" },
  { key: "PILOT_BIGFIX_BASE_URL", value: "", type: "string", secret: false, hint: "https://pilot-server:52311", required: false },
  { key: "PILOT_BIGFIX_USER", value: "", type: "string", secret: false, hint: "pilot-user", required: false },
  { key: "PILOT_BIGFIX_PASS", value: "", type: "string", secret: true, hint: "", required: false },
  { key: "PILOT_BIGFIX_ALLOW_SELF_SIGNED", value: "false", type: "boolean", secret: false, hint: "Allow self-signed (pilot)" },
  { key: "PRODUCTION_BIGFIX_BASE_URL", value: "", type: "string", secret: false, hint: "https://prod-server:52311", required: false },
  { key: "PRODUCTION_BIGFIX_USER", value: "", type: "string", secret: false, hint: "prod-user", required: false },
  { key: "PRODUCTION_BIGFIX_PASS", value: "", type: "string", secret: true, hint: "", required: false },
  { key: "PRODUCTION_BIGFIX_ALLOW_SELF_SIGNED", value: "false", type: "boolean", secret: false, hint: "Allow self-signed (production)" },
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
  { key: "PRISM_BASE_URL", value: "", type: "string", secret: false, hint: "http://prism-engine:8000" },
  { key: "PRISM_USER", value: "", type: "string", secret: false, hint: "" },
  { key: "PRISM_PASS", value: "", type: "string", secret: true, hint: "" },
  { key: "VCENTER_URL", value: "", type: "string", secret: false, hint: "https://vcenter.domain.com" },
  { key: "VCENTER_USER", value: "", type: "string", secret: false, hint: "user@vsphere.local" },
  { key: "VCENTER_PASSWORD", value: "", type: "string", secret: true, hint: "" },
  { key: "VCENTER_ALLOW_SELF_SIGNED", value: "false", type: "boolean", secret: false, hint: "" },
  { key: "DEBUG_LOG", value: "0", type: "enum-map", secret: false, hint: "", options: [{ value: "0", label: "Info" }, { value: "1", label: "Debug" }] },
];

function getHeaders() {
    return { "Content-Type": "application/json", "Accept": "application/json", "x-user-role": sessionStorage.getItem("user_role") || "Admin" };
}

async function fetchAuth(endpoint, body) {
    const res = await fetch(`${API}${endpoint}`, {
        method: "POST",
        headers: getHeaders(),
        credentials: "include",
        body: JSON.stringify(body)
    });
    return res.json();
}

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
          <input id={item.key} type={isSecret && !show ? "password" : item.type === "number" ? "number" : "text"} placeholder={item.hint || ""} value={val} onChange={(e) => onChange(item.key, e.target.value)} autoComplete="off" disabled={disabled} min={item.type === "number" ? "1" : undefined} />
          {isSecret && <button type="button" className="ghost tiny" onClick={() => setShow(s => !s)} disabled={disabled}>{show ? "Hide" : "Show"}</button>}
        </div>
      )}
    </div>
  );
}

function isEmail(x) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(x).trim()); }
function listValidEmails(s) { if (!s) return true; return String(s).split(",").map(v => v.trim()).filter(Boolean).every(isEmail); }

export default function Management({ onClose }) {
  const [values, setValues] = useState({});
  const [originalValues, setOriginalValues] = useState({});
  const [editingSection, setEditingSection] = useState(null); 
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  const [myBfPassword, setMyBfPassword] = useState("");
  const [savingPersonal, setSavingPersonal] = useState(false);
  const [personalCreds, setPersonalCreds] = useState({ username: "Loading...", hasCreds: false });

  const isMO = sessionStorage.getItem("isMO") === "true";

  const sections = useMemo(() => {
    const ord = {
      SECURITY_: ["SESSION_TIMEOUT"],
      BIGFIX_: ["BIGFIX_BASE_URL","BIGFIX_USER","BIGFIX_PASS","BIGFIX_ALLOW_SELF_SIGNED"],
      SANDBOX_: ["SANDBOX_BIGFIX_BASE_URL","SANDBOX_BIGFIX_USER","SANDBOX_BIGFIX_PASS","SANDBOX_BIGFIX_ALLOW_SELF_SIGNED"],
      PILOT_: ["PILOT_BIGFIX_BASE_URL","PILOT_BIGFIX_USER","PILOT_BIGFIX_PASS","PILOT_BIGFIX_ALLOW_SELF_SIGNED"],
      PRODUCTION_: ["PRODUCTION_BIGFIX_BASE_URL","PRODUCTION_BIGFIX_USER","PRODUCTION_BIGFIX_PASS","PRODUCTION_BIGFIX_ALLOW_SELF_SIGNED"],
      LDAP_: ["LDAP_ENABLED", "LDAP_URL", "LDAP_DOMAIN", "LDAP_ALLOW_SELF_SIGNED"],
      SMTP_: ["SMTP_HOST","SMTP_USER","SMTP_PASSWORD","SMTP_FROM","SMTP_TO","SMTP_PORT","SMTP_SECURE","SMTP_CC","SMTP_BCC","SMTP_ALLOW_SELF_SIGNED"],
      SN_: ["SN_URL","SN_USER","SN_PASSWORD","SN_ALLOW_SELF_SIGNED"],
      PRISM_: ["PRISM_BASE_URL","PRISM_USER","PRISM_PASS"],
      VCENTER_:["VCENTER_URL", "VCENTER_USER", "VCENTER_PASSWORD", "VCENTER_ALLOW_SELF_SIGNED"],
      DEBUG_: ["DEBUG_LOG"]
    };
    const pick = (pfx) => TEMPLATE.filter(i => i.key.startsWith(pfx) || ord[pfx].includes(i.key)).sort((a,b) => (ord[pfx] || []).indexOf(a.key) - (ord[pfx] || []).indexOf(b.key));
    if (!isMO) return { SECURITY: [], BIGFIX: [], SANDBOX: [], PILOT: [], PRODUCTION: [], LDAP: [], SMTP: [], SN: [], PRISM: [], VCENTER: [], DEBUG: [] };
    return {
      SECURITY: pick("SECURITY_"),
      BIGFIX: pick("BIGFIX_"),
      SANDBOX: pick("SANDBOX_"),
      PILOT: pick("PILOT_"),
      PRODUCTION: pick("PRODUCTION_"),
      LDAP: pick("LDAP_"),
      SMTP: pick("SMTP_"),
      SN: pick("SN_"),
      PRISM: pick("PRISM_"),
      VCENTER: pick("VCENTER_"),
      DEBUG: pick("DEBUG_")
    };
  }, [isMO]);

  const smtpTouched = useMemo(() => isMO ? ["SMTP_HOST","SMTP_USER","SMTP_PASSWORD","SMTP_FROM","SMTP_TO","SMTP_CC","SMTP_BCC"].some(k => (values[k] ?? "").toString().trim() !== "") : false, [values, isMO]);
  const vcenterTouched = useMemo(() => isMO ? ["VCENTER_URL", "VCENTER_USER", "VCENTER_PASSWORD"].some(k => (values[k] ?? "").toString().trim() !== "") : false, [values, isMO]);
  const prismTouched = useMemo(() => isMO ? ["PRISM_BASE_URL","PRISM_USER","PRISM_PASS"].some(k => (values[k] ?? "").toString().trim() !== "") : false, [values, isMO]);
  const ldapEnabled = useMemo(() => isMO ? String(values["LDAP_ENABLED"] ?? "false").toLowerCase() === "true" : false, [values, isMO]);

  const invalidMap = useMemo(() => {
    const m = {};
    for (const it of TEMPLATE) {
      if (REQUIRED_KEYS.has(it.key)) {
        if (it.secret && editingSection !== 'BIGFIX') { m[it.key] = false; continue; }
        m[it.key] = (values[it.key] ?? it.value ?? "").toString().trim() === "";
      }
    }
    if (isMO) {
        if (smtpTouched) { m.SMTP_HOST = (values.SMTP_HOST ?? "").trim() === ""; m.SMTP_FROM = !isEmail((values.SMTP_FROM ?? "").trim()); m.SMTP_TO = !listValidEmails(values.SMTP_TO); }
        if (vcenterTouched) m.VCENTER_URL = (values.VCENTER_URL ?? "").trim() === "";
        if (prismTouched) m.PRISM_BASE_URL = (values.PRISM_BASE_URL ?? "").trim() === "";
        if (ldapEnabled) { m.LDAP_URL = (values.LDAP_URL ?? "").trim() === ""; m.LDAP_DOMAIN = (values.LDAP_DOMAIN ?? "").trim() === ""; }
    }
    return m;
  }, [values, smtpTouched, vcenterTouched, prismTouched, ldapEnabled, editingSection, isMO]);

  const validationMap = useMemo(() => {
      const map = {
        SECURITY: sections.SECURITY.every(it => !invalidMap[it.key]),
        BIGFIX: sections.BIGFIX.every(it => !invalidMap[it.key]),
        SANDBOX: sections.SANDBOX.every(it => !invalidMap[it.key]),
        PILOT: sections.PILOT.every(it => !invalidMap[it.key]),
        PRODUCTION: sections.PRODUCTION.every(it => !invalidMap[it.key]),
      };
      if (isMO) {
          map.LDAP = sections.LDAP.every(it => !invalidMap[it.key]);
          map.SMTP = sections.SMTP.every(it => !(smtpTouched ? invalidMap[it.key] : false));
          map.SN = true;
          map.PRISM = sections.PRISM.every(it => !(prismTouched ? invalidMap[it.key] : false));
          map.VCENTER = sections.VCENTER.every(it => !(vcenterTouched ? invalidMap[it.key] : false));
          map.DEBUG = true;
      }
      return map;
  }, [sections, invalidMap, smtpTouched, prismTouched, vcenterTouched, isMO]);

  async function fetchAllSettings() {
    setMsg(""); setErr(""); setLoading(true);
    try {
      const pRes = await fetch(`${API}/api/auth/my-bigfix-creds`, { credentials: 'include' }).catch(()=>({}));
      if (pRes.ok) {
          const pData = await pRes.json();
          if (pData.ok) setPersonalCreds({ username: pData.username, hasCreds: pData.hasCreds });
          else setPersonalCreds({ username: "Authentication Error", hasCreds: false });
      }

      if (isMO) {
          const eRes = await fetch(`${API}/api/env`, { headers: getHeaders() });
          if (eRes.ok) {
              const eData = await eRes.json();
              const apiValues = eData.values || {}; 
              const dict = {};
              TEMPLATE.forEach(t => dict[t.key] = t.secret ? "" : (apiValues[t.key] ?? t.value ?? ""));
              setValues(dict); 
              setOriginalValues(dict);
          }
      }
    } catch (e) {
      setErr(`Error loading settings: ${e.message}`); 
    } finally { 
      setLoading(false); 
    }
  }
  
  useEffect(() => { fetchAllSettings(); }, []);

  const onChange = (k, v) => setValues(prev => ({ ...prev, [k]: v }));

  async function onSave(sectionKey) {
    setSaving(true); setMsg(""); setErr("");
    try {
      const outgoing = {}; sections[sectionKey].forEach(it => outgoing[it.key] = values[it.key] ?? "");
      const r = await fetch(`${API}/api/env`, { method: "POST", headers: getHeaders(), body: JSON.stringify({ updates: outgoing }) });
      if (!r.ok && r.status !== 204) {
        const j = await r.json().catch(()=>({})); setErr(j.message || "Save failed");
      } else {
        const newOriginals = { ...values }; TEMPLATE.forEach(t => { if (t.secret) newOriginals[t.key] = ""; });
        setValues(newOriginals); setOriginalValues(newOriginals); setEditingSection(null);
        setMsg("System settings saved successfully!"); setTimeout(() => setMsg(""), 2000);
      }
    } catch (e) { setErr(e?.message || "Save failed"); } finally { setSaving(false); }
  }

  function onCancel() { setValues(originalValues); setEditingSection(null); setMsg(""); setErr(""); }

  const replicateAndSave = async () => {
    setSaving(true);
    try {
      const res = await fetch(`${API}/api/env/replicate-bigfix`, { method: "POST", headers: getHeaders() });
      const data = await res.json();
      if (data.ok) {
        setMsg(data.message);
        await fetchAllSettings();
      } else {
        setErr(data.error || "Replication failed");
      }
    } catch (e) {
      setErr(e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleVerifyBf = async (e) => {
      e.preventDefault();
      setErr(""); setMsg("");
      setSavingPersonal(true);
      try {
          const data = await fetchAuth('/api/auth/my-bigfix-creds', { bfPassword: myBfPassword });
          if (data.ok) {
              setMsg(data.message || "Credentials verified & saved to vault.");
              setPersonalCreds(prev => ({ ...prev, hasCreds: true }));
              setMyBfPassword("");
              window.dispatchEvent(new CustomEvent('bf-creds-updated'));
          } else {
              setErr(data.error || "Verification failed. Check password.");
          }
      } catch(e) { setErr(e.message); } finally { setSavingPersonal(false); }
  };

  return (
    <div className="mgmtenv">
      <div className="topbar">
        <div className="left"><h2 className="clickable" onClick={onClose}>{isMO ? "Environment Settings" : "My Account"}</h2></div>
        <div className="right"><button className="btn" onClick={onClose}>Close</button></div>
      </div>

      {err && <div className="banner error">{err}</div>}
      {msg && <div className="banner success">{msg}</div>}
      
      {loading && <div className="sub mgmt-loading" style={{ padding: '40px' }}>Loading settings...</div>}

      {!loading && (
          <>
            {/* My Account Section */}
            <div className="section overflow-visible" style={{ border: !personalCreds.hasCreds ? '1px solid #ff9800' : '' }}>
              <div className="section-head">
                <span className="title">My Account</span>
                {!personalCreds.hasCreds && <span className="pill soft" style={{ backgroundColor: '#fff3e0', color: '#e65100', border: '1px solid #ffcc80' }}>Action Required</span>}
              </div>
              <div className="grid" style={{ gridTemplateColumns: '1fr', gap: '40px', padding: '0 24px 24px' }}>
                 <div>
                    <h3 style={{ fontSize: '15px', fontWeight: 600, marginBottom: '16px', color: 'var(--text)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        Personal BigFix Vault
                        {personalCreds.hasCreds && <span className="pill succ" style={{ fontSize: '11px', padding: '2px 6px' }}>Verified</span>}
                        {!personalCreds.hasCreds && <span className="pill err" style={{ fontSize: '11px', padding: '2px 6px', backgroundColor: '#ff9800', color: 'white', border: 'none' }}>Missing/Invalid</span>}
                    </h3>
                    <p className="text-13 muted-text" style={{ marginBottom: '20px' }}>Store your personal BigFix password in the secure vault to allow Patch Setu to seamlessly perform orchestration actions on your behalf.</p>
                    {!personalCreds.hasCreds && (
                        <div style={{ padding: '12px', backgroundColor: '#fff3e0', border: '1px solid #ffcc80', borderRadius: '6px', color: '#e65100', fontSize: '12px', marginBottom: '20px' }}>
                           ⚠️ BigFix rejected the stored credentials or you have not configured them yet. Provide your active BigFix password to continue using the app.
                        </div>
                    )}
                    <form onSubmit={handleVerifyBf}>
                        <div className="field">
                            <span className="label">BigFix Username</span>
                            <input type="text" className="control" value={personalCreds.username} disabled style={{ backgroundColor: 'var(--bg)', cursor: 'not-allowed', opacity: 0.8 }} />
                        </div>
                        <div className="field" style={{ marginBottom: '20px' }}>
                            <span className="label">BigFix Password</span>
                            <input type="password" placeholder={personalCreds.hasCreds ? "•••••••• (Saved Securely)" : "Enter BigFix Password"} className="control" value={myBfPassword} onChange={e=>setMyBfPassword(e.target.value)} required />
                        </div>
                        <button type="submit" className="btn outline small" disabled={savingPersonal}>{savingPersonal ? "Verifying with BigFix..." : "Verify & Save to Vault"}</button>
                    </form>
                 </div>
              </div>
            </div>

            {/* Master Operator Settings */}
            {isMO && (
                <>
                    {/* Security */}
                    <details className="section overflow-visible" open>
                      <summary className="section-head">
                        <span className="title">Security</span><span className="pill soft">Required</span><div className="spacer" />
                        {editingSection === 'SECURITY' ? (
                          <div className="actions">
                            <button className="btn ghost" onClick={onCancel} disabled={saving}>Cancel</button>
                            <button className="btn primary" onClick={() => onSave('SECURITY')} disabled={saving || !validationMap['SECURITY']}>{saving?"Saving…":"Save"}</button>
                          </div>
                        ) : <button className="btn" onClick={() => setEditingSection('SECURITY')} disabled={saving || editingSection !== null}>Edit</button>}
                      </summary>
                      <div className="grid">
                        {sections.SECURITY.map(it => <Field key={it.key} item={it} value={values[it.key]} onChange={onChange} invalid={invalidMap[it.key]} disabled={editingSection !== 'SECURITY'} />)}
                      </div>
                    </details>

                    {/* Global BigFix Settings */}
                    <details className="section overflow-visible" open>
                        <summary className="section-head">
                            <span className="title">Global BigFix Settings</span><span className="pill soft">Required</span>
                            <div className="spacer" />
                            {editingSection !== 'BIGFIX' && (
                                <button className="btn ghost small" onClick={replicateAndSave} style={{ marginRight: '8px' }} disabled={saving} title="Copy root settings to Sandbox, Pilot, and Production and save">
                                    Replicate to All Stages & Save
                                </button>
                            )}
                            {editingSection === 'BIGFIX' ? (
                            <div className="actions">
                                <button className="btn ghost" onClick={onCancel} disabled={saving}>Cancel</button>
                                <button className="btn primary" onClick={() => onSave('BIGFIX')} disabled={saving || !validationMap['BIGFIX']}>{saving?"Saving…":"Save"}</button>
                            </div>
                            ) : <button className="btn" onClick={() => setEditingSection('BIGFIX')} disabled={saving || editingSection !== null}>Edit</button>}
                        </summary>
                        <div className="grid">
                            {sections.BIGFIX.map(it => <Field key={it.key} item={it} value={values[it.key]} onChange={onChange} invalid={invalidMap[it.key]} disabled={editingSection !== 'BIGFIX'} />)}
                        </div>
                    </details>

                    {/* Sandbox BigFix Settings */}
                    <details className="section overflow-visible" open>
                        <summary className="section-head">
                            <span className="title">Sandbox BigFix Settings</span><span className="pill soft">Optional</span><div className="spacer" />
                            {editingSection === 'SANDBOX' ? (
                            <div className="actions">
                                <button className="btn ghost" onClick={onCancel} disabled={saving}>Cancel</button>
                                <button className="btn primary" onClick={() => onSave('SANDBOX')} disabled={saving || !validationMap['SANDBOX']}>{saving?"Saving…":"Save"}</button>
                            </div>
                            ) : <button className="btn" onClick={() => setEditingSection('SANDBOX')} disabled={saving || editingSection !== null}>Edit</button>}
                        </summary>
                        <div className="grid">
                            {sections.SANDBOX.map(it => <Field key={it.key} item={it} value={values[it.key]} onChange={onChange} invalid={invalidMap[it.key]} disabled={editingSection !== 'SANDBOX'} />)}
                        </div>
                    </details>

                    {/* Pilot BigFix Settings */}
                    <details className="section overflow-visible" open>
                        <summary className="section-head">
                            <span className="title">Pilot BigFix Settings</span><span className="pill soft">Optional</span><div className="spacer" />
                            {editingSection === 'PILOT' ? (
                            <div className="actions">
                                <button className="btn ghost" onClick={onCancel} disabled={saving}>Cancel</button>
                                <button className="btn primary" onClick={() => onSave('PILOT')} disabled={saving || !validationMap['PILOT']}>{saving?"Saving…":"Save"}</button>
                            </div>
                            ) : <button className="btn" onClick={() => setEditingSection('PILOT')} disabled={saving || editingSection !== null}>Edit</button>}
                        </summary>
                        <div className="grid">
                            {sections.PILOT.map(it => <Field key={it.key} item={it} value={values[it.key]} onChange={onChange} invalid={invalidMap[it.key]} disabled={editingSection !== 'PILOT'} />)}
                        </div>
                    </details>

                    {/* Production BigFix Settings */}
                    <details className="section overflow-visible" open>
                        <summary className="section-head">
                            <span className="title">Production BigFix Settings</span><span className="pill soft">Optional</span><div className="spacer" />
                            {editingSection === 'PRODUCTION' ? (
                            <div className="actions">
                                <button className="btn ghost" onClick={onCancel} disabled={saving}>Cancel</button>
                                <button className="btn primary" onClick={() => onSave('PRODUCTION')} disabled={saving || !validationMap['PRODUCTION']}>{saving?"Saving…":"Save"}</button>
                            </div>
                            ) : <button className="btn" onClick={() => setEditingSection('PRODUCTION')} disabled={saving || editingSection !== null}>Edit</button>}
                        </summary>
                        <div className="grid">
                            {sections.PRODUCTION.map(it => <Field key={it.key} item={it} value={values[it.key]} onChange={onChange} invalid={invalidMap[it.key]} disabled={editingSection !== 'PRODUCTION'} />)}
                        </div>
                    </details>

                    {/* Directory Services */}
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
                            {/* 🚀 BUG FIX: Removed the buggy '|| !ldapEnabled' lock. Now inputs are immediately editable when you click Edit. */}
                            {sections.LDAP.map(it => <Field key={it.key} item={it} value={values[it.key]} onChange={onChange} invalid={invalidMap[it.key]} disabled={editingSection !== 'LDAP'} />)}
                        </div>
                    </details>
                    
                    {/* SMTP */}
                    <details className="section overflow-visible" open>
                      <summary className="section-head">
                        <span className="title">SMTP / Email</span><span className="pill soft">Optional</span><div className="spacer" />
                        {editingSection === 'SMTP' ? (
                          <div className="actions">
                            <button className="btn ghost" onClick={onCancel} disabled={saving}>Cancel</button>
                            <button className="btn primary" onClick={() => onSave('SMTP')} disabled={saving || !validationMap['SMTP']}>{saving?"Saving…":"Save"}</button>
                          </div>
                        ) : <button className="btn" onClick={() => setEditingSection('SMTP')} disabled={saving || editingSection !== null}>Edit</button>}
                      </summary>
                      <div className="grid">
                        {sections.SMTP.map(it => <Field key={it.key} item={it} value={values[it.key]} onChange={onChange} invalid={smtpTouched ? invalidMap[it.key] : false} disabled={editingSection !== 'SMTP'} />)}
                      </div>
                    </details>
                    
                    {/* ServiceNow */}
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

                    {/* PRISM RISK ENGINE */}
                    <details className="section overflow-visible" open>
                      <summary className="section-head">
                        <span className="title">Prism Risk Engine</span><span className="pill soft">Optional</span><div className="spacer" />
                        {editingSection === 'PRISM' ? (
                          <div className="actions">
                            <button className="btn ghost" onClick={onCancel} disabled={saving}>Cancel</button>
                            <button className="btn primary" onClick={() => onSave('PRISM')} disabled={saving || !validationMap['PRISM']}>{saving?"Saving…":"Save"}</button>
                          </div>
                        ) : <button className="btn" onClick={() => setEditingSection('PRISM')} disabled={saving || editingSection !== null}>Edit</button>}
                      </summary>
                      <div className="grid">
                        {sections.PRISM.map(it => <Field key={it.key} item={it} value={values[it.key]} onChange={onChange} invalid={prismTouched ? invalidMap[it.key] : false} disabled={editingSection !== 'PRISM'} />)}
                      </div>
                    </details>

                    {/* VCenter */}
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
                    
                    {/* Logging */}
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
          </>
      )}
    </div>
  );
}