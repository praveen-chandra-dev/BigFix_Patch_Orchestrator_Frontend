// vite-project/src/components/Management.jsx
import { useEffect, useMemo, useRef, useState } from "react";
import PropTypes from "prop-types";

const API = globalThis.env?.VITE_API_BASE || "";

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
  LDAP_ENABLED: "ENABLE DIRECTORY SERVICES", LDAP_URL: "LDAP URL", LDAP_DOMAIN: "LDAP DOMAIN", LDAP_ALLOW_SELF_SIGNED: "LDAP ALLOW SELF SIGNED",LDAP_BIND_USER: "SERVICE ACCOUNT (BIND USER/DN)",LDAP_BIND_PASSWORD: "SERVICE ACCOUNT PASSWORD",
  SAML_ENABLED: "SAML ENABLED", FORCE_SSO: "FORCE SSO", SAML_ENTRY_POINT: "SAML ENTRY POINT", SAML_ISSUER: "SAML ISSUER", SAML_CERT: "SAML CERTIFICATE",
  PRISM_BASE_URL: "PRISM URL", PRISM_USER: "PRISM USERNAME", PRISM_PASS: "PRISM PASSWORD",
  DEBUG_LOG: "DEBUG LEVEL",
};

const TEMPLATE = [
  { key: "SESSION_TIMEOUT", value: "15", type: "number", secret: false, hint: "15", required: true },
  { key: "BIGFIX_BASE_URL", value: "", type: "string", secret: false, hint: "https://server:52311", required: true },
  { key: "BIGFIX_USER", value: "", type: "string", secret: false, hint: "e.g. bigfix", required: true },
  { key: "BIGFIX_PASS", value: "", type: "string", secret: true, hint: "", required: true },
  { key: "BIGFIX_ALLOW_SELF_SIGNED", value: "false", type: "boolean", secret: false, hint: "Allow self-signed" },
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
  { key: "LDAP_BIND_USER", type: "text", placeholder: "CN=ServiceUser,OU=IT,DC=domain,DC=com" },
  { key: "LDAP_BIND_PASSWORD", type: "password", placeholder: "••••••••" },
  { key: "LDAP_ALLOW_SELF_SIGNED", value: "false", type: "boolean", secret: false, hint: "Disable SSL validation (internal)" },
  { key: "SAML_ENABLED", value: "false", type: "boolean", secret: false, hint: "Allow users to log in using Okta" },
  { key: "FORCE_SSO", value: "false", type: "boolean", secret: false, hint: "Hide local login form completely" },
  { key: "SAML_ENTRY_POINT", value: "", type: "string", secret: false, hint: "https://dev-xxxxx.okta.com/app/xxx/sso/saml" },
  { key: "SAML_ISSUER", value: "patch-setu-app", type: "string", secret: false, hint: "e.g. patch-setu-app" },
  { key: "SAML_CERT", value: "", type: "textarea", secret: false, hint: "Paste the Okta X.509 certificate here..." },
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
  { key: "PRISM_BASE_URL", value: "", type: "string", secret: false, hint: "https://prism-engine:8000" },
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

Switch.propTypes = {
  checked: PropTypes.bool.isRequired,
  onChange: PropTypes.func.isRequired,
  id: PropTypes.string.isRequired,
  disabled: PropTypes.bool
};

function Select({ value, options, onChange, placeholder, disabled = false }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  
  useEffect(() => { 
      const onDoc = (e) => { 
          if (!ref.current?.contains(e.target)) setOpen(false); 
      }; 
      document.addEventListener("mousedown", onDoc); 
      return () => document.removeEventListener("mousedown", onDoc); 
  }, []);
  
  const getLabel = (opt) => (typeof opt === "string" ? opt : (opt?.label ?? opt?.value ?? ""));
  const getValue = (opt) => (typeof opt === "string" ? opt : (opt?.value ?? ""));
  
  let label = placeholder || "Select";
  const match = (options || []).find(o => getValue(o) === value);
  if (match) {
      label = getLabel(match);
  }

  return (
    <div ref={ref} className={`select ${open ? "open" : ""}`}>
      <button type="button" className="select-btn" onClick={() => setOpen(o=>!o)} disabled={disabled}>
        <span>{label}</span>
        <svg width="16" height="16" viewBox="0 0 20 20" aria-hidden="true"><path d="M5 7l5 6 5-6" fill="none" stroke="currentColor" strokeWidth="2"/></svg>
      </button>
      {/* S6819 & S6842 & S1082 Fix: Native accessible buttons replacing role='listbox' lists */}
      {open && (
        <div className="menu">
          {(options || []).map((opt, idx) => {
            const v = getValue(opt); 
            const l = getLabel(opt); 
            const sel = v === value;
            return (
                <button type="button" key={`${v}-${idx}`} className={`item ${sel ? "sel" : ""}`} onClick={() => { onChange(v); setOpen(false); }} style={{width: '100%', textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer'}}>
                  {l}{sel && <span className="tick">✓</span>}
                </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

Select.propTypes = {
  value: PropTypes.string,
  options: PropTypes.array.isRequired,
  onChange: PropTypes.func.isRequired,
  placeholder: PropTypes.string,
  disabled: PropTypes.bool
};

// S3776 Fix: Extracted from Field to reduce Cognitive Complexity
const renderInputField = (item, val, disabled, show, setShow, onChange) => {
    if (item.type === "boolean") {
        return <Switch id={item.key} checked={String(val).toLowerCase() === "true"} onChange={(next) => onChange(item.key, next ? "true" : "false")} disabled={disabled} />;
    }
    if (item.type === "enum" || item.type === "enum-map") {
        return (
          <div className="inputwrap">
            <Select value={val} options={item.options || []} onChange={(v) => onChange(item.key, v)} placeholder="" disabled={disabled} />
            {item.key === "DEBUG_LOG" && <button type="button" className="ghost tiny" onClick={() => onChange(item.key, val === "1" ? "0" : "1")} disabled={disabled}>{val === "1" ? "Debug" : "Info"}</button>}
          </div>
        );
    }
    if (item.type === "textarea") {
        return (
          <div className="inputwrap" style={{ height: 'auto', padding: 0 }}>
            <textarea id={item.key} className="control" placeholder={item.hint || ""} value={val} onChange={(e) => onChange(item.key, e.target.value)} disabled={disabled} rows={6} style={{ fontFamily: "monospace", fontSize: "12px", resize: "vertical", width: "100%", padding: "10px", border: "none", outline: "none", background: "transparent" }} />
          </div>
        );
    }
    return (
        <div className="inputwrap">
          <input id={item.key} type={item.secret && !show ? "password" : item.type === "number" ? "number" : "text"} placeholder={item.hint || ""} value={val} onChange={(e) => onChange(item.key, e.target.value)} autoComplete="off" disabled={disabled} min={item.type === "number" ? "1" : undefined} />
          {item.secret && <button type="button" className="ghost tiny" onClick={() => setShow(s => !s)} disabled={disabled}>{show ? "Hide" : "Show"}</button>}
        </div>
    );
};

function Field({ item, value, onChange, invalid, disabled = false }) {
  const [show, setShow] = useState(false);
  const val = value ?? item.value ?? "";
  
  return (
    <div className={`field ${invalid ? "invalid" : ""}`}>
      <div className="meta">
        <label htmlFor={item.key}>{LABELS[item.key] ?? item.key}{REQUIRED_KEYS.has(item.key) ? <span className="req">*</span> : null}</label>
        {item.hint && <div className="hint">{item.hint}</div>}
      </div>
      {renderInputField(item, val, disabled, show, setShow, onChange)}
    </div>
  );
}

Field.propTypes = {
  item: PropTypes.shape({
      key: PropTypes.string.isRequired,
      type: PropTypes.string.isRequired,
      secret: PropTypes.bool,
      value: PropTypes.string,
      hint: PropTypes.string,
      options: PropTypes.array
  }).isRequired,
  value: PropTypes.string,
  onChange: PropTypes.func.isRequired,
  invalid: PropTypes.bool,
  disabled: PropTypes.bool
};

function isEmail(x) { return /^[^\s@]+@[^\s@.]+(?:\.[^\s@.]+)+$/.test(String(x).trim()); }
function listValidEmails(s) { if (!s) return true; return String(s).split(",").map(v => v.trim()).filter(Boolean).every(isEmail); }

// S3776 Fix: Extracted from main component body
const getInvalidMap = (values, smtpTouched, vcenterTouched, prismTouched, ldapEnabled, editingSection, isMO) => {
    const m = {};
    for (const it of TEMPLATE) {
        if (REQUIRED_KEYS.has(it.key)) {
            if (it.secret && editingSection !== 'BIGFIX') { 
                m[it.key] = false; 
                continue; 
            }
            m[it.key] = (values[it.key] ?? it.value ?? "").toString().trim() === "";
        }
    }
    // S2681 Fix: Included block braces to ensure all statements execute conditionally
    if (isMO) {
        if (smtpTouched) { 
            m.SMTP_HOST = (values.SMTP_HOST ?? "").trim() === ""; 
            m.SMTP_FROM = !isEmail((values.SMTP_FROM ?? "").trim()); 
            m.SMTP_TO = !listValidEmails(values.SMTP_TO); 
        }
        if (vcenterTouched) {
            m.VCENTER_URL = (values.VCENTER_URL ?? "").trim() === "";
        }
        if (prismTouched) {
            m.PRISM_BASE_URL = (values.PRISM_BASE_URL ?? "").trim() === "";
        }
        if (ldapEnabled) { 
            m.LDAP_URL = (values.LDAP_URL ?? "").trim() === ""; 
            m.LDAP_DOMAIN = (values.LDAP_DOMAIN ?? "").trim() === ""; 
        }
    }
    return m;
};

// S3776 Fix: Extracted from main component body
const getValidationMap = (sections, invalidMap, smtpTouched, prismTouched, vcenterTouched, isMO) => {
    const map = {
        SECURITY: sections.SECURITY.every(it => !invalidMap[it.key]),
        BIGFIX: sections.BIGFIX.every(it => !invalidMap[it.key]),
        SANDBOX: sections.SANDBOX.every(it => !invalidMap[it.key]),
        PILOT: sections.PILOT.every(it => !invalidMap[it.key]),
        PRODUCTION: sections.PRODUCTION.every(it => !invalidMap[it.key]),
    };
    if (isMO) {
        map.LDAP = sections.LDAP.every(it => !invalidMap[it.key]);
        map.SAML = sections.SAML.every(it => !invalidMap[it.key]);
        map.SMTP = sections.SMTP.every(it => !(smtpTouched ? invalidMap[it.key] : false));
        map.SN = true;
        map.PRISM = sections.PRISM.every(it => !(prismTouched ? invalidMap[it.key] : false));
        map.VCENTER = sections.VCENTER.every(it => !(vcenterTouched ? invalidMap[it.key] : false));
        map.DEBUG = true;
    }
    return map;
};

// S3776 Fix: Sub-component abstracts repeating JSX logic to reduce Cognitive Complexity
const ConfigSection = ({ title, sectionKey, isOptional, sections, values, onChange, invalidMap, validationMap, editingSection, setEditingSection, onSave, onCancel, saving, extraActions, touchCondition }) => (
    <details className="section overflow-visible" open>
        <summary className="section-head">
            <span className="title">{title}</span>
            <span className="pill soft">{isOptional ? "Optional" : "Required"}</span>
            <div className="spacer" />
            {extraActions && editingSection !== 'BIGFIX' && extraActions}
            {editingSection === sectionKey ? (
            <div className="actions">
                <button type="button" className="btn ghost" onClick={onCancel} disabled={saving}>Cancel</button>
                <button type="button" className="btn primary" onClick={() => onSave(sectionKey)} disabled={saving || !validationMap[sectionKey]}>{saving?"Saving…":"Save"}</button>
            </div>
            ) : <button type="button" className="btn" onClick={() => setEditingSection(sectionKey)} disabled={saving || editingSection !== null}>Edit</button>}
        </summary>
        <div className="grid">
            {sections[sectionKey].map(it => <Field key={it.key} item={it} value={values[it.key]} onChange={onChange} invalid={touchCondition !== undefined ? (touchCondition ? invalidMap[it.key] : false) : invalidMap[it.key]} disabled={editingSection !== sectionKey} />)}
        </div>
    </details>
);

ConfigSection.propTypes = {
    title: PropTypes.string.isRequired,
    sectionKey: PropTypes.string.isRequired,
    isOptional: PropTypes.bool.isRequired,
    sections: PropTypes.object.isRequired,
    values: PropTypes.object.isRequired,
    onChange: PropTypes.func.isRequired,
    invalidMap: PropTypes.object.isRequired,
    validationMap: PropTypes.object.isRequired,
    editingSection: PropTypes.string,
    setEditingSection: PropTypes.func.isRequired,
    onSave: PropTypes.func.isRequired,
    onCancel: PropTypes.func.isRequired,
    saving: PropTypes.bool,
    extraActions: PropTypes.node,
    touchCondition: PropTypes.bool
};

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
      SAML_: ["SAML_ENABLED", "FORCE_SSO", "SAML_ENTRY_POINT", "SAML_ISSUER", "SAML_CERT"],
      SMTP_: ["SMTP_HOST","SMTP_USER","SMTP_PASSWORD","SMTP_FROM","SMTP_TO","SMTP_PORT","SMTP_SECURE","SMTP_CC","SMTP_BCC","SMTP_ALLOW_SELF_SIGNED"],
      SN_: ["SN_URL","SN_USER","SN_PASSWORD","SN_ALLOW_SELF_SIGNED"],
      PRISM_: ["PRISM_BASE_URL","PRISM_USER","PRISM_PASS"],
      VCENTER_:["VCENTER_URL", "VCENTER_USER", "VCENTER_PASSWORD", "VCENTER_ALLOW_SELF_SIGNED"],
      DEBUG_: ["DEBUG_LOG"]
    };
    const pick = (pfx) => TEMPLATE.filter(i => i.key.startsWith(pfx) || ord[pfx].includes(i.key)).sort((a,b) => (ord[pfx] || []).indexOf(a.key) - (ord[pfx] || []).indexOf(b.key));
    if (!isMO) return { SECURITY: [], BIGFIX: [], SANDBOX: [], PILOT: [], PRODUCTION: [], LDAP: [], SAML: [], SMTP: [], SN: [], PRISM: [], VCENTER: [], DEBUG: [] };
    return {
      SECURITY: pick("SECURITY_"),
      BIGFIX: pick("BIGFIX_"),
      SANDBOX: pick("SANDBOX_"),
      PILOT: pick("PILOT_"),
      PRODUCTION: pick("PRODUCTION_"),
      LDAP: pick("LDAP_"),
      SAML: pick("SAML_"),
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

  const invalidMap = useMemo(() => getInvalidMap(values, smtpTouched, vcenterTouched, prismTouched, ldapEnabled, editingSection, isMO), [values, smtpTouched, vcenterTouched, prismTouched, ldapEnabled, editingSection, isMO]);
  const validationMap = useMemo(() => getValidationMap(sections, invalidMap, smtpTouched, prismTouched, vcenterTouched, isMO), [sections, invalidMap, smtpTouched, prismTouched, vcenterTouched, isMO]);

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
              setMsg(data.message || "Credentials verified.");
              setPersonalCreds(prev => ({ ...prev, hasCreds: true }));
              setMyBfPassword("");
              globalThis.dispatchEvent(new CustomEvent('bf-creds-updated'));
          } else {
              setErr(data.error || "Verification failed. Check password.");
          }
      } catch(e) { setErr(e.message); } finally { setSavingPersonal(false); }
  };

  return (
    <div className="mgmtenv">
      <div className="topbar">
        <div className="left">
            {/* S6847 & S1082 Fix: Swapped clickable div for native accessible button */}
            <h2><button type="button" className="name-link" onClick={onClose} style={{fontSize: '22px', fontWeight: 600, color: 'var(--text)', background: 'none', border: 'none', padding: 0}}>{isMO ? "Environment Settings" : "My Account"}</button></h2>
        </div>
        <div className="right"><button type="button" className="btn" onClick={onClose}>Close</button></div>
      </div>

      {err && <div className="banner error">{err}</div>}
      {msg && <div className="banner success">{msg}</div>}
      
      {loading && <div className="sub mgmt-loading" style={{ padding: '40px' }}>Loading settings...</div>}

      {!loading && (
          <>
            {/* My Account Section */}
            {/* S7735 Fix: Reordered the ternary to evaluate the positive branch first */}
            <div className="section overflow-visible" style={{ border: personalCreds.hasCreds ? '' : '1px solid #ff9800' }}>
              <div className="section-head">
                <span className="title">My Account</span>
                {!personalCreds.hasCreds && <span className="pill soft" style={{ backgroundColor: '#fff3e0', color: '#e65100', border: '1px solid #ffcc80' }}>Action Required</span>}
              </div>
              <div className="grid" style={{ gridTemplateColumns: '1fr', gap: '40px', padding: '0 24px 24px' }}>
                 <div>
                    <h3 style={{ fontSize: '15px', fontWeight: 600, marginBottom: '16px', color: 'var(--text)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        Personal BigFix Credential
                        {personalCreds.hasCreds && <span className="pill succ" style={{ fontSize: '11px', padding: '2px 6px' }}>Verified</span>}
                        {!personalCreds.hasCreds && <span className="pill err" style={{ fontSize: '11px', padding: '2px 6px', backgroundColor: '#ff9800', color: 'white', border: 'none' }}>Missing/Invalid</span>}
                    </h3>
                    <p className="text-13 muted-text" style={{ marginBottom: '20px' }}>Store your personal BigFix password in the securely to allow Patch Setu to seamlessly perform orchestration actions on your behalf.</p>
                    {!personalCreds.hasCreds && (
                        <div style={{ padding: '12px', backgroundColor: '#fff3e0', border: '1px solid #ffcc80', borderRadius: '6px', color: '#e65100', fontSize: '12px', marginBottom: '20px' }}>
                            BigFix rejected the stored credentials or you have not configured them yet. Provide your active BigFix password to continue using the app.
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
                        <button type="submit" className="btn outline small" disabled={savingPersonal}>{savingPersonal ? "Verifying with BigFix..." : "Verify"}</button>
                    </form>
                 </div>
              </div>
            </div>

          
            {isMO && (
                <>
                    <ConfigSection title="Security" sectionKey="SECURITY" isOptional={false} sections={sections} values={values} onChange={onChange} invalidMap={invalidMap} validationMap={validationMap} editingSection={editingSection} setEditingSection={setEditingSection} onSave={onSave} onCancel={onCancel} saving={saving} />
                    
                    <ConfigSection title="Global BigFix Settings" sectionKey="BIGFIX" isOptional={false} sections={sections} values={values} onChange={onChange} invalidMap={invalidMap} validationMap={validationMap} editingSection={editingSection} setEditingSection={setEditingSection} onSave={onSave} onCancel={onCancel} saving={saving}
                        
                    />

                    {/* Master Operator Settings -

                    <ConfigSection title="Sandbox BigFix Settings" sectionKey="SANDBOX" isOptional={true} sections={sections} values={values} onChange={onChange} invalidMap={invalidMap} validationMap={validationMap} editingSection={editingSection} setEditingSection={setEditingSection} onSave={onSave} onCancel={onCancel} saving={saving} />
                    
                    <ConfigSection title="Pilot BigFix Settings" sectionKey="PILOT" isOptional={true} sections={sections} values={values} onChange={onChange} invalidMap={invalidMap} validationMap={validationMap} editingSection={editingSection} setEditingSection={setEditingSection} onSave={onSave} onCancel={onCancel} saving={saving} />
                    
                    <ConfigSection title="Production BigFix Settings" sectionKey="PRODUCTION" isOptional={true} sections={sections} values={values} onChange={onChange} invalidMap={invalidMap} validationMap={validationMap} editingSection={editingSection} setEditingSection={setEditingSection} onSave={onSave} onCancel={onCancel} saving={saving} />
                    
                     S3776 Fix: Abstraction via ConfigSection */}
                     
                    <ConfigSection title="Directory Services (LDAP)" sectionKey="LDAP" isOptional={true} sections={sections} values={values} onChange={onChange} invalidMap={invalidMap} validationMap={validationMap} editingSection={editingSection} setEditingSection={setEditingSection} onSave={onSave} onCancel={onCancel} saving={saving} />
                    
                    <ConfigSection title="Okta SAML 2.0 Settings" sectionKey="SAML" isOptional={true} sections={sections} values={values} onChange={onChange} invalidMap={invalidMap} validationMap={validationMap} editingSection={editingSection} setEditingSection={setEditingSection} onSave={onSave} onCancel={onCancel} saving={saving} />
                    
                    <ConfigSection title="SMTP / Email" sectionKey="SMTP" isOptional={true} sections={sections} values={values} onChange={onChange} invalidMap={invalidMap} validationMap={validationMap} editingSection={editingSection} setEditingSection={setEditingSection} onSave={onSave} onCancel={onCancel} saving={saving} touchCondition={smtpTouched} />
                    
                    <ConfigSection title="ServiceNow" sectionKey="SN" isOptional={true} sections={sections} values={values} onChange={onChange} invalidMap={invalidMap} validationMap={validationMap} editingSection={editingSection} setEditingSection={setEditingSection} onSave={onSave} onCancel={onCancel} saving={saving} />
                    
                    <ConfigSection title="Prism Risk Engine" sectionKey="PRISM" isOptional={true} sections={sections} values={values} onChange={onChange} invalidMap={invalidMap} validationMap={validationMap} editingSection={editingSection} setEditingSection={setEditingSection} onSave={onSave} onCancel={onCancel} saving={saving} touchCondition={prismTouched} />
                    
                    <ConfigSection title="VCenter" sectionKey="VCENTER" isOptional={true} sections={sections} values={values} onChange={onChange} invalidMap={invalidMap} validationMap={validationMap} editingSection={editingSection} setEditingSection={setEditingSection} onSave={onSave} onCancel={onCancel} saving={saving} touchCondition={vcenterTouched} />
                    
                    <ConfigSection title="Logging" sectionKey="DEBUG" isOptional={true} sections={sections} values={values} onChange={onChange} invalidMap={invalidMap} validationMap={validationMap} editingSection={editingSection} setEditingSection={setEditingSection} onSave={onSave} onCancel={onCancel} saving={saving} />
                </>
            )}
          </>
      )}
    </div>
  );
}

Management.propTypes = {
  onClose: PropTypes.func.isRequired
};