// src/modules/policy/PatchPolicy.jsx
import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import FilterDrawer from "../../components/FilterDrawer";
import Paginator from "../../components/common/Paginator";
import InlineSpinner from "../../components/common/InlineSpinner";
import { useToast } from "../../components/common/CustomToast";
import { performExport } from "../../utils/exportUtils";
import PolicyWizard from "./PolicyWizard";
import "./policy.css";

const API = window.env?.VITE_API_BASE || "http://localhost:5174";

async function apiFetch(url, options = {}) {
  const r = await fetch(`${API}${url}`, {
    ...options,
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
  });
  const j = await r.json().catch(() => ({ ok: false, error: "Parse error" }));
  if (!r.ok || j.ok === false) throw new Error(j.error || `HTTP ${r.status}`);
  return j;
}

function fmtDate(iso) {
  if (!iso) return "—";
  try { return new Date(iso).toLocaleString(); } catch { return iso; }
}

const STATUS_LABELS = { active: "Active", inactive: "Inactive", running: "Running" };

const SEV_COLOR = {
  CRITICAL: "var(--danger)", HIGH: "var(--danger)", IMPORTANT: "var(--warn-text)",
  MODERATE: "var(--info)", LOW: "var(--success-text)", UNSPECIFIED: "var(--muted)",
};

// KPI tile definitions ────────────────────────────────────────────────────────
const KPI_DEFS = [
  { id: "all",      label: "Total Policies", color: "var(--primary)",   filterKey: null,     filterVal: null },
  { id: "active",   label: "Active",         color: "var(--success)",   filterKey: "status", filterVal: "active" },
  { id: "running",  label: "Running Now",    color: "var(--info)",      filterKey: "status", filterVal: "running" },
  { id: "inactive", label: "Inactive",       color: "var(--warn-text)", filterKey: "status", filterVal: "inactive" },
  { id: "public",   label: "Public",         color: "var(--primary)",   filterKey: "scope",  filterVal: "public" },
];

// Client-side patch matching (mirrors server logic) ───────────────────────────
function matchPatches(patches, patchDefs) {
  if (!patchDefs || patchDefs.length === 0) return [];
  const matched = new Map();
  for (const patch of patches) {
    const name = (patch.patch_name || patch.name || "").toLowerCase();
    const sev  = (patch.severity || patch.source_severity || "").toUpperCase();
    const cat  = (patch.category || "").toLowerCase();
    const site = (patch.site_name || "").toLowerCase();
    const src  = (patch.source || patch.vendor || "").toLowerCase();
    const sid  = (patch.source_id || "").toLowerCase();

    for (const def of patchDefs) {
      let ok = true;
      if (def.severities?.length  && !def.severities.map(s => s.toUpperCase()).includes(sev)) ok = false;
      if (ok && def.categories?.length && !def.categories.some(c => cat.includes(c.toLowerCase()))) ok = false;
      if (ok && def.sites?.length      && !def.sites.some(s => site.includes(s.toLowerCase()))) ok = false;
      if (ok && def.sources?.length    && !def.sources.some(s => src.includes(s.toLowerCase()))) ok = false;
      if (ok && def.source_ids) {
        const ids = def.source_ids.split(",").map(s => s.trim().toLowerCase()).filter(Boolean);
        if (ids.length && !ids.some(id => sid.includes(id))) ok = false;
      }
      if (ok && def.include_keywords) {
        const kws = def.include_keywords.split(",").map(s => s.trim().toLowerCase()).filter(Boolean);
        if (kws.length && !kws.some(k => name.includes(k))) ok = false;
      }
      if (ok && def.exclude_keywords) {
        const kws = def.exclude_keywords.split(",").map(s => s.trim().toLowerCase()).filter(Boolean);
        if (kws.length && kws.some(k => name.includes(k))) ok = false;
      }
      if (ok) { matched.set(patch.patch_id || patch.id || name, patch); break; }
    }
  }
  return [...matched.values()];
}

export default function PatchPolicy() {
  const { showToast } = useToast();

  // List state ──────────────────────────────────────────────────────────────
  const [policies, setPolicies]       = useState([]);
  const [loading, setLoading]         = useState(true);
  const [refreshing, setRefreshing]   = useState(false);
  const [lastUpdated, setLastUpdated] = useState("");
  const [autoRefresh, setAutoRefresh] = useState(false);
  const autoRefreshRef                = useRef(null);

  // Table controls ───────────────────────────────────────────────────────────
  const [currentPage, setCurrentPage]   = useState(1);
  const [rowsPerPage, setRowsPerPage]   = useState(10);
  const [sortConfig, setSortConfig]     = useState({ key: null, direction: "asc" });
  const [filters, setFilters]           = useState([]);      // drawer filters
  const [kpiFilter, setKpiFilter]       = useState(null);    // { filterKey, filterVal }
  const [activeKpiId, setActiveKpiId]   = useState(null);
  const [globalLogic, setGlobalLogic]   = useState("AND");
  const [drawerOpen, setDrawerOpen]     = useState(false);
  const [showColDrop, setShowColDrop]   = useState(false);
  const [showExpDrop, setShowExpDrop]   = useState(false);
  const [exportFormat, setExportFormat] = useState("CSV");
  const colRef = useRef(null);
  const expRef = useRef(null);

  const [cols, setCols] = useState([
    { id: "policy_name",    label: "Policy Name",  show: true },
    { id: "scope",          label: "Scope",        show: true },
    { id: "status",         label: "Status",       show: true },
    { id: "patch_count",    label: "Patches",      show: true },
    { id: "computer_count", label: "Computers",    show: true },
    { id: "schedule_info",  label: "Schedule",     show: true },
    { id: "last_run",       label: "Last Run",     show: true },
    { id: "next_run",       label: "Next Run",     show: true },
    { id: "created_by",     label: "Created By",   show: true },
    { id: "created_at",     label: "Created At",   show: false },
    { id: "updated_at",     label: "Updated At",   show: false },
  ]);

  // Wizard / delete state ────────────────────────────────────────────────────
  const [wizardOpen, setWizardOpen]       = useState(false);
  const [editingPolicy, setEditingPolicy] = useState(null);
  const [deleteTarget, setDeleteTarget]   = useState(null);
  const [running, setRunning]             = useState({});

  // Detail panel state ───────────────────────────────────────────────────────
  const [detailPolicy, setDetailPolicy]               = useState(null);
  const [detailPatches, setDetailPatches]             = useState([]);
  const [detailComputers, setDetailComputers]         = useState([]);
  const [detailPatchLoad, setDetailPatchLoad]         = useState(false);
  const [detailComputerLoad, setDetailComputerLoad]   = useState(false);
  const [detailTab, setDetailTab]                     = useState("patches");

  // Click-outside for dropdowns ──────────────────────────────────────────────
  useEffect(() => {
    const h = (e) => {
      if (colRef.current && !colRef.current.contains(e.target)) setShowColDrop(false);
      if (expRef.current && !expRef.current.contains(e.target)) setShowExpDrop(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  // Load policies ────────────────────────────────────────────────────────────
  const loadPolicies = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    else setRefreshing(true);
    try {
      // Refresh server-side resolved counts first (non-fatal)
      try { await apiFetch("/api/policies/refresh-counts", { method: "POST" }); } catch { /* ok */ }
      const res  = await apiFetch("/api/policies");
      const data = Array.isArray(res.data) ? res.data : (res.policies || []);
      setPolicies(data);
      setLastUpdated(new Date().toLocaleString());
    } catch (err) {
      if (!silent) showToast("Failed to load policies: " + err.message, "error");
    } finally {
      if (!silent) setLoading(false);
      else setRefreshing(false);
    }
  }, [showToast]);

  useEffect(() => { loadPolicies(); }, [loadPolicies]);

  // Auto-refresh ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (autoRefresh) {
      autoRefreshRef.current = setInterval(() => loadPolicies(true), 30_000);
    } else {
      clearInterval(autoRefreshRef.current);
    }
    return () => clearInterval(autoRefreshRef.current);
  }, [autoRefresh, loadPolicies]);

  // KPI tile click ───────────────────────────────────────────────────────────
  const handleKpiClick = (kpi) => {
    if (activeKpiId === kpi.id) {
      // Toggle off
      setActiveKpiId(null);
      setKpiFilter(null);
    } else {
      setActiveKpiId(kpi.id);
      setKpiFilter(kpi.filterKey ? { filterKey: kpi.filterKey, filterVal: kpi.filterVal } : null);
    }
    setCurrentPage(1);
  };

  // KPI counts ───────────────────────────────────────────────────────────────
  const kpiCounts = useMemo(() => ({
    all:      policies.length,
    active:   policies.filter(p => p.status === "active").length,
    running:  policies.filter(p => p.status === "running").length,
    inactive: policies.filter(p => p.status === "inactive").length,
    public:   policies.filter(p => p.scope === "public").length,
  }), [policies]);

  // Open detail panel ────────────────────────────────────────────────────────
  const openDetail = useCallback(async (policy, tab = "patches") => {
    setDetailPolicy(policy);
    setDetailTab(tab);
    setDetailPatches([]);
    setDetailComputers([]);

    setDetailPatchLoad(true);
    setDetailComputerLoad(true);

    try {
      const res = await apiFetch(`/api/policies/${policy.policy_id}/matches`);
      setDetailPatches(res.patches || []);
      setDetailComputers(res.computers || []);
    } catch {
      // Client-side fallback for patches
      try {
        const pRes = await apiFetch("/api/patches");
        const all  = pRes.data || pRes.patches || pRes.results || [];
        const approved = all.filter(p => p.status === 1 || p.IsApproved === 1 || p.is_approved === 1);
        setDetailPatches(matchPatches(approved, policy.patch_definitions || []));
      } catch { setDetailPatches([]); }
      setDetailComputers([]);
    } finally {
      setDetailPatchLoad(false);
      setDetailComputerLoad(false);
    }
  }, []);

  const closeDetail = () => {
    setDetailPolicy(null);
    setDetailPatches([]);
    setDetailComputers([]);
  };

  // Filter / sort / paginate ─────────────────────────────────────────────────
  const filtered = useMemo(() => {
    let rows = [...policies];

    // Apply KPI filter
    if (kpiFilter) {
      rows = rows.filter(r => String(r[kpiFilter.filterKey] ?? "").toLowerCase() === kpiFilter.filterVal.toLowerCase());
    }

    // Apply drawer filters
    if (filters.length > 0) {
      const matchBlock = (row, block) =>
        block.conds.every((c) => {
          const val = String(row[c.column] ?? "").toLowerCase();
          const q   = String(c.value ?? "").toLowerCase();
          if (c.operator === "contains") return val.includes(q);
          if (c.operator === "=")        return val === q;
          if (c.operator === "!=")       return val !== q;
          if (c.operator === ">")        return Number(row[c.column]) > Number(c.value);
          if (c.operator === "<")        return Number(row[c.column]) < Number(c.value);
          return true;
        });
      if (globalLogic === "OR") rows = rows.filter(r => filters.some(b  => matchBlock(r, b)));
      else                      rows = rows.filter(r => filters.every(b => matchBlock(r, b)));
    }

    if (sortConfig.key) {
      rows.sort((a, b) => {
        const av = a[sortConfig.key] ?? "";
        const bv = b[sortConfig.key] ?? "";
        return sortConfig.direction === "asc"
          ? String(av).localeCompare(String(bv), undefined, { numeric: true })
          : String(bv).localeCompare(String(av), undefined, { numeric: true });
      });
    }
    return rows;
  }, [policies, filters, kpiFilter, globalLogic, sortConfig]);

  const paginated = useMemo(() => {
    const start = (currentPage - 1) * rowsPerPage;
    return filtered.slice(start, start + rowsPerPage);
  }, [filtered, currentPage, rowsPerPage]);

  const handleSort = (key) => {
    setSortConfig(prev =>
      prev.key === key
        ? { key, direction: prev.direction === "asc" ? "desc" : "asc" }
        : { key, direction: "asc" }
    );
  };

  const sortIcon = (key) => {
    if (sortConfig.key !== key) return <span className="sort-icon">↕</span>;
    return <span className="sort-icon active">{sortConfig.direction === "asc" ? "↑" : "↓"}</span>;
  };

  // Actions ──────────────────────────────────────────────────────────────────
  const handleRunNow = async (policy) => {
    setRunning(p => ({ ...p, [policy.policy_id]: true }));
    try {
      const res = await apiFetch(`/api/policies/${policy.policy_id}/run`, { method: "POST" });
      if (res.actionIds?.length) {
        showToast(`Policy "${policy.policy_name}" dispatched — ${res.actionIds.length} BigFix action(s) created.`, "success");
      } else if (res.actionId) {
        showToast(`Policy "${policy.policy_name}" — BigFix action #${res.actionId} created.`, "success");
      } else {
        showToast(`Policy "${policy.policy_name}" triggered successfully.`, "success");
      }
      loadPolicies(true);
    } catch (err) {
      showToast("Run failed: " + err.message, "error");
    } finally {
      setRunning(p => ({ ...p, [policy.policy_id]: false }));
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await apiFetch(`/api/policies/${deleteTarget.policy_id}`, { method: "DELETE" });
      showToast(`Policy "${deleteTarget.policy_name}" deleted.`, "success");
      setDeleteTarget(null);
      if (detailPolicy?.policy_id === deleteTarget.policy_id) closeDetail();
      loadPolicies();
    } catch (err) {
      showToast("Delete failed: " + err.message, "error");
    }
  };

  const handleToggleStatus = async (policy) => {
    const newStatus = policy.status === "active" ? "inactive" : "active";
    try {
      await apiFetch(`/api/policies/${policy.policy_id}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status: newStatus }),
      });
      showToast(`Policy ${newStatus === "active" ? "activated" : "deactivated"}.`, "success");
      loadPolicies(true);
    } catch (err) {
      showToast("Status update failed: " + err.message, "error");
    }
  };

  const handleWizardSave = async (policyData, isEdit) => {
    try {
      if (isEdit) {
        await apiFetch(`/api/policies/${policyData.policy_id}`, {
          method: "PUT",
          body: JSON.stringify(policyData),
        });
        showToast("Policy updated successfully.", "success");
      } else {
        await apiFetch("/api/policies", {
          method: "POST",
          body: JSON.stringify(policyData),
        });
        showToast("Policy created successfully.", "success");
      }
      setWizardOpen(false);
      setEditingPolicy(null);
      // Backend now awaits count resolution before responding, so list is fresh
      loadPolicies();
    } catch (err) {
      showToast("Save failed: " + err.message, "error");
    }
  };

  // Property options for filter drawer ──────────────────────────────────────
  const propertyOptions = useMemo(() => [
    { value: "policy_name",    label: "Policy Name" },
    { value: "scope",          label: "Scope" },
    { value: "status",         label: "Status" },
    { value: "created_by",     label: "Created By" },
    { value: "patch_count",    label: "Patches" },
    { value: "computer_count", label: "Computers" },
  ], []);

  const activeFilterCount = filters.flatMap(b => b.conds).length;
  const visibleCols       = cols.filter(c => c.show);

  // Sub-components ───────────────────────────────────────────────────────────
  const StatusBadge = ({ status }) => {
    const cls = status === "active"  ? "badge-active"
              : status === "running" ? "badge-running"
              : "badge-inactive";
    return <span className={`policy-badge ${cls}`}>{STATUS_LABELS[status] || status}</span>;
  };

  const ScopeBadge = ({ scope }) => (
    <span className={`policy-badge ${scope === "private" ? "badge-private" : "badge-public"}`}>
      {scope === "private" ? "🔒 Private" : "🌐 Public"}
    </span>
  );

  // ── Wizard ────────────────────────────────────────────────────────────────
  if (wizardOpen) {
    return (
      <PolicyWizard
        initialData={editingPolicy}
        onSave={handleWizardSave}
        onCancel={() => { setWizardOpen(false); setEditingPolicy(null); }}
      />
    );
  }

  return (
    <div className="policy-page">

      {/* ── Page header ───────────────────────────────────────────────────── */}
      <div className="page-header-row">
        <div>
          <h1 className="page-title">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
              style={{ marginRight: 10, verticalAlign: "middle", color: "var(--primary)" }}>
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
            </svg>
            Patch Policy
          </h1>
          <p className="page-subtitle">Create and manage automated patching policies with flexible schedules, targets, and scopes.</p>
        </div>
        <div className="flex-row gap-8 items-center">
          <label className="auto-refresh-toggle" title="Auto-refresh every 30 seconds">
            <span className={`toggle-track-sm ${autoRefresh ? "on" : ""}`} onClick={() => setAutoRefresh(v => !v)}>
              <span className="toggle-knob-sm" />
            </span>
            <span className="text-12 muted-text">Auto-refresh</span>
          </label>
          <button className="btn outline" onClick={() => loadPolicies()} disabled={refreshing}>
            {refreshing
              ? <InlineSpinner size={14} />
              : <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M23 4v6h-6"/><path d="M1 20v-6h6"/>
                  <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
                </svg>
            }
            {refreshing ? "Refreshing…" : "Refresh"}
          </button>
          <button className="btn pri" onClick={() => { setEditingPolicy(null); setWizardOpen(true); }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
            New Policy
          </button>
        </div>
      </div>

      {/* ── KPI strip (clickable) ────────────────────────────────────────── */}
      <div className="policy-kpi-strip">
        {KPI_DEFS.map((kpi) => (
          <div
            key={kpi.id}
            className={`policy-kpi-card policy-kpi-card--clickable ${activeKpiId === kpi.id ? "policy-kpi-card--active" : ""}`}
            onClick={() => handleKpiClick(kpi)}
            title={activeKpiId === kpi.id ? `Clear "${kpi.label}" filter` : `Filter by: ${kpi.label}`}
          >
            <span className="policy-kpi-value" style={{ color: activeKpiId === kpi.id ? kpi.color : kpi.color }}>
              {kpiCounts[kpi.id]}
            </span>
            <span className="policy-kpi-label">{kpi.label}</span>
            {activeKpiId === kpi.id && (
              <span className="policy-kpi-active-indicator" style={{ background: kpi.color }} />
            )}
          </div>
        ))}
      </div>

      {/* ── Toolbar ───────────────────────────────────────────────────────── */}
      <div className="policy-toolbar">
        <div className="flex-row items-center gap-8" style={{ flexWrap: "wrap" }}>
          <span className="text-13" style={{ color: "var(--muted)", fontWeight: 500 }}>
            {filtered.length} {filtered.length === 1 ? "policy" : "policies"}
            {lastUpdated && (
              <span className="text-11 muted-text" style={{ marginLeft: 8 }}>· Updated {lastUpdated}</span>
            )}
          </span>

          {/* Active KPI chip */}
          {activeKpiId && activeKpiId !== "all" && (
            <span className="filter-active-chip">
              {KPI_DEFS.find(k => k.id === activeKpiId)?.label}
              <button
                onClick={() => { setActiveKpiId(null); setKpiFilter(null); setCurrentPage(1); }}
                style={{ marginLeft: 6, background: "none", border: "none", cursor: "pointer", color: "var(--primary)", fontSize: 12, padding: 0, lineHeight: 1 }}
              >✕</button>
            </span>
          )}

          {/* Active drawer-filter chip */}
          {activeFilterCount > 0 && (
            <span className="filter-active-chip">
              {activeFilterCount} filter{activeFilterCount > 1 ? "s" : ""} active
              <button
                onClick={() => setFilters([])}
                style={{ marginLeft: 6, background: "none", border: "none", cursor: "pointer", color: "var(--primary)", fontSize: 12, padding: 0, lineHeight: 1 }}
              >✕</button>
            </span>
          )}
        </div>

        <div className="flex-row gap-8 items-center">
          {/* Filter drawer trigger */}
          <button
            className={`btn outline ${activeFilterCount > 0 ? "btn-filter-active" : ""}`}
            onClick={() => setDrawerOpen(true)}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/>
            </svg>
            Filter {activeFilterCount > 0 && <span className="toolbar-badge">{activeFilterCount}</span>}
          </button>

          {/* Column chooser */}
          <div className="dropdown" ref={colRef}>
            <button
              className="btn outline"
              onClick={(e) => { e.stopPropagation(); setShowColDrop(v => !v); setShowExpDrop(false); }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/>
                <line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/>
                <line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/>
              </svg>
              Columns
            </button>
            {showColDrop && (
              <div className="dropdown-menu show" style={{ minWidth: 200, padding: "8px 0", right: 0 }}>
                {cols.map((c) => (
                  <label
                    key={c.id}
                    style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 14px", cursor: "pointer", userSelect: "none" }}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <input
                      type="checkbox"
                      className="custom-checkbox"
                      checked={c.show}
                      onChange={() => setCols(prev => prev.map(x => x.id === c.id ? { ...x, show: !x.show } : x))}
                      style={{ flexShrink: 0 }}
                    />
                    <span className="text-13">{c.label}</span>
                  </label>
                ))}
              </div>
            )}
          </div>

          {/* Export */}
          <div className="dropdown" ref={expRef}>
            <button
              className="btn outline"
              onClick={(e) => { e.stopPropagation(); setShowExpDrop(v => !v); setShowColDrop(false); }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                <polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
              </svg>
              Export
            </button>
            {showExpDrop && (
              <div className="dropdown-menu show" style={{ minWidth: 140, padding: "8px 0", right: 0 }}>
                {["CSV", "JSON", "XML", "TXT", "PDF"].map((fmt) => (
                  <button
                    key={fmt}
                    style={{
                      display: "block", width: "100%", padding: "8px 14px", fontSize: 13,
                      cursor: "pointer", textAlign: "left", fontFamily: "inherit", border: "none",
                      background: exportFormat === fmt ? "var(--bg)" : "transparent",
                      color: exportFormat === fmt ? "var(--primary)" : "var(--text)",
                    }}
                    onClick={() => {
                      setExportFormat(fmt);
                      performExport(filtered, cols, fmt, "patch-policies");
                      setShowExpDrop(false);
                    }}
                  >
                    {fmt}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Table ─────────────────────────────────────────────────────────── */}
      <div className="tableWrap">
        <table>
          <thead>
            <tr>
              {visibleCols.map((c) => (
                <th key={c.id} onClick={() => handleSort(c.id)}
                  style={{ cursor: "pointer", userSelect: "none", whiteSpace: "nowrap" }}>
                  {c.label} {sortIcon(c.id)}
                </th>
              ))}
              <th style={{ width: 160 }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={visibleCols.length + 1} style={{ textAlign: "center", padding: "40px 20px", color: "var(--muted)" }}>
                  <InlineSpinner /> Loading policies…
                </td>
              </tr>
            ) : paginated.length === 0 ? (
              <tr>
                <td colSpan={visibleCols.length + 1} style={{ textAlign: "center", padding: "48px 20px" }}>
                  <div className="policy-empty-state">
                    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--border)" strokeWidth="1.5">
                      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
                    </svg>
                    <p style={{ color: "var(--muted)", fontSize: 15, margin: "12px 0 4px", fontWeight: 500 }}>No policies found</p>
                    <p style={{ color: "var(--muted)", fontSize: 13, margin: 0 }}>
                      {(activeFilterCount > 0 || activeKpiId)
                        ? "Try adjusting your filters."
                        : "Create your first patch policy to get started."}
                    </p>
                    {(!activeFilterCount && !activeKpiId) && (
                      <button className="btn pri" style={{ marginTop: 16 }}
                        onClick={() => { setEditingPolicy(null); setWizardOpen(true); }}>
                        Create Policy
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ) : (
              paginated.map((p) => (
                <>
                  <tr
                    key={p.policy_id}
                    className={detailPolicy?.policy_id === p.policy_id ? "policy-row--selected" : ""}
                  >
                    {visibleCols.map((c) => (
                      <td key={c.id}>
                        {c.id === "policy_name" ? (
                          <button
                            className="policy-name-link"
                            onClick={() => detailPolicy?.policy_id === p.policy_id ? closeDetail() : openDetail(p)}
                          >
                            {p.policy_name}
                            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
                              style={{ marginLeft: 5, opacity: 0.45, verticalAlign: "middle", flexShrink: 0 }}>
                              {detailPolicy?.policy_id === p.policy_id
                                ? <polyline points="18 15 12 9 6 15"/>
                                : <polyline points="6 9 12 15 18 9"/>}
                            </svg>
                          </button>
                        ) : c.id === "scope" ? <ScopeBadge scope={p.scope} />
                          : c.id === "status" ? <StatusBadge status={p.status} />
                          : c.id === "schedule_info" ? (
                            <span className="text-12" style={{ color: "var(--muted)" }}>
                              {p.schedule_info || "Manual only"}
                            </span>
                          ) : ["last_run","next_run","created_at","updated_at"].includes(c.id) ? (
                            <span className="text-12">{fmtDate(p[c.id])}</span>
                          ) : ["patch_count","computer_count"].includes(c.id) ? (
                            <span
                              className="policy-count-pill policy-count-pill--clickable"
                              title={c.id === "patch_count" ? "View matching patches" : "View target computers"}
                              onClick={() => {
                                const tab = c.id === "patch_count" ? "patches" : "computers";
                                if (detailPolicy?.policy_id === p.policy_id) {
                                  setDetailTab(tab);
                                } else {
                                  openDetail(p, tab);
                                }
                              }}
                            >
                              {p[c.id] ?? 0}
                            </span>
                          ) : <span>{p[c.id] ?? "—"}</span>}
                      </td>
                    ))}
                    <td>
                      <div className="flex-row gap-4 items-center">
                        {/* Run now */}
                        <button
                          className="btn-icon"
                          title="Run now — dispatch BigFix action"
                          disabled={running[p.policy_id] || p.status === "running"}
                          onClick={() => handleRunNow(p)}
                          style={{ color: "var(--success)" }}
                        >
                          {running[p.policy_id]
                            ? <InlineSpinner size={14} />
                            : <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>
                          }
                        </button>
                        {/* Toggle active/inactive */}
                        <button
                          className="btn-icon"
                          title={p.status === "active" ? "Deactivate" : "Activate"}
                          onClick={() => handleToggleStatus(p)}
                        >
                          {p.status === "active"
                            ? <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>
                            : <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                          }
                        </button>
                        {/* Edit */}
                        <button className="btn-icon edit" title="Edit policy"
                          onClick={() => { setEditingPolicy(p); setWizardOpen(true); }}>
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                          </svg>
                        </button>
                        {/* Delete */}
                        <button className="btn-icon delete" title="Delete policy"
                          onClick={() => setDeleteTarget(p)}>
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <polyline points="3 6 5 6 21 6"/>
                            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
                          </svg>
                        </button>
                      </div>
                    </td>
                  </tr>

                  {/* ── Inline detail panel ─────────────────────────────── */}
                  {detailPolicy?.policy_id === p.policy_id && (
                    <tr key={`detail-${p.policy_id}`}>
                      <td colSpan={visibleCols.length + 1} style={{ padding: 0, background: "var(--bg)" }}>
                        <div className="policy-detail-panel">

                          {/* Panel header / tabs */}
                          <div className="policy-detail-header">
                            <div className="flex-row gap-0">
                              <button
                                className={`policy-detail-tab ${detailTab === "patches" ? "active" : ""}`}
                                onClick={() => setDetailTab("patches")}
                              >
                                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
                                  <polyline points="9 12 11 14 15 10"/>
                                </svg>
                                Matching Patches
                                <span className="policy-detail-count">
                                  {detailPatchLoad ? "…" : detailPatches.length}
                                </span>
                              </button>
                              <button
                                className={`policy-detail-tab ${detailTab === "computers" ? "active" : ""}`}
                                onClick={() => setDetailTab("computers")}
                              >
                                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                  <rect x="2" y="3" width="20" height="14" rx="2"/>
                                  <line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/>
                                </svg>
                                Target Computers
                                <span className="policy-detail-count">
                                  {detailComputerLoad ? "…" : detailComputers.length}
                                </span>
                              </button>
                            </div>
                            <button className="btn ghost" style={{ fontSize: 12, padding: "4px 10px" }} onClick={closeDetail}>
                              Close ✕
                            </button>
                          </div>

                          {/* Panel body */}
                          <div className="policy-detail-body">
                            {detailTab === "patches" && (
                              detailPatchLoad ? (
                                <div className="policy-detail-loading">
                                  <InlineSpinner /> Resolving matching approved patches…
                                </div>
                              ) : detailPatches.length === 0 ? (
                                <div className="policy-detail-empty">
                                  No approved patches match this policy's criteria. Adjust the patch definitions in the wizard.
                                </div>
                              ) : (
                                <>
                                  <div style={{ fontSize: 12, color: "var(--muted)", padding: "8px 16px", borderBottom: "1px solid var(--border)" }}>
                                    Showing {Math.min(detailPatches.length, 100)} of {detailPatches.length} approved matching patches
                                  </div>
                                  <div style={{ overflowX: "auto" }}>
                                    <table className="policy-detail-table">
                                      <thead>
                                        <tr>
                                          <th>Patch ID</th>
                                          <th>Name</th>
                                          <th>Severity</th>
                                          <th>Category</th>
                                          <th>Site</th>
                                          <th>Source</th>
                                          <th style={{ textAlign: "right" }}>Applicable</th>
                                        </tr>
                                      </thead>
                                      <tbody>
                                        {detailPatches.slice(0, 100).map((patch, i) => {
                                          const sev = (patch.severity || patch.source_severity || "UNSPECIFIED").toUpperCase();
                                          return (
                                            <tr key={patch.patch_id || i}>
                                              <td><code style={{ fontSize: 11 }}>{patch.patch_id || "—"}</code></td>
                                              <td style={{ maxWidth: 340 }}>
                                                <span style={{ fontSize: 13, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", display: "block" }}>
                                                  {patch.patch_name || patch.name || "—"}
                                                </span>
                                              </td>
                                              <td>
                                                <span style={{ fontSize: 11, fontWeight: 700, color: SEV_COLOR[sev] || "var(--muted)" }}>
                                                  {sev}
                                                </span>
                                              </td>
                                              <td><span className="text-12 muted-text">{patch.category || "—"}</span></td>
                                              <td><span className="text-12 muted-text">{patch.site_name || "—"}</span></td>
                                              <td><span className="text-12 muted-text">{patch.source || patch.vendor || "—"}</span></td>
                                              <td style={{ textAlign: "right" }}>
                                                <span className="policy-count-pill">{patch.applicable_count ?? 0}</span>
                                              </td>
                                            </tr>
                                          );
                                        })}
                                      </tbody>
                                    </table>
                                  </div>
                                </>
                              )
                            )}

                            {detailTab === "computers" && (
                              detailComputerLoad ? (
                                <div className="policy-detail-loading">
                                  <InlineSpinner /> Resolving target computers…
                                </div>
                              ) : detailComputers.length === 0 ? (
                                <div className="policy-detail-empty">
                                  No computers were resolved for this policy's target criteria.
                                  <br/>
                                  <span style={{ fontSize: 12, display: "block", marginTop: 6 }}>
                                    Computer resolution uses BigFix groups and property filters at run-time.
                                    Make sure your targets are configured and BigFix groups are accessible.
                                  </span>
                                </div>
                              ) : (
                                <>
                                  <div style={{ fontSize: 12, color: "var(--muted)", padding: "8px 16px", borderBottom: "1px solid var(--border)" }}>
                                    Showing {Math.min(detailComputers.length, 100)} of {detailComputers.length} target computers
                                  </div>
                                  <div style={{ overflowX: "auto" }}>
                                    <table className="policy-detail-table">
                                      <thead>
                                        <tr>
                                          <th>Computer Name</th>
                                          <th>OS</th>
                                          <th>IP Address</th>
                                          <th>Group / Source</th>
                                        </tr>
                                      </thead>
                                      <tbody>
                                        {detailComputers.slice(0, 100).map((c, i) => (
                                          <tr key={c.id || c.computer_id || i}>
                                            <td style={{ fontWeight: 600, fontSize: 13 }}>{c.name || c.computer_name || "—"}</td>
                                            <td><span className="text-12 muted-text">{c.os || c.OS || "—"}</span></td>
                                            <td><code style={{ fontSize: 11 }}>{c.ip || c.ip_address || "—"}</code></td>
                                            <td><span className="text-12 muted-text">{c.group || c.source || "—"}</span></td>
                                          </tr>
                                        ))}
                                      </tbody>
                                    </table>
                                  </div>
                                </>
                              )
                            )}
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </>
              ))
            )}
          </tbody>
        </table>
        <Paginator
          total={filtered.length}
          rpp={rowsPerPage}
          setRpp={setRowsPerPage}
          page={currentPage}
          setPage={setCurrentPage}
        />
      </div>

      {/* ── Filter drawer ────────────────────────────────────────────────── */}
      <FilterDrawer
        isOpen={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        filters={filters}
        setFilters={setFilters}
        globalLogic={globalLogic}
        setGlobalLogic={setGlobalLogic}
        propertyOptions={propertyOptions}
      />

      {/* ── Delete confirm modal ─────────────────────────────────────────── */}
      {deleteTarget && (
        <div className="modal show">
          <div className="modal .box" style={{ maxWidth: 440 }}>
            <div className="action-modal-header">
              <h3>Delete Policy</h3>
              <button className="btn ghost" onClick={() => setDeleteTarget(null)}>✕</button>
            </div>
            <p style={{ color: "var(--muted)", fontSize: 14, margin: "0 0 20px" }}>
              Are you sure you want to delete{" "}
              <strong style={{ color: "var(--text)" }}>{deleteTarget.policy_name}</strong>?{" "}
              This action cannot be undone.
            </p>
            <div className="action-modal-footer">
              <button className="btn outline" onClick={() => setDeleteTarget(null)}>Cancel</button>
              <button className="btn danger" onClick={handleDelete}>Delete Policy</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}