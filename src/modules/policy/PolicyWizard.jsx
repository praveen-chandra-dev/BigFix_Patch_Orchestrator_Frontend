// src/modules/policy/PolicyWizard.jsx
import { useState, useEffect } from "react";
import FancySelect from "../../components/common/FancySelect";
import InlineSpinner from "../../components/common/InlineSpinner";
import { useToast } from "../../components/common/CustomToast";

const API = window.env?.VITE_API_BASE || "http://localhost:5174";
async function apiFetch(url, options = {}) {
  const r = await fetch(`${API}${url}`, {
    ...options, credentials: "include",
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
  });
  const j = await r.json().catch(() => ({ ok: false, error: "Parse error" }));
  if (!r.ok || j.ok === false) throw new Error(j.error || `HTTP ${r.status}`);
  return j;
}

// ── Step definitions ─────────────────────────────────────────────────────────
const STEPS = [
  { id: "details",   label: "Details",   icon: "📋" },
  { id: "patches",   label: "Patches",   icon: "🛡" },
  { id: "computers", label: "Computers", icon: "💻" },
  { id: "schedule",  label: "Schedule",  icon: "🕐" },
  { id: "review",    label: "Review",    icon: "✅" },
];

const EMPTY_PATCH_DEF = () => ({
  id: Date.now() + Math.random(),
  severities: [],
  sites: [],
  vendors: [],
  source_ids: "",
  include_keywords: "",
  exclude_keywords: "",
  approved_only: true,
});

const EMPTY_COMPUTER_DEF = () => ({
  id: Date.now() + Math.random(),
  type: "group",
  group_id: "", group_name: "",
  property_name: "", property_operator: "=", property_value: "",
  value: "",
});

const EMPTY_SCHEDULE = () => ({
  enabled: false,
  timezone: "UTC",
  type: "weekly",
  days_of_week: [], day_of_month: 1, week_of_month: 1, weekday_of_month: 1,
  time_hour: 2, time_minute: 0,
  interval_hours: 24,
  
  refresh_enabled: false,
  refresh_timezone: "UTC",
  refresh_type: "interval",
  refresh_days_of_week: [], refresh_day_of_month: 1, refresh_week_of_month: 1, refresh_weekday_of_month: 1,
  refresh_time_hour: 2, refresh_time_minute: 0,
  refresh_interval_hours: 24,

  retry_on_failure: false,
  skip_if_not_relevant: false,
  user_restart_prompt: false,
});

const SEV_OPTIONS = [
  { value: "Critical",    label: "Critical" },
  { value: "Important",   label: "Important" },
  { value: "Moderate",    label: "Moderate" },
  { value: "Low",         label: "Low" },
  { value: "Unspecified", label: "Unspecified" },
];
const SEV_COLOR = {
  Critical: "var(--danger)", Important: "var(--warn-text)", Moderate: "var(--info)",
  Low: "var(--success-text)", Unspecified: "var(--muted)",
};
const DOW_LABELS = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
const WEEK_OF_MONTH = [
  { value: 1, label: "1st" }, { value: 2, label: "2nd" },
  { value: 3, label: "3rd" }, { value: 4, label: "4th" }, { value: 5, label: "Last" },
];

const CheckIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="20 6 9 17 4 12"></polyline>
  </svg>
);

// ── Tiny helpers ─────────────────────────────────────────────────────────────
function SectionHeader({ title, subtitle }) {
  return (
    <div style={{ marginBottom: 4 }}>
      <h3 style={{ fontSize: 16, fontWeight: 600, color: "var(--text)", margin: "0 0 4px", fontFamily: "'HCL BOOMER', sans-serif" }}>{title}</h3>
      {subtitle && <p style={{ fontSize: 13, color: "var(--muted)", margin: 0, lineHeight: 1.5 }}>{subtitle}</p>}
    </div>
  );
}

function FieldRow({ label, required, hint, children, style }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6, ...style }}>
      <label style={{ fontSize: 13, fontWeight: 500, color: "var(--text)" }}>
        {label}{required && <span style={{ color: "var(--danger)", marginLeft: 2 }}>*</span>}
      </label>
      {children}
      {hint && <span style={{ fontSize: 12, color: "var(--muted)", marginTop: 2 }}>{hint}</span>}
    </div>
  );
}

function SevPill({ sev }) {
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 4,
      padding: "2px 8px", borderRadius: 10, fontSize: 11, fontWeight: 600,
      background: "var(--panel-2)", border: "1px solid var(--border)",
      color: SEV_COLOR[sev] || "var(--muted)",
    }}>{sev}</span>
  );
}

function GenericPill({ label }) {
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 4,
      padding: "2px 8px", borderRadius: 10, fontSize: 11, fontWeight: 500,
      background: "var(--panel-2)", border: "1px solid var(--border)",
      color: "var(--text)",
    }}>{label}</span>
  );
}

function Switch({ on, onToggle, label }) {
  return (
    <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer", userSelect: "none" }}>
      <div style={{
        width: 44, height: 24, background: on ? "var(--primary)" : "var(--border)",
        borderRadius: 12, position: "relative", transition: "background 0.2s", cursor: "pointer", flexShrink: 0,
      }} onClick={onToggle}>
        <div style={{
          position: "absolute", top: 3, left: on ? 23 : 3, width: 18, height: 18,
          background: "white", borderRadius: "50%", transition: "left 0.2s",
          boxShadow: "0 1px 3px rgba(0,0,0,0.25)",
        }} />
      </div>
      {label && <span style={{ fontSize: 14, fontWeight: 500, color: "var(--text)" }}>{label}</span>}
    </label>
  );
}

// ── Client-side patch matching (mirrors backend) ──────────────────────────────
function matchApprovedPatches(patches, patchDefs) {
  if (!patchDefs || patchDefs.length === 0) return [];
  const matched = new Map();
  for (const patch of patches) {
    const name   = (patch.patch_name || "").toLowerCase();
    const sev    = (patch.severity || patch.source_severity || "").toUpperCase();
    const site   = (patch.site_name || "").toLowerCase();
    const vendor = (patch.vendor || "").toLowerCase();
    const pid    = (patch.patch_id || "").toLowerCase();

    for (const def of patchDefs) {
      let ok = true;
      if (def.severities?.length > 0) {
        const sevs = def.severities.map(s => s.toUpperCase());
        if (!sevs.includes(sev)) ok = false;
      }
      if (ok && def.sites?.length > 0) {
        if (!def.sites.some(s => site.includes(s.toLowerCase()))) ok = false;
      }
      if (ok && def.vendors?.length > 0) {
        if (!def.vendors.some(v => vendor.includes(v.toLowerCase()))) ok = false;
      }
      if (ok && def.source_ids) {
        const ids = def.source_ids.split(",").map(s => s.trim().toLowerCase()).filter(Boolean);
        if (ids.length > 0 && !ids.some(id => pid.includes(id) || name.includes(id))) ok = false;
      }
      if (ok && def.include_keywords) {
        const kws = def.include_keywords.split(",").map(s => s.trim().toLowerCase()).filter(Boolean);
        if (kws.length > 0 && !kws.some(k => name.includes(k))) ok = false;
      }
      if (ok && def.exclude_keywords) {
        const kws = def.exclude_keywords.split(",").map(s => s.trim().toLowerCase()).filter(Boolean);
        if (kws.length > 0 && kws.some(k => name.includes(k))) ok = false;
      }

      if (ok) {
        const key = patch.patch_id || name;
        if (!matched.has(key)) matched.set(key, patch);
        break;
      }
    }
  }
  return [...matched.values()];
}

// ════════════════════════════════════════════════════════════
// STEP 1 – Details
// ════════════════════════════════════════════════════════════
function StepDetails({ data, onChange, availableRoles }) {
  return (
    <div className="wizard-step-body">
      <SectionHeader title="Policy Details" subtitle="Give your policy a name, description, and define its visibility scope." />

      <FieldRow label="Policy Name" required hint="A unique, descriptive name for this policy.">
        <input className="control" type="text" placeholder="e.g. Monthly Windows Security Patches"
          value={data.policy_name || ""}
          onChange={e => onChange("policy_name", e.target.value)} />
      </FieldRow>

      <FieldRow label="Description">
        <textarea className="control" style={{ height: 80, resize: "vertical", padding: "8px 12px", lineHeight: 1.5 }}
          placeholder="Optional description…"
          value={data.description || ""}
          onChange={e => onChange("description", e.target.value)} />
      </FieldRow>

      <FieldRow label="Scope" required hint="Private: only you. Public: visible to selected roles.">
        <div style={{ display: "flex", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", overflow: "hidden", width: "fit-content" }}>
          {["private","public"].map(s => (
            <button key={s} type="button"
              style={{
                padding: "8px 20px", border: "none", fontFamily: "inherit", fontSize: 14, fontWeight: 500,
                cursor: "pointer", transition: "all 0.15s",
                background: data.scope === s ? "var(--primary)" : "var(--panel)",
                color: data.scope === s ? "white" : "var(--muted)",
                borderRight: s === "private" ? "1px solid var(--border)" : "none",
              }}
              onClick={() => onChange("scope", s)}>
              {s === "private" ? "🔒 Private" : "🌐 Public"}
            </button>
          ))}
        </div>
      </FieldRow>

      {data.scope === "public" && (
        <FieldRow label="Visible to Roles" hint="Empty = all roles can see this policy.">
          <FancySelect
            options={availableRoles.map(r => ({ value: r, label: r }))}
            value={data.visible_roles || []}
            onChange={v => onChange("visible_roles", v)}
            multiSelect searchable placeholder="— Select roles (empty = all) —" />
        </FieldRow>
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════════
// STEP 2 – Patches
// ════════════════════════════════════════════════════════════
function StepPatches({ defs, onChange, siteOptions, vendorOptions, approvedPatches, patchesLoading }) {
  const updateDef = (id, updates) =>
    onChange(defs.map(d => d.id === id ? { ...d, ...updates, approved_only: true } : d));
  const addDef    = () => onChange([...defs, EMPTY_PATCH_DEF()]);
  const removeDef = id => onChange(defs.filter(d => d.id !== id));

  return (
    <div className="wizard-step-body">
      <SectionHeader
        title="Patch Definitions"
        subtitle="Define which approved patches this policy targets. Filters are combined with AND logic per definition; multiple definitions use OR logic."
      />

      <div style={{
        display: "flex", alignItems: "flex-start", gap: 10, padding: "10px 14px",
        background: "#f0fdf4", border: "1px solid var(--success)", borderRadius: "var(--radius-sm)",
        fontSize: 13, color: "var(--success-text)",
      }}>
        <span style={{ flexShrink: 0, fontSize: 16 }}>🔒</span>
        <span><strong>Approved patches only.</strong> This policy always targets patches approved in BigFix. Unapproved patches are automatically excluded and this cannot be changed.</span>
      </div>

      {patchesLoading && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, color: "var(--muted)", fontSize: 13 }}>
          <InlineSpinner size={14} /> Loading patch catalogue…
        </div>
      )}

      {!patchesLoading && approvedPatches.length === 0 && (
        <div style={{ fontSize: 13, color: "var(--muted)", padding: "4px 0" }}>
          ⚠️ No approved patches found. Ensure patches are approved in BigFix. Filters will still be saved.
        </div>
      )}

      {defs.map((def, idx) => {
        const preview = matchApprovedPatches(approvedPatches, [def]);
        return (
          <div key={def.id} className="def-card">
            <div className="def-card-header">
              <span className="def-card-title">Definition {idx + 1}</span>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{
                  display: "inline-flex", alignItems: "center", gap: 5,
                  fontSize: 12, fontWeight: 600, color: "var(--success-text)",
                  background: "#f0fdf4", border: "1px solid var(--success)",
                  padding: "3px 10px", borderRadius: 10,
                }}>🔒 Approved Only (Locked)</span>
                {defs.length > 1 && (
                  <button className="remove-block-btn" onClick={() => removeDef(def.id)}>🗑 Remove</button>
                )}
              </div>
            </div>

            <div className="def-grid">
              <FieldRow label="Severity">
                <FancySelect
                  options={SEV_OPTIONS} value={def.severities || []}
                  onChange={v => updateDef(def.id, { severities: v })} multiSelect placeholder="All severities" />
                {(def.severities || []).length > 0 && (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 4 }}>
                    {def.severities.map(s => <SevPill key={s} sev={s} />)}
                  </div>
                )}
              </FieldRow>

              <FieldRow label="Site">
                <FancySelect
                  options={siteOptions} value={def.sites || []}
                  onChange={v => updateDef(def.id, { sites: v })} multiSelect searchable placeholder="All sites" />
                {(def.sites || []).length > 0 && (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 4 }}>
                    {def.sites.map(s => <GenericPill key={s} label={s} />)}
                  </div>
                )}
              </FieldRow>

              <FieldRow label="Source / Vendor">
                <FancySelect
                  options={vendorOptions} value={def.vendors || []}
                  onChange={v => updateDef(def.id, { vendors: v })} multiSelect searchable
                  placeholder={vendorOptions.length > 0 ? "All vendors" : "e.g. Microsoft"} />
                {(def.vendors || []).length > 0 && (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 4 }}>
                    {def.vendors.map(v => <GenericPill key={v} label={v} />)}
                  </div>
                )}
              </FieldRow>

              <FieldRow label="Source IDs / KB Numbers" hint="Comma-separated. Matched against patch ID and name.">
                <input className="control" type="text"
                  placeholder="e.g. KB5030219, KB5030220"
                  value={def.source_ids || ""}
                  onChange={e => updateDef(def.id, { source_ids: e.target.value })} />
              </FieldRow>

              <FieldRow label="Include Keywords" hint="Comma-separated — matched against patch name.">
                <input className="control" type="text"
                  placeholder="e.g. security, cumulative"
                  value={def.include_keywords || ""}
                  onChange={e => updateDef(def.id, { include_keywords: e.target.value })} />
              </FieldRow>

              <FieldRow label="Exclude Keywords" hint="Comma-separated — patches matching any keyword are excluded.">
                <input className="control" type="text"
                  placeholder="e.g. preview, optional, beta"
                  value={def.exclude_keywords || ""}
                  onChange={e => updateDef(def.id, { exclude_keywords: e.target.value })} />
              </FieldRow>
            </div>

            {/* Live match preview */}
            <div style={{ borderTop: "1px solid var(--border)", background: "var(--bg)", padding: "12px 20px" }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                Live preview:
              </span>
              <span style={{
                marginLeft: 8, background: preview.length > 0 ? "var(--primary)" : "var(--muted)",
                color: "white", borderRadius: 10, padding: "1px 8px", fontSize: 11, fontWeight: 700,
              }}>{patchesLoading ? "…" : preview.length} approved patches match</span>
              {preview.length > 0 && (
                <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 3 }}>
                  {preview.slice(0, 5).map(p => (
                    <div key={p.patch_id} style={{ fontSize: 12, color: "var(--text)", display: "flex", gap: 8, alignItems: "center" }}>
                      <code style={{ fontSize: 11, color: "var(--muted)", whiteSpace: "nowrap" }}>
                        {String(p.patch_id || "").replace(/^BIGFIX-/i, "")}
                      </code>
                      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.patch_name}</span>
                      <SevPill sev={(p.severity || p.source_severity || "UNSPECIFIED").toUpperCase()} />
                    </div>
                  ))}
                  {preview.length > 5 && (
                    <span style={{ fontSize: 11, color: "var(--muted)" }}>…and {preview.length - 5} more</span>
                  )}
                </div>
              )}
            </div>
          </div>
        );
      })}

      <button className="add-block-btn" type="button" onClick={addDef}>
        + Add Another Patch Definition
      </button>
    </div>
  );
}

// ════════════════════════════════════════════════════════════
// STEP 3 – Computers
// ════════════════════════════════════════════════════════════
function StepComputers({ defs, onChange, groupOptions, propertyOptions, computersLoading }) {
  const { showToast } = useToast();
  const [previews, setPreviews] = useState({});
  const [previewing, setPreviewing] = useState({});

  const updateDef = (id, updates) => onChange(defs.map(d => d.id === id ? { ...d, ...updates } : d));
  const addDef    = () => onChange([...defs, EMPTY_COMPUTER_DEF()]);
  const removeDef = id => onChange(defs.filter(d => d.id !== id));

  const loadPreview = async (def) => {
    setPreviewing(p => ({ ...p, [def.id]: true }));
    try {
      const res = await apiFetch("/api/policies/preview-computers", {
        method: "POST",
        body: JSON.stringify({ computer_definitions: [def] })
      });
      setPreviews(p => ({ ...p, [def.id]: res.computers || [] }));
    } catch (e) {
      showToast("Failed to load computer preview.", "error");
    } finally {
      setPreviewing(p => ({ ...p, [def.id]: false }));
    }
  };

  return (
    <div className="wizard-step-body">
      <SectionHeader
        title="Computer Targets"
        subtitle="Define which computers this policy applies to. Multiple targets are combined with OR logic."
      />

      {computersLoading && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, color: "var(--muted)", fontSize: 13 }}>
          <InlineSpinner size={14} /> Loading computer groups and properties…
        </div>
      )}

      {defs.map((def, idx) => (
        <div key={def.id} className="def-card">
          <div className="def-card-header">
            <span className="def-card-title">Target {idx + 1}</span>
            {defs.length > 1 && (
              <button className="remove-block-btn" onClick={() => removeDef(def.id)}>🗑 Remove</button>
            )}
          </div>

          <div className="def-grid">
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <label style={{ fontSize: 13, fontWeight: 500, color: "var(--text)" }}>Target By</label>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {[
                  { type: "group",    label: "👥 Group" },
                  { type: "property", label: "📊 Property" },
                  { type: "name",     label: "💻 Name / Pattern" },
                ].map(t => (
                  <button key={t.type} type="button"
                    className={`computer-target-type-btn ${def.type === t.type ? "active" : ""}`}
                    onClick={() => updateDef(def.id, { type: t.type })}>
                    {t.label}
                  </button>
                ))}
              </div>
            </div>

            {def.type === "group" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <label style={{ fontSize: 13, fontWeight: 500, color: "var(--text)" }}>Computer Group</label>
                {groupOptions.length === 0 && !computersLoading ? (
                  <div style={{ fontSize: 12, color: "var(--muted)", padding: "8px 0" }}>
                    No groups found. Check BigFix connectivity.
                  </div>
                ) : (
                  <FancySelect
                    options={groupOptions} value={def.group_id}
                    onChange={v => {
                      const opt = groupOptions.find(g => g.value === v);
                      updateDef(def.id, { group_id: v, group_name: opt?.name || v });
                    }}
                    searchable placeholder={computersLoading ? "Loading groups…" : "— Select a computer group —"}
                    isLoading={computersLoading} />
                )}
                {def.group_name && (
                  <span style={{ fontSize: 12, color: "var(--muted)" }}>
                    Selected: <strong style={{ color: "var(--text)" }}>{def.group_name}</strong>
                    {" "}<span style={{ color: "var(--muted)" }}>(ID: {def.group_id})</span>
                  </span>
                )}
              </div>
            )}

            {def.type === "property" && (
              <>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  <label style={{ fontSize: 13, fontWeight: 500, color: "var(--text)" }}>Property Name</label>
                  <FancySelect
                    options={propertyOptions} value={def.property_name}
                    onChange={v => updateDef(def.id, { property_name: v })}
                    searchable placeholder="— Select property —" />
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  <label style={{ fontSize: 13, fontWeight: 500, color: "var(--text)" }}>Operator</label>
                  <select className="control" value={def.property_operator}
                    onChange={e => updateDef(def.id, { property_operator: e.target.value })}>
                    <option value="=">Equals (=)</option>
                    <option value="!=">Not Equals (!=)</option>
                    <option value="contains">Contains</option>
                    <option value="startswith">Starts With</option>
                    <option value="endswith">Ends With</option>
                  </select>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  <label style={{ fontSize: 13, fontWeight: 500, color: "var(--text)" }}>Value</label>
                  <input className="control" type="text" placeholder="e.g. Windows 10, Production"
                    value={def.property_value} onChange={e => updateDef(def.id, { property_value: e.target.value })} />
                </div>
              </>
            )}

            {def.type === "name" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <label style={{ fontSize: 13, fontWeight: 500, color: "var(--text)" }}>
                  Computer Name or Pattern <span style={{ fontWeight: 400, color: "var(--muted)", fontSize: 11 }}>(* wildcard)</span>
                </label>
                <input className="control" type="text" placeholder="e.g. WS-PROD-* or specific-hostname"
                  value={def.value} onChange={e => updateDef(def.id, { value: e.target.value })} />
              </div>
            )}
          </div>

          <div style={{ borderTop: "1px solid var(--border)", background: "var(--bg)", padding: "12px 20px" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                Live Preview
              </span>
              <button type="button" className="btn outline sm" onClick={() => loadPreview(def)} disabled={previewing[def.id]}>
                {previewing[def.id] ? <><InlineSpinner size={12}/> Loading...</> : "Load Target Preview"}
              </button>
            </div>
            {previews[def.id] && (
              <div style={{ marginTop: 8 }}>
                <span style={{
                  background: previews[def.id].length > 0 ? "var(--primary)" : "var(--muted)",
                  color: "white", borderRadius: 10, padding: "1px 8px", fontSize: 11, fontWeight: 700,
                }}>{previews[def.id].length} computers match</span>
                
                {previews[def.id].length > 0 && (
                  <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 3 }}>
                    {previews[def.id].slice(0, 5).map(c => (
                      <div key={c.id} style={{ fontSize: 12, color: "var(--text)", display: "flex", gap: 8 }}>
                        <code style={{ fontSize: 11, color: "var(--muted)" }}>{c.id}</code>
                        <span>{c.name}</span>
                      </div>
                    ))}
                    {previews[def.id].length > 5 && (
                      <span style={{ fontSize: 11, color: "var(--muted)" }}>…and {previews[def.id].length - 5} more</span>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      ))}

      <button className="add-block-btn" type="button" onClick={addDef}>
        + Add Another Target
      </button>
    </div>
  );
}

// ════════════════════════════════════════════════════════════
// STEP 4 – Schedule
// ════════════════════════════════════════════════════════════
function ScheduleBlock({ schedule, prefix, onChange, isRefresh }) {
  const upd = (key, val) => onChange({ ...schedule, [prefix + key]: val });
  const p = (key) => schedule[prefix + key];
  const pad = n => String(n).padStart(2, "0");

  const hourOptions   = Array.from({ length: 24 }, (_, i) => ({ value: i, label: pad(i) }));
  const minuteOptions = [0, 15, 30, 45].map(m => ({ value: m, label: pad(m) }));

  return (
    <>
      <FieldRow label="Time Zone">
        <div style={{ display: "flex", gap: 16 }}>
          {isRefresh ? (
             <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "not-allowed", fontSize: 14 }}>
               <input type="radio" checked readOnly disabled /> UTC (Locked)
             </label>
          ) : (
            ["UTC", "Client Local Time"].map(tz => (
              <label key={tz} style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", fontSize: 14 }}>
                <input type="radio" checked={p("timezone") === tz} onChange={() => upd("timezone", tz)} />
                {tz}
              </label>
            ))
          )}
        </div>
      </FieldRow>

      <FieldRow label="Schedule Type">
        <div className="schedule-type-grid">
          {[
            { value: "weekly",        label: "Weekly" },
            { value: "monthly_day",   label: "Monthly (Day)" },
            { value: "monthly_week",  label: "Monthly (Week)" },
            { value: "interval",      label: "Interval" },
          ].map(t => (
            <button key={t.value} type="button"
              className={`schedule-type-btn ${p("type") === t.value ? "active" : ""}`}
              onClick={() => upd("type", t.value)}>
              {t.label}
            </button>
          ))}
        </div>
      </FieldRow>

      {p("type") === "weekly" && (
        <FieldRow label="Days of Week" required>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {DOW_LABELS.map((d, i) => {
              const checked = (p("days_of_week") || []).includes(i);
              return (
                <button key={i} type="button"
                  className={`dow-btn ${checked ? "active" : ""}`}
                  onClick={() => {
                    const cur = p("days_of_week") || [];
                    upd("days_of_week", checked ? cur.filter(x => x !== i) : [...cur, i].sort());
                  }}>{d}</button>
              );
            })}
          </div>
        </FieldRow>
      )}

      {p("type") === "monthly_day" && (
        <FieldRow label="Day of Month" required>
          <input className="control" type="number" min={1} max={31} style={{ width: 90 }}
            value={p("day_of_month")}
            onChange={e => upd("day_of_month", Math.min(31, Math.max(1, Number(e.target.value))))} />
        </FieldRow>
      )}

      {p("type") === "monthly_week" && (
        <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
          <FieldRow label="Week of Month" required>
            <FancySelect options={WEEK_OF_MONTH} value={p("week_of_month")}
              onChange={v => upd("week_of_month", Number(v))} width="120px" />
          </FieldRow>
          <FieldRow label="Day of Week" required>
            <FancySelect
              options={DOW_LABELS.map((d, i) => ({ value: i, label: d }))}
              value={p("weekday_of_month")}
              onChange={v => upd("weekday_of_month", Number(v))} width="120px" />
          </FieldRow>
        </div>
      )}

      {p("type") === "interval" && (
        <FieldRow label="Repeat Every" required hint="Min 1 hour. Max 168 hours (7 days).">
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <input className="control" type="number" min={1} max={168} style={{ width: 90 }}
              value={p("interval_hours")}
              onChange={e => upd("interval_hours", Math.min(168, Math.max(1, Number(e.target.value))))} />
            <span style={{ fontSize: 13, color: "var(--muted)" }}>hours</span>
          </div>
        </FieldRow>
      )}

      {p("type") !== "interval" && (
        <FieldRow label="Run At (Time)">
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <FancySelect options={hourOptions} value={p("time_hour")}
              onChange={v => upd("time_hour", Number(v))} width="65px" />
            <span style={{ fontWeight: 600, paddingBottom: 2 }}>:</span>
            <FancySelect options={minuteOptions} value={p("time_minute")}
              onChange={v => upd("time_minute", Number(v))} width="65px" />
            <span style={{ fontSize: 13, color: "var(--muted)", marginLeft: 6 }}>
              {isRefresh ? "UTC" : p("timezone")}
            </span>
          </div>
        </FieldRow>
      )}
    </>
  );
}

function StepSchedule({ schedule, onChange }) {
  return (
    <div className="wizard-step-body">
      <SectionHeader
        title="Schedule"
        subtitle="Configure when this policy runs (dispatches BigFix actions) and how often it refreshes its patch and computer counts."
      />

      {/* ── RUN SCHEDULE ─────────────────────────────────── */}
      <div style={{ background: "var(--panel-2)", border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: "20px 24px", display: "flex", flexDirection: "column", gap: 16 }}>
        <span style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--muted)" }}>Run Schedule</span>
        <Switch on={schedule.enabled} onToggle={() => onChange({ ...schedule, enabled: !schedule.enabled })}
          label={schedule.enabled ? "Scheduled runs enabled" : "Manual only"} />

        {schedule.enabled && (
          <ScheduleBlock schedule={schedule} prefix="" onChange={onChange} isRefresh={false} />
        )}
      </div>

      {/* ── REFRESH INTERVAL ─────────────────────────────── */}
      <div style={{ background: "var(--panel-2)", border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: "20px 24px", display: "flex", flexDirection: "column", gap: 16 }}>
        <div>
          <span style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--muted)" }}>Patch & Computer Refresh</span>
          <p style={{ fontSize: 12, color: "var(--muted)", margin: "4px 0 0" }}>
            How often this policy should re-evaluate which patches and computers match its criteria — independently of when actions are dispatched.
          </p>
        </div>

        <Switch
          on={schedule.refresh_enabled}
          onToggle={() => onChange({ ...schedule, refresh_enabled: !schedule.refresh_enabled })}
          label={schedule.refresh_enabled ? "Automatic refresh enabled" : "Manual refresh only"} />

        {schedule.refresh_enabled && (
          <ScheduleBlock schedule={schedule} prefix="refresh_" onChange={onChange} isRefresh={true} />
        )}
      </div>

      {/* ── BIGFIX ACTION OPTIONS ─────────────────────────── */}
      <div style={{ background: "var(--panel-2)", border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: "20px 24px", display: "flex", flexDirection: "column", gap: 12 }}>
        <span style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--muted)" }}>BigFix Action Options</span>
        <Switch on={schedule.retry_on_failure}       onToggle={() => onChange({ ...schedule, retry_on_failure: !schedule.retry_on_failure })}      label="Retry on Failure" />
        <Switch on={schedule.skip_if_not_relevant}   onToggle={() => onChange({ ...schedule, skip_if_not_relevant: !schedule.skip_if_not_relevant })}  label="Skip if Not Relevant" />
        <Switch on={schedule.user_restart_prompt}    onToggle={() => onChange({ ...schedule, user_restart_prompt: !schedule.user_restart_prompt })}   label="Require User Restart Confirmation" />
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════
// STEP 5 – Review
// ════════════════════════════════════════════════════════════
function StepReview({ policy, patchDefs, computerDefs, schedule }) {
  const Section = ({ title, children }) => (
    <div style={{ border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", overflow: "hidden" }}>
      <div style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--muted)", padding: "10px 16px", background: "var(--panel-2)", borderBottom: "1px solid var(--border)" }}>{title}</div>
      <div style={{ padding: "12px 16px", display: "flex", flexDirection: "column", gap: 8 }}>{children}</div>
    </div>
  );
  const Row = ({ label, value, valueStyle }) => (
    <div style={{ display: "flex", alignItems: "baseline", gap: 12, fontSize: 13 }}>
      <span style={{ color: "var(--muted)", minWidth: 140, fontWeight: 500 }}>{label}</span>
      <span style={{ color: "var(--text)", fontWeight: 500, ...valueStyle }}>{value || "—"}</span>
    </div>
  );

  const getScheduleDesc = (prefix) => {
    if (prefix === "" && !schedule.enabled) return "Manual only";
    if (prefix === "refresh_" && !schedule.refresh_enabled) return "Manual only";

    const pad = n => String(n).padStart(2, "0");
    const t   = `${pad(schedule[`${prefix}time_hour`] || 0)}:${pad(schedule[`${prefix}time_minute`] || 0)}`;
    const tz  = schedule[`${prefix}timezone`] || "UTC";
    const type = schedule[`${prefix}type`];

    if (type === "weekly") {
      const days = (schedule[`${prefix}days_of_week`] || []).map(d => DOW_LABELS[d]).join(", ");
      return days ? `Every ${days} at ${t} ${tz}` : "Weekly (no days selected)";
    }
    if (type === "monthly_day")  return `Day ${schedule[`${prefix}day_of_month`]} monthly at ${t} ${tz}`;
    if (type === "monthly_week") {
      const wk = ["","1st","2nd","3rd","4th","Last"][schedule[`${prefix}week_of_month`]] || "";
      const dy = DOW_LABELS[schedule[`${prefix}weekday_of_month`]] || "";
      return `${wk} ${dy} monthly at ${t} ${tz}`;
    }
    if (type === "interval") return `Every ${schedule[`${prefix}interval_hours`]}h`;
    return "Scheduled";
  };

  return (
    <div className="wizard-step-body">
      <SectionHeader title="Review & Confirm" subtitle="Double-check everything before saving." />

      <Section title="Policy Details">
        <Row label="Name"        value={policy.policy_name} />
        <Row label="Description" value={policy.description} />
        <Row label="Scope"       value={policy.scope === "private" ? "🔒 Private" : "🌐 Public"} />
        {policy.scope === "public" && <Row label="Visible Roles" value={(policy.visible_roles || []).join(", ") || "All roles"} />}
      </Section>

      <Section title={`Patch Definitions (${patchDefs.length})`}>
        {patchDefs.map((d, i) => (
          <div key={d.id} style={{ background: "var(--bg)", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", padding: "10px 12px", display: "flex", flexDirection: "column", gap: 6, marginTop: 4 }}>
            <strong style={{ fontSize: 13, color: "var(--primary)" }}>Definition {i + 1}</strong>
            {d.severities?.length > 0    && <Row label="Severities"      value={d.severities.join(", ")} />}
            {d.sites?.length > 0         && <Row label="Sites"           value={d.sites.join(", ")} />}
            {d.vendors?.length > 0       && <Row label="Vendors"         value={d.vendors.join(", ")} />}
            {d.source_ids                && <Row label="Source IDs"      value={d.source_ids} />}
            {d.include_keywords          && <Row label="Include"         value={d.include_keywords} />}
            {d.exclude_keywords          && <Row label="Exclude"         value={d.exclude_keywords} />}
            <Row label="Approved Only" value="Yes (always)" valueStyle={{ color: "var(--success-text)", fontWeight: 600 }} />
          </div>
        ))}
      </Section>

      <Section title={`Computer Targets (${computerDefs.length})`}>
        {computerDefs.map((d, i) => (
          <div key={d.id} style={{ background: "var(--bg)", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", padding: "10px 12px", display: "flex", flexDirection: "column", gap: 6, marginTop: 4 }}>
            <strong style={{ fontSize: 13, color: "var(--primary)" }}>Target {i + 1}</strong>
            <Row label="Type" value={{ name: "Name / Pattern", group: "Computer Group", property: "Property Filter" }[d.type] || d.type} />
            {d.type === "name"     && <Row label="Pattern"   value={d.value} />}
            {d.type === "group"    && <Row label="Group"     value={`${d.group_name || "—"}${d.group_id ? ` (ID: ${d.group_id})` : ""}`} />}
            {d.type === "property" && <Row label="Condition" value={`${d.property_name} ${d.property_operator} "${d.property_value}"`} />}
          </div>
        ))}
      </Section>

      <Section title="Schedule & Refresh">
        <Row label="Run Schedule"   value={getScheduleDesc("")} />
        <Row label="Count Refresh"  value={getScheduleDesc("refresh_")} />
        {schedule.enabled && (
          <>
            <Row label="Retry on failure"     value={schedule.retry_on_failure     ? "Yes" : "No"} />
            <Row label="Skip if not relevant" value={schedule.skip_if_not_relevant ? "Yes" : "No"} />
            <Row label="User restart prompt"  value={schedule.user_restart_prompt  ? "Yes" : "No"} />
          </>
        )}
      </Section>
    </div>
  );
}

// ════════════════════════════════════════════════════════════
// MAIN WIZARD
// ════════════════════════════════════════════════════════════
export default function PolicyWizard({ initialData, onSave, onCancel }) {
  const { showToast } = useToast();
  const [step, setStep]     = useState(0);
  const [saving, setSaving] = useState(false);

  const [availableRoles,   setAvailableRoles]   = useState([]);
  const [siteOptions,      setSiteOptions]      = useState([]);
  const [vendorOptions,    setVendorOptions]    = useState([]);
  const [groupOptions,     setGroupOptions]     = useState([]);
  const [propertyOptions,  setPropertyOptions]  = useState([]);
  const [approvedPatches,  setApprovedPatches]  = useState([]);
  const [patchesLoading,   setPatchesLoading]   = useState(false);
  const [computersLoading, setComputersLoading] = useState(false);

  const isEdit = !!initialData?.policy_id;

  const [policy, setPolicy] = useState({
    policy_name: "", description: "", scope: "private", visible_roles: [],
    ...(initialData || {}),
  });

  const migratePatchDef = d => ({
    ...EMPTY_PATCH_DEF(), ...d,
    vendors: d.vendors || d.sources || [],
    severities: d.severities || [], sites: d.sites || [],
    approved_only: true,
  });

  const [patchDefs, setPatchDefs] = useState(() => {
    const defs = initialData?.patch_definitions;
    return defs?.length > 0 ? defs.map(migratePatchDef) : [EMPTY_PATCH_DEF()];
  });

  const [computerDefs, setComputerDefs] = useState(
    initialData?.computer_definitions?.length > 0 ? initialData.computer_definitions : [EMPTY_COMPUTER_DEF()]
  );

  const [schedule, setSchedule] = useState({
    ...EMPTY_SCHEDULE(), ...(initialData?.schedule || {}),
  });

  useEffect(() => {
    const load = async () => {
      setComputersLoading(true);
      const [rolesRes, groupsRes, propsRes] = await Promise.allSettled([
        apiFetch("/api/auth/all-roles"), apiFetch("/api/groups/list"), apiFetch("/api/groups/metadata/properties"),
      ]);

      if (rolesRes.status === "fulfilled") setAvailableRoles(rolesRes.value.roles || []);
      if (groupsRes.status === "fulfilled") {
        setGroupOptions((groupsRes.value.groups || []).map(g => ({
          value: String(g.id), label: `${g.name}${g.count ? ` (${g.count})` : ""}`, name: g.name,
        })));
      }
      if (propsRes.status === "fulfilled") {
        const props = propsRes.value.properties || propsRes.value.data || [];
        if (Array.isArray(props) && props.length > 0) {
          setPropertyOptions(props.map(p => ({ value: typeof p === "string" ? p : (p.name || p), label: typeof p === "string" ? p : (p.name || p) })));
        } else {
          setPropertyOptions([
            { value: "OS", label: "OS" }, { value: "OS Version", label: "OS Version" },
            { value: "Computer Name", label: "Computer Name" }, { value: "IP Address", label: "IP Address" }
          ]);
        }
      }
      setComputersLoading(false);

      setPatchesLoading(true);
      try {
        const res = await apiFetch("/api/patches");
        const all = res.data || res.patches || res.results || [];
        const approved = all.filter(p => p.status === 1 || p.IsApproved === 1 || p.is_approved === 1);
        setApprovedPatches(approved);

        const sites = [...new Set(all.map(p => p.site_name || p.SiteName).filter(Boolean))].sort();
        setSiteOptions(sites.map(s => ({ value: s, label: s })));

        const vendors = [...new Set(all.map(p => p.vendor || p.Vendor).filter(Boolean))].sort();
        setVendorOptions(vendors.map(v => ({ value: v, label: v })));
      } catch (e) { console.warn("[PolicyWizard] Patch load failed:", e.message); } 
      finally { setPatchesLoading(false); }
    };
    load();
  }, []);

  const safePatchDefs = patchDefs.map(d => ({ ...d, approved_only: true }));

  const validate = () => {
    if (!policy.policy_name?.trim()) { showToast("Policy name is required.", "error"); return false; }
    if (patchDefs.length === 0) { showToast("At least one patch definition is required.", "error"); return false; }
    if (computerDefs.length === 0) { showToast("At least one computer target is required.", "error"); return false; }
    return true;
  };

  const handleNext = () => {
    if (step === STEPS.length - 2 && !validate()) return;
    if (step < STEPS.length - 1) setStep(step + 1);
  };

  const handleSave = async () => {
    if (!validate()) return;
    setSaving(true);
    await onSave({ ...policy, policy_id: initialData?.policy_id, patch_definitions: safePatchDefs, computer_definitions: computerDefs, schedule }, isEdit);
    setSaving(false);
  };

  const progress = Math.round(((step + 1) / STEPS.length) * 100);

  return (
    <div className="wizard-page">
      <div className="wizard-header">
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <button className="btn ghost" onClick={onCancel}>← Back</button>
          <h2 className="wizard-title">{isEdit ? "Edit Policy" : "Create New Policy"}</h2>
        </div>
        <span style={{ fontSize: 12, color: "var(--muted)" }}>Step {step + 1} of {STEPS.length}</span>
      </div>

      <div className="wizard-progress-bar"><div className="wizard-progress-fill" style={{ width: `${progress}%` }} /></div>

      <div className="wizard-steps-nav">
        {STEPS.map((s, i) => (
          <button key={s.id} type="button"
            className={`wizard-step-btn ${i === step ? "active" : ""} ${i < step ? "done" : ""}`}
            onClick={() => i < step && setStep(i)}>
            <span className="wizard-step-icon">{i < step ? <CheckIcon/> : s.icon}</span>
            <span className="wizard-step-label">{s.label}</span>
          </button>
        ))}
      </div>

      <div className="wizard-content">
        {step === 0 && <StepDetails data={policy} onChange={(k, v) => setPolicy(p => ({ ...p, [k]: v }))} availableRoles={availableRoles} />}
        {step === 1 && <StepPatches defs={safePatchDefs} onChange={setPatchDefs} siteOptions={siteOptions} vendorOptions={vendorOptions} approvedPatches={approvedPatches} patchesLoading={patchesLoading} />}
        {step === 2 && <StepComputers defs={computerDefs} onChange={setComputerDefs} groupOptions={groupOptions} propertyOptions={propertyOptions} computersLoading={computersLoading} />}
        {step === 3 && <StepSchedule schedule={schedule} onChange={setSchedule} />}
        {step === 4 && <StepReview policy={policy} patchDefs={safePatchDefs} computerDefs={computerDefs} schedule={schedule} />}
      </div>

      <div className="wizard-footer">
        <button className="btn outline" onClick={step === 0 ? onCancel : () => setStep(step - 1)}>
          {step === 0 ? "Cancel" : "← Previous"}
        </button>
        {step < STEPS.length - 1
          ? <button className="btn pri" onClick={handleNext}>Next →</button>
          : <button className="btn pri" onClick={handleSave} disabled={saving}>
              {saving ? <><InlineSpinner /> Saving…</> : isEdit ? "Update Policy" : "Create Policy"}
            </button>
        }
      </div>
    </div>
  );
}