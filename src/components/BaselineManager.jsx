// src/components/BaselineManager.jsx
import { useState, useEffect, useMemo, useRef } from "react";
import FilterDrawer from "./FilterDrawer";

const API = window.env?.VITE_API_BASE || "http://localhost:5174";

function getHeaders() {
  return { "Content-Type": "application/json", "Accept": "application/json", "x-user-role": sessionStorage.getItem("user_role") || "Admin" };
}

async function getJSON(endpoint) {
  const r = await fetch(`${API}${endpoint}`, { headers: getHeaders() });
  const j = await r.json();
  if (!r.ok || j.ok === false) throw new Error(j.error || "Request failed");
  return j;
}

async function postJSON(endpoint, body) {
  const r = await fetch(`${API}${endpoint}`, { method: "POST", headers: getHeaders(), body: JSON.stringify(body) });
  const j = await r.json();
  if (!r.ok || j.ok === false) throw new Error(j.error || "Request failed");
  return j;
}

const FancySelect = ({ label, options, value, onChange, disabled, placeholder, isLoading, multiSelect }) => {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef(null);

  useEffect(() => {
    function handleClickOutside(event) { if (wrapperRef.current && !wrapperRef.current.contains(event.target)) setOpen(false); }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  let displayText = placeholder;
  let isPlaceholder = true;

  if (multiSelect) {
    if (Array.isArray(value) && value.length > 0) { isPlaceholder = false; displayText = value.length <= 2 ? value.join(", ") : `${value.length} selected`; }
  } else {
    const selectedOption = options.find((o) => o === value);
    if (selectedOption) { displayText = selectedOption; isPlaceholder = false; }
  }

  const handleOptionClick = (opt, e) => {
    if (multiSelect) {
      e.stopPropagation(); const current = Array.isArray(value) ? value : []; const newSet = new Set(current);
      if (newSet.has(opt)) newSet.delete(opt); else newSet.add(opt); onChange(Array.from(newSet));
    } else { onChange(opt); setOpen(false); }
  };

  return (
    <div className="field flex-1">
      <span className="label">{label}</span>
      {isLoading && <div className="sub label-loading-sub">Loading...</div>}
      <div className={`fx-wrap flex-1 ${open ? "fx-open" : ""} ${disabled || isLoading ? "disabled" : ""}`} ref={wrapperRef}>
        <button type="button" className="fx-trigger" onClick={() => setOpen(!open)}>
          <span className={`fx-value ${isPlaceholder ? "fx-placeholder" : ""}`} title={!isPlaceholder ? displayText : ""}>{displayText}</span>
          <span className="fx-chevron">▾</span>
        </button>

        {open && (
          <div className="fx-menu">
            <div className="fx-menu-inner">
              {options.length === 0 ? (
                <div className="fx-item fx-empty">No options</div>
              ) : (
                options.map((opt) => {
                  const isSelected = multiSelect ? (value || []).includes(opt) : value === opt;
                  return (
                    <div key={opt} className={`fx-item ${isSelected ? "fx-active" : ""}`} onClick={(e) => handleOptionClick(opt, e)}>
                      {multiSelect && <input type="checkbox" className="custom-checkbox mr-10 no-events" checked={isSelected} readOnly />}
                      <span className="fx-label">{opt}</span>
                      {!multiSelect && isSelected && <span className="fx-tick">✓</span>}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default function BaselineManager({ onClose }) {
  const [sites, setSites] = useState([]);
  const [selectedSites, setSelectedSites] = useState([]);
  const [selectedSeverities, setSelectedSeverities] = useState([]);
  const [allPatches, setAllPatches] = useState([]);
  const [loadingSites, setLoadingSites] = useState(false);
  const [loadingPatches, setLoadingPatches] = useState(false);
  const [error, setError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");
  const [selectedPatchKeys, setSelectedPatchKeys] = useState(() => new Set());
  const [targetSites, setTargetSites] = useState([]);
  const [selectedTargetSite, setSelectedTargetSite] = useState("");
  const [baselineName, setBaselineName] = useState("");
  const [creating, setCreating] = useState(false);
  const [lastUpdated, setLastUpdated] = useState("");

  // Toolbar, Pagination & Sorting State
  const [currentPage, setCurrentPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [sortConfig, setSortConfig] = useState({ key: null, direction: "asc" });
  const [showColDrop, setShowColDrop] = useState(false);
  const [showExpDrop, setShowExpDrop] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [globalLogic, setGlobalLogic] = useState("AND");
  const [filters, setFilters] = useState([]);
  
  const colRef = useRef(null);
  const expRef = useRef(null);

  const [cols, setCols] = useState([
    { id: 'id', label: 'ID', show: true },
    { id: 'severity', label: 'Severity', show: true },
    { id: 'site', label: 'Site', show: true },
    { id: 'name', label: 'Name', show: true }
  ]);

  const propertyOptions = [
    { value: "id", label: "Patch ID" },
    { value: "name", label: "Name" },
    { value: "severity", label: "Severity" },
    { value: "site", label: "Site" }
  ];

  useEffect(() => {
    const handleOutside = (e) => {
      if (colRef.current && !colRef.current.contains(e.target)) setShowColDrop(false);
      if (expRef.current && !expRef.current.contains(e.target)) setShowExpDrop(false);
    };
    document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, []);

  const clearMessages = () => { if (error) setError(""); if (successMsg) setSuccessMsg(""); };

  useEffect(() => {
    async function init() {
      setLoadingSites(true);
      try {
        const [jSrc, jTgt] = await Promise.all([getJSON("/api/baseline/sites"), getJSON("/api/baseline/custom-sites")]);
        if (jSrc.ok) {
            let sourceSites = jSrc.sites || [];
            if (sessionStorage.getItem("user_role") === 'EUC') sourceSites = sourceSites.filter(s => s.toLowerCase().includes('windows'));
            setSites(sourceSites);
        }
        if (jTgt.ok) {
          const tSites = jTgt.sites || []; setTargetSites(tSites);
          if (tSites.length > 0) setSelectedTargetSite(tSites[0]);
        }
      } catch (e) { setError(e.message); } finally { setLoadingSites(false); }
    }
    init();
  }, []);

  const fetchPatches = async () => {
    if (selectedSites.length === 0) return;
    setLoadingPatches(true);
    try {
      let combined = [];
      for (const site of selectedSites) {
        const j = await getJSON(`/api/baseline/patches?site=${encodeURIComponent(site)}`);
        if (j.ok && Array.isArray(j.patches)) combined = combined.concat(j.patches.map((p) => ({ ...p, site: p.site || site, key: `${p.id}||${p.site || site}` })));
      }
      setAllPatches(combined);
      setLastUpdated(new Date().toLocaleString());
    } catch (e) { setError(e.message); } finally { setLoadingPatches(false); }
  };

  useEffect(() => {
    clearMessages(); setSelectedSeverities([]); setAllPatches([]); setSelectedPatchKeys(new Set());
    fetchPatches();
  }, [selectedSites]);

  const availableSeverities = useMemo(() => { if (allPatches.length === 0) return []; return Array.from(new Set(allPatches.map((p) => p.severity || "Unspecified"))).sort(); }, [allPatches]);
  
  const applyFilters = (patch) => {
    if (!filters.length) return true;
    let globalMatch = globalLogic === "OR" ? false : true;
    for (let b of filters) {
      let blockMatch = true; let validConds = 0;
      for (let c of b.conds) {
        if (!c.value) continue;
        validConds++; let condition = true;
        const search = String(c.value).toLowerCase();
        let field = String(patch[c.column] || "").toLowerCase();
        if (c.operator === "contains") condition = field.includes(search);
        else if (c.operator === "=") condition = field === search;
        else if (c.operator === "!=") condition = field !== search;
        blockMatch = blockMatch && condition;
      }
      if (validConds > 0) globalMatch = globalLogic === "OR" ? (globalMatch || blockMatch) : (globalMatch && blockMatch);
    }
    return globalMatch;
  };

  const filteredPatches = useMemo(() => { 
    if (selectedSites.length === 0 || selectedSeverities.length === 0) return []; 
    return allPatches.filter((p) => selectedSeverities.includes(p.severity || "Unspecified")).filter(applyFilters); 
  }, [allPatches, selectedSeverities, selectedSites, filters, globalLogic]);

  const sortedPatches = useMemo(() => {
    let sortableItems = [...filteredPatches];
    if (sortConfig.key) {
      sortableItems.sort((a, b) => {
        const aVal = String(a[sortConfig.key] || "").toLowerCase();
        const bVal = String(b[sortConfig.key] || "").toLowerCase();
        if (aVal < bVal) return sortConfig.direction === "asc" ? -1 : 1;
        if (aVal > bVal) return sortConfig.direction === "asc" ? 1 : -1;
        return 0;
      });
    }
    return sortableItems;
  }, [filteredPatches, sortConfig]);

  const totalPages = Math.ceil(sortedPatches.length / rowsPerPage);
  const paginatedPatches = sortedPatches.slice((currentPage - 1) * rowsPerPage, currentPage * rowsPerPage);

  const togglePatch = (key) => { clearMessages(); const next = new Set(selectedPatchKeys); if (next.has(key)) next.delete(key); else next.add(key); setSelectedPatchKeys(next); };
  const toggleAll = () => { clearMessages(); const allKeys = paginatedPatches.map((p) => p.key); const allSelected = allKeys.length > 0 && allKeys.every((k) => selectedPatchKeys.has(k)); const next = new Set(selectedPatchKeys); if (allSelected) allKeys.forEach((k) => next.delete(k)); else allKeys.forEach((k) => next.add(k)); setSelectedPatchKeys(next); };

  const handleSort = (key) => setSortConfig(prev => ({ key, direction: prev.key === key && prev.direction === "asc" ? "desc" : "asc" }));
  const getSortArrow = (key) => sortConfig.key !== key ? "" : sortConfig.direction === "asc" ? " ↑" : " ↓";

  const handleCreate = async () => {
    setError(""); setSuccessMsg(""); const localName = baselineName.trim();
    if (!localName) { setError("Please enter a Baseline Name."); return; }
    if (!selectedTargetSite) { setError("Please select a Target Site."); return; }
    if (selectedPatchKeys.size === 0) { setError("Please select at least one patch."); return; }
    setCreating(true);
    try {
      const payload = { baselineName: localName, targetSite: selectedTargetSite, patchKeys: Array.from(selectedPatchKeys) };
      const j = await postJSON("/api/baseline/create", payload);
      if (j.ok) { setSuccessMsg(`Baseline "${j.baselineName || localName}" created successfully.`); setBaselineName(""); setSelectedPatchKeys(new Set()); } 
      else { throw new Error(j.error || "Failed to create baseline"); }
    } catch (e) { setError(e.message); } finally { setCreating(false); }
  };

  const isAllSelected = paginatedPatches.length > 0 && paginatedPatches.every((p) => selectedPatchKeys.has(p.key));
  const isIndeterminate = paginatedPatches.some((p) => selectedPatchKeys.has(p.key)) && !isAllSelected;
  const activeFilterCount = filters.reduce((acc, b) => acc + b.conds.filter(c => c.value).length, 0);

  const handleExport = (fmt) => { 
    setShowExpDrop(false); 
    if (fmt === 'CSV') {
        const header = cols.filter(c => c.show).map(c => c.label);
        const rows = sortedPatches.map(p => cols.filter(c => c.show).map(c => `"${p[c.id] || ""}"`));
        const csv = [header.join(','), ...rows.map(r => r.join(','))].join('\n');
        const blob = new Blob([csv], { type: "text/csv" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url; a.download = "baselines_export.csv"; a.click();
    }
  };

  return (
    <div className="mgmt">
      <div className="topbar">
        <div className="left"><h2>Create Baseline</h2></div>
        <div className="right flex-row gap-12 items-center">
            <div style={{ position: 'relative' }}>
                <button className="iconbtn" onClick={() => setDrawerOpen(true)} title="Filter Data">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16"><line x1="4" y1="21" x2="4" y2="14"></line><line x1="4" y1="10" x2="4" y2="3"></line><line x1="12" y1="21" x2="12" y2="12"></line><line x1="12" y1="8" x2="12" y2="3"></line><line x1="20" y1="21" x2="20" y2="16"></line><line x1="20" y1="12" x2="20" y2="3"></line><line x1="1" y1="14" x2="7" y2="14"></line><line x1="9" y1="8" x2="15" y2="8"></line><line x1="17" y1="16" x2="23" y2="16"></line></svg>
                </button>
                {activeFilterCount > 0 && <span className="pill blue" style={{ position: 'absolute', top: -8, right: -8, padding: '2px 6px', fontSize: 10 }}>{activeFilterCount}</span>}
            </div>
            <button className="iconbtn" onClick={fetchPatches} title="Refresh Data">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16"><path d="M23 4v6h-6"></path><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path></svg>
            </button>
        </div>
      </div>

      <div className="section overflow-visible">
        <div className="section-head"><span className="title">1. Filter Patches</span></div>
        <div className="controls-grid">
          <FancySelect label="Select Source Site(s)" options={sites} value={selectedSites} onChange={setSelectedSites} placeholder="— Select Site(s) —" isLoading={loadingSites} disabled={loadingSites} multiSelect={true} />
          <FancySelect label="Select Severity" options={availableSeverities} value={selectedSeverities} onChange={(v) => { setSelectedSeverities(v); clearMessages(); }} placeholder="— Select Severity —" isLoading={loadingPatches} disabled={selectedSites.length === 0} multiSelect={true} />
        </div>
      </div>

      {selectedSites.length > 0 && selectedSeverities.length > 0 && (
        <div className="section">
          <div className="section-head" style={{ paddingBottom: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span className="title">2. Select Patches</span>
              <span className="pill soft">Selected: {selectedPatchKeys.size}</span>
            </div>
          </div>
          
          <div className="grid-toolbar" style={{ padding: '16px 20px 16px 20px', margin: 0, borderBottom: 'none' }}>
             <div className="grid-toolbar-left" style={{ fontWeight: 600, color: 'var(--text)' }}>
             </div>
             <div className="grid-toolbar-right" style={{ display: 'flex', gap: '12px' }}>
                <div className="dropdown" ref={colRef}>
                    <button className="btn outline sec small" onClick={() => { setShowColDrop(!showColDrop); setShowExpDrop(false); }}>
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16"><line x1="8" y1="6" x2="21" y2="6"></line><line x1="8" y1="12" x2="21" y2="12"></line><line x1="8" y1="18" x2="21" y2="18"></line><line x1="3" y1="6" x2="3.01" y2="6"></line><line x1="3" y1="12" x2="3.01" y2="12"></line><line x1="3" y1="18" x2="3.01" y2="18"></line></svg>
                        &nbsp; Columns
                    </button>
                    {showColDrop && (
                        <div className="dropdown-menu show" style={{ minWidth: "220px", padding: "12px", right: 0 }}>
                            <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                                {cols.map((col, i) => (
                                    <label key={col.id} style={{ display: "flex", alignItems: "center", gap: "10px", cursor: "pointer", padding: "6px 12px", borderRadius: "4px" }} onMouseOver={e=>e.currentTarget.style.background="#f8fafc"} onMouseOut={e=>e.currentTarget.style.background="transparent"}>
                                        <input type="checkbox" className="custom-checkbox" checked={col.show} onChange={e => {
                                            const next = [...cols]; next[i].show = e.target.checked; setCols(next);
                                        }} />
                                        <span style={{ fontSize: "13px", fontWeight: 500 }}>{col.label}</span>
                                    </label>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
                <div className="dropdown" ref={expRef}>
                    <button className="btn outline small" onClick={() => { setShowExpDrop(!showExpDrop); setShowColDrop(false); }}>
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"></path></svg>
                        &nbsp; Export
                    </button>
                    {showExpDrop && (
                        <div className="dropdown-menu show" style={{ width: "280px", padding: "16px", right: 0 }}>
                            <div style={{ fontSize: "11px", fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", marginBottom: "12px" }}>Format</div>
                            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "8px", marginBottom: "20px" }}>
                               {['CSV', 'PDF', 'HTML', 'TXT', 'JSON', 'XML'].map(fmt => (
                                 <button key={fmt} className="btn outline small" style={{ fontSize: '11px', height: '32px' }} onClick={() => handleExport(fmt)}>{fmt}</button>
                               ))}
                            </div>
                            <div style={{ height: '1px', background: 'var(--border)', marginBottom: '16px' }}></div>
                            <div style={{ fontSize: "11px", fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", marginBottom: "12px" }}>Scope</div>
                            <button className="item" onClick={() => handleExport('CSV')}>Filtered Data</button>
                        </div>
                    )}
                </div>
             </div>
          </div>
          
          <div className="tableWrap h-400 border-top" style={{ borderRadius: 0, borderLeft: 'none', borderRight: 'none' }}>
            {filteredPatches.length === 0 ? (
              <div className="sub empty-state" style={{ padding: '40px', textAlign: 'center' }}>No patches found.</div>
            ) : (
              <table>
                <thead className="kpi-th-sticky">
                  <tr>
                    <th className="text-center w-40"><input type="checkbox" className="custom-checkbox" checked={isAllSelected} ref={(el) => el && (el.indeterminate = isIndeterminate)} onChange={toggleAll} /></th>
                    {cols.find(c=>c.id==='id')?.show && <th className="cursor-pointer" onClick={() => handleSort('id')}>ID{getSortArrow('id')}</th>}
                    {cols.find(c=>c.id==='severity')?.show && <th className="cursor-pointer" onClick={() => handleSort('severity')}>Severity{getSortArrow('severity')}</th>}
                    {cols.find(c=>c.id==='site')?.show && <th className="cursor-pointer" onClick={() => handleSort('site')}>Site{getSortArrow('site')}</th>}
                    {cols.find(c=>c.id==='name')?.show && <th className="cursor-pointer" onClick={() => handleSort('name')}>Name{getSortArrow('name')}</th>}
                  </tr>
                </thead>
                <tbody>
                  {paginatedPatches.map((p) => (
                    <tr key={p.key} onClick={() => togglePatch(p.key)} className={selectedPatchKeys.has(p.key) ? "selected-row" : ""}>
                      <td className="text-center"><input type="checkbox" className="custom-checkbox no-events" checked={selectedPatchKeys.has(p.key)} readOnly /></td>
                      {cols.find(c=>c.id==='id')?.show && <td>{p.id}</td>}
                      {cols.find(c=>c.id==='severity')?.show && <td><span className={`rowchip ${/critical/i.test(p.severity) ? "hf" : "succ"}`}>{p.severity}</span></td>}
                      {cols.find(c=>c.id==='site')?.show && <td>{p.site}</td>}
                      {cols.find(c=>c.id==='name')?.show && <td>{p.name}</td>}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <div className="pagination" style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", padding: "16px 20px", gap: "24px", background: 'var(--panel)' }}>
              <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                  <span className="pager-info" style={{ fontSize: "13px", color: "var(--muted)" }}>Rows per page:</span>
                  <select className="control" style={{ width: "70px", height: "32px", padding: '0 8px' }} value={rowsPerPage} onChange={(e) => { setRowsPerPage(Number(e.target.value)); setCurrentPage(1); }}>
                      <option value={10}>10</option><option value={20}>20</option><option value={50}>50</option>
                  </select>
              </div>
              <span className="pager-info" style={{ fontSize: "13px", color: "var(--muted)" }}>
                  {filteredPatches.length > 0 ? (currentPage - 1) * rowsPerPage + 1 : 0}-{Math.min(currentPage * rowsPerPage, filteredPatches.length)} of {filteredPatches.length}
              </span>
              <div className="pager-btns" style={{ display: "flex", gap: "4px" }}>
                  <button className="pager-btn" disabled={currentPage === 1} onClick={() => setCurrentPage(p => p - 1)}>&lt;</button>
                  <button className={`pager-btn ${currentPage === 1 ? 'active' : ''}`} onClick={() => setCurrentPage(1)}>1</button>
                  {totalPages > 1 && <button className={`pager-btn ${currentPage === 2 ? 'active' : ''}`} onClick={() => setCurrentPage(2)}>2</button>}
                  {totalPages > 2 && <span style={{ padding: '0 4px', color: 'var(--muted)' }}>..</span>}
                  {totalPages > 2 && currentPage > 2 && currentPage < totalPages && <button className="pager-btn active">{currentPage}</button>}
                  {totalPages > 2 && <button className={`pager-btn ${currentPage === totalPages ? 'active' : ''}`} onClick={() => setCurrentPage(totalPages)}>{totalPages}</button>}
                  <button className="pager-btn" disabled={currentPage === totalPages || totalPages === 0} onClick={() => setCurrentPage(p => p + 1)}>&gt;</button>
              </div>
          </div>
        </div>
      )}

      {activeFilterCount > 0 && (
          <div className="p-0-20-20">
              <div className="active-filter-banner active">
                <div className="filter-tags">
                  {filters.map((b, bIdx) => {
                    const validConds = b.conds.filter(c => c.value);
                    if (!validConds.length) return null;
                    return (
                      <div key={bIdx} style={{display:'inline-flex', alignItems:'center'}}>
                        {bIdx > 0 && <span style={{fontSize:12, fontWeight:600, color:'var(--primary)', margin:'0 8px'}}>{globalLogic}</span>}
                        {validConds.map((c, cIdx) => (
                          <span key={cIdx} style={{display:'inline-flex', alignItems:'center'}}>
                            {cIdx > 0 && <span style={{fontSize:11, fontWeight:600, color:'var(--primary)', margin:'0 6px'}}>AND</span>}
                            <span className="filter-tag"><strong>{propertyOptions.find(o => o.value === c.column)?.label || c.column}</strong>&nbsp;{c.operator}&nbsp;<strong>'{c.value}'</strong></span>
                          </span>
                        ))}
                      </div>
                    );
                  })}
                </div>
                <button className="btn outline" onClick={() => setFilters([])}>Clear Filters</button>
              </div>
          </div>
      )}

      <div className="p-0-20-20">
        {error && <div className="banner error">{error}</div>}
        {successMsg && <div className="banner success"><svg className="banner-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg><span>{successMsg}</span></div>}
      </div>

      {selectedPatchKeys.size > 0 && (
        <div className="section overflow-visible">
          <div className="section-head"><span className="title">3. Finalize & Create</span></div>
          <div className="controls-grid">
            <div className="field flex-1">
              <span className="label">Baseline Name</span>
              <div className="inputwrap">
                <input type="text" className="control" placeholder="e.g., Nov 2025 Security Updates" value={baselineName} onChange={(e) => { setBaselineName(e.target.value); clearMessages(); }} disabled={creating} />
              </div>
            </div>
            <div className="flex-1">
              <FancySelect label="Target Custom Site" options={targetSites} value={selectedTargetSite} onChange={(v) => { setSelectedTargetSite(v); clearMessages(); }} placeholder="— Select Target Site —" isLoading={loadingSites} disabled={creating} />
            </div>
          </div>
          <div className="action-bar" style={{ borderTop: '1px solid var(--border)' }}>
            <div className="spacer"></div>
            <button className="btn pri min-w-140" onClick={handleCreate} disabled={creating}>{creating ? "Creating..." : "Create Baseline"}</button>
          </div>
        </div>
      )}

      <FilterDrawer isOpen={drawerOpen} onClose={() => setDrawerOpen(false)} filters={filters} setFilters={setFilters} globalLogic={globalLogic} setGlobalLogic={setGlobalLogic} propertyOptions={propertyOptions} />
    </div>
  );
}