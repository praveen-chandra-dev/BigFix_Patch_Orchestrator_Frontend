// src/components/GroupManager.jsx
import { useState, useEffect, useRef, useMemo } from "react";
import FilterDrawer from "./FilterDrawer";
import { performExport } from "../utils/exportUtils";
import FancySelect from "./common/FancySelect";
import Paginator from "./common/Paginator";

const API = window.env.VITE_API_BASE;

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

export default function GroupManager({ onClose }) {
  const isMO = sessionStorage.getItem("isMO") === "true";
  
  const [groupType, setGroupType] = useState("Automatic");
  const [groupName, setGroupName] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  const [properties, setProperties] = useState([]);
  const [selectedProperty, setSelectedProperty] = useState("");
  const [operators] = useState([{value:"Contains", label:"Contains"}, {value:"Equals", label:"Equals"}, {value:"Starts With", label:"Starts With"}]);
  const [selectedOperator, setSelectedOperator] = useState("Contains");
  const [valueInput, setValueInput] = useState("");
  const [conditions, setConditions] = useState([]); 
  const [loadingProps, setLoadingProps] = useState(false);
  
  const [customSites, setCustomSites] = useState([]);
  const [selectedTargetSite, setSelectedTargetSite] = useState("");
  const [loadingSites, setLoadingSites] = useState(false);

  const [allComputers, setAllComputers] = useState([]);
  const [selectedCompIds, setSelectedCompIds] = useState(new Set()); 
  const [fetchingComp, setFetchingComp] = useState(false);
  const [lastUpdated, setLastUpdated] = useState("");

  const [currentPage, setCurrentPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [sortConfig, setSortConfig] = useState({ key: null, direction: "asc" });
  const [showColDrop, setShowColDrop] = useState(false);
  const [showExpDrop, setShowExpDrop] = useState(false);
  const [exportFormat, setExportFormat] = useState('CSV');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [globalLogic, setGlobalLogic] = useState("AND");
  const [filters, setFilters] = useState([]);
  
  const colRef = useRef(null);
  const expRef = useRef(null);

  const [cols, setCols] = useState([
    { id: 'name', label: 'Computer Name', show: true },
    { id: 'os', label: 'Operating System', show: true },
    { id: 'ips', label: 'IP Address', show: true }
  ]);

  const propertyOptions = useMemo(() => [
    { value: "name", label: "Computer Name" },
    { value: "os", label: "Operating System" },
    { value: "ips", label: "IP Address" }
  ], []);

  useEffect(() => {
    const handleOutside = (e) => {
      if (colRef.current && !colRef.current.contains(e.target)) setShowColDrop(false);
      if (expRef.current && !expRef.current.contains(e.target)) setShowExpDrop(false);
    };
    document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, []);

  useEffect(() => { setError(""); setSuccessMsg(""); }, []);
  const clearMessages = () => { if (error) setError(""); if (successMsg) setSuccessMsg(""); };

  useEffect(() => {
    clearMessages();
    setLastUpdated(new Date().toLocaleString());
    if (groupType === "Automatic" || groupType === "ServerBased") {
      if (properties.length === 0) {
        setLoadingProps(true);
        getJSON("/api/groups/metadata/properties").then(data => setProperties(data.properties?.map(p => ({value: p, label: p})) || [])).catch(e => setError(e.message)).finally(() => setLoadingProps(false));
      }
      if (customSites.length === 0) {
        setLoadingSites(true);
        getJSON("/api/groups/metadata/role-sites").then(data => { 
          const sites = data.sites?.map(s => ({value: s, label: s})) || []; 
          setCustomSites(sites); 
          if (sites.length > 0) setSelectedTargetSite(sites[0].value); 
        }).catch(e => console.error(e)).finally(() => setLoadingSites(false));
      }
    }
  }, [groupType]);

  const fetchComputers = async () => {
    setFetchingComp(true);
    try {
      const url = `/api/groups/metadata/computers?page=1&limit=10000`; 
      const data = await getJSON(url);
      if (data.ok) {
        setAllComputers(data.computers || []);
        setLastUpdated(new Date().toLocaleString());
      }
    } catch (e) { setError(e.message); } finally { setFetchingComp(false); }
  };

  useEffect(() => {
    if (groupType === "Manual") fetchComputers();
    else { setAllComputers([]); setCurrentPage(1); }
  }, [groupType]);

  const applyFilters = (computer) => {
    if (!filters.length) return true;
    let globalMatch = globalLogic === "OR" ? false : true;
    for (let b of filters) {
      let blockMatch = true; let validConds = 0;
      for (let c of b.conds) {
        if (!c.value) continue;
        validConds++; let condition = true;
        const search = String(c.value).toLowerCase();
        let field = "";
        if (c.column === "ips") field = (computer.ips || []).join(", ").toLowerCase();
        else field = String(computer[c.column] || "").toLowerCase();

        if (c.operator === "contains") condition = field.includes(search);
        else if (c.operator === "=") condition = field === search;
        else if (c.operator === "!=") condition = field !== search;
        blockMatch = blockMatch && condition;
      }
      if (validConds > 0) globalMatch = globalLogic === "OR" ? (globalMatch || blockMatch) : (globalMatch && blockMatch);
    }
    return globalMatch;
  };

  const visibleComputers = useMemo(() => allComputers.filter(applyFilters), [allComputers, filters, globalLogic]);

  const sortedComputers = useMemo(() => {
    let sortableItems = [...visibleComputers];
    if (sortConfig.key) {
      sortableItems.sort((a, b) => {
        let aVal = a[sortConfig.key] || "";
        let bVal = b[sortConfig.key] || "";
        if (sortConfig.key === 'ips') {
           aVal = Array.isArray(a.ips) ? a.ips.join(", ") : "";
           bVal = Array.isArray(b.ips) ? b.ips.join(", ") : "";
        }
        aVal = String(aVal).toLowerCase();
        bVal = String(bVal).toLowerCase();

        if (aVal < bVal) return sortConfig.direction === "asc" ? -1 : 1;
        if (aVal > bVal) return sortConfig.direction === "asc" ? 1 : -1;
        return 0;
      });
    }
    return sortableItems;
  }, [visibleComputers, sortConfig]);

  const paginatedComputers = sortedComputers.slice((currentPage - 1) * rowsPerPage, currentPage * rowsPerPage);

  const addCondition = () => {
    clearMessages(); setError("");
    if (!selectedProperty || !valueInput.trim()) { setError("Please select a property and enter a value."); return; }
    setConditions([...conditions, { id: Date.now(), property: selectedProperty, operator: selectedOperator, value: valueInput }]);
    setValueInput(""); 
  };

  const removeCondition = (id) => { clearMessages(); setConditions(conditions.filter(c => c.id !== id)); };

  const toggleComputer = (id) => { clearMessages(); const next = new Set(selectedCompIds); if (next.has(id)) next.delete(id); else next.add(id); setSelectedCompIds(next); };

  const toggleAllVisible = () => { clearMessages(); const next = new Set(selectedCompIds); const allVisibleIds = paginatedComputers.map(c => c.id); const allSelected = allVisibleIds.length > 0 && allVisibleIds.every(id => next.has(id)); if (allSelected) allVisibleIds.forEach(id => next.delete(id)); else allVisibleIds.forEach(id => next.add(id)); setSelectedCompIds(next); };

  const handleSort = (key) => setSortConfig(prev => ({ key, direction: prev.key === key && prev.direction === "asc" ? "desc" : "asc" }));
  const getSortIcon = (key) => {
    if (sortConfig.key !== key) return <span className="muted-text ml-6">↕</span>;
    return <span className="ml-6">{sortConfig.direction === "asc" ? "↑" : "↓"}</span>;
  };

  const handleCreate = async () => {
    setError(""); setSuccessMsg("");
    if (!groupName.trim()) { setError("Group Name is required."); return; }
    const payload = { name: groupName, type: groupType };

    if (groupType === "Automatic" || groupType === "ServerBased") {
      if (conditions.length === 0) { setError("Please add at least one condition."); return; }
      if (!selectedTargetSite) { setError("Please select a target site."); return; }
      payload.targetSite = selectedTargetSite; payload.conditions = conditions;
    } else {
      if (selectedCompIds.size === 0) { setError("Please select at least one computer."); return; }
      payload.computerIds = Array.from(selectedCompIds);
    }

    setCreating(true);
    try {
      await postJSON("/api/groups/create", payload);
      setSuccessMsg(`${groupType} Group "${groupName}" created successfully!`);
      setGroupName(""); setConditions([]); setSelectedCompIds(new Set()); setCurrentPage(1);
    } catch (e) { setError(e.message); } finally { setCreating(false); }
  };

  const activeFilterCount = filters.reduce((acc, b) => acc + b.conds.filter(c => c.value).length, 0);

  const handleExport = (scope) => { 
    setShowExpDrop(false); 
    let dataToExport = [];
    if (scope === 'page') dataToExport = paginatedComputers;
    else if (scope === 'filtered') dataToExport = sortedComputers;
    else dataToExport = allComputers;

    performExport(dataToExport, cols, exportFormat, "computers_export", (r, c) => {
        if (c === 'ips') return Array.isArray(r.ips) ? r.ips.join(", ") : "";
        return r[c];
    });
  };

  return (
    <div className="mgmt">
      <div className="topbar" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div className="left" style={{ display: 'flex', flexDirection: 'column' }}>
            <h2 style={{ margin: 0, fontSize: "22px", fontWeight: 600, color: "var(--text)" }}>Create Computer Group</h2>
            <div className="sub mt-4 text-13 muted-text">Updated: {lastUpdated || "—"}</div>
        </div>
        <div className="right flex-row gap-12 items-center">
            {groupType === 'Manual' && (
              <>
                <div style={{ position: 'relative' }}>
                    <button className="iconbtn" onClick={() => setDrawerOpen(true)} title="Filter Data">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16"><line x1="4" y1="21" x2="4" y2="14"></line><line x1="4" y1="10" x2="4" y2="3"></line><line x1="12" y1="21" x2="12" y2="12"></line><line x1="12" y1="8" x2="12" y2="3"></line><line x1="20" y1="21" x2="20" y2="16"></line><line x1="20" y1="12" x2="20" y2="3"></line><line x1="1" y1="14" x2="7" y2="14"></line><line x1="9" y1="8" x2="15" y2="8"></line><line x1="17" y1="16" x2="23" y2="16"></line></svg>
                    </button>
                    {activeFilterCount > 0 && <span className="pill blue" style={{ position: 'absolute', top: -8, right: -8, padding: '2px 6px', fontSize: 10 }}>{activeFilterCount}</span>}
                </div>
                <button className="iconbtn" onClick={fetchComputers} title="Refresh Data">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16"><path d="M23 4v6h-6"></path><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path></svg>
                </button>
              </>
            )}
        </div>
      </div>

      <div className="section overflow-visible">
        <div className="section-head"><span className="title">1. Group Settings</span></div>
        <div className="controls-grid auto-1fr">
          <div className="field min-w-200">
            <span className="label">Group Type</span>
            <div className="toggle-bg">
              <button className={`toggle-btn ${groupType === "Automatic" ? "active" : ""}`} onClick={() => setGroupType("Automatic")}>Automatic</button>
              {isMO && <button className={`toggle-btn ${groupType === "Manual" ? "active" : ""}`} onClick={() => setGroupType("Manual")}>Manual</button>}
              <button className={`toggle-btn ${groupType === "ServerBased" ? "active" : ""}`} onClick={() => setGroupType("ServerBased")}>Server Based</button>
            </div>
          </div>
          <div className="field">
            <span className="label">Group Name</span>
            <div className="inputwrap">
              <input type="text" className="control" placeholder="e.g., Windows 10 Patch Group" value={groupName} onChange={(e) => { setGroupName(e.target.value); clearMessages(); }} disabled={creating} />
            </div>
          </div>
        </div>
      </div>

      {(groupType === "Automatic" || groupType === "ServerBased") && (
        <div className="section overflow-visible">
          <div className="section-head"><span className="title">2. Define Property Criteria</span></div>
          <div className="flex-row items-end p-20 gap-16 wrap">
            <div className="flex-1 min-w-200">
              <FancySelect label="Property" options={properties} value={selectedProperty} onChange={setSelectedProperty} placeholder="— Select Property —" isLoading={loadingProps} searchable={true} />
            </div>
            <div style={{ flex: 0.7, minWidth: 140 }}>
              <FancySelect label="Comparison" options={operators} value={selectedOperator} onChange={setSelectedOperator} placeholder="Contains" />
            </div>
            <div className="field flex-1 min-w-200">
              <span className="label">Search Text</span>
              <div className="inputwrap">
                <input type="text" className="control" placeholder="e.g., rhel" value={valueInput} onChange={(e) => setValueInput(e.target.value)} />
              </div>
            </div>
            <div className="pb-0"><button className="btn outline small" style={{ height: '32px' }} onClick={addCondition}>Add</button></div>
          </div>
          <div className="flex-row" style={{ padding: '0 20px 20px 20px' }}>
             <div className="flex-1">
               <FancySelect label="Target Site (Custom)" options={customSites} value={selectedTargetSite} onChange={setSelectedTargetSite} placeholder="— Select Target Site —" isLoading={loadingSites} searchable={true} />
             </div>
          </div>
          {conditions.length > 0 && (
            <div className="tableWrap border-top" style={{ borderRadius: 0, borderLeft: 'none', borderRight: 'none' }}>
              <table>
                <thead><tr><th>Property</th><th>Comparison</th><th>Value</th><th>Target Site</th><th className="right">Action</th></tr></thead>
                <tbody>{conditions.map(c => <tr key={c.id}><td><b>{c.property}</b></td><td><span className="rowchip succ">{c.operator}</span></td><td>{c.value}</td><td className="muted-text">{selectedTargetSite || "—"}</td><td className="right"><button className="btn-icon-sm" onClick={() => removeCondition(c.id)}>✕</button></td></tr>)}</tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {groupType === "Manual" && (
        <div className="section overflow-visible">
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

          <div className="section-head" style={{ paddingBottom: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span className="title">2. Select Computers</span>
              <span className="pill soft">Selected: {selectedCompIds.size}</span>
            </div>
            <div style={{ display: 'flex', gap: '12px' }}>
                <div className="dropdown" ref={colRef}>
                    <button className="btn outline sec small" onClick={() => { setShowColDrop(!showColDrop); setShowExpDrop(false); }}>
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16"><line x1="8" y1="6" x2="21" y2="6"></line><line x1="8" y1="12" x2="21" y2="12"></line><line x1="8" y1="18" x2="21" y2="18"></line><line x1="3" y1="6" x2="3.01" y2="6"></line><line x1="3" y1="12" x2="3.01" y2="12"></line><line x1="3" y1="18" x2="3.01" y2="18"></line></svg>
                        &nbsp; Columns
                    </button>
                    {showColDrop && (
                        <div className="dropdown-menu show" style={{ minWidth: "220px", padding: "12px", right: 0 }}>
                            <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                                {cols.map((col, i) => (
                                    <label key={col.id} style={{ display: "flex", alignItems: "center", gap: "10px", cursor: "pointer", padding: "6px 12px", borderRadius: "4px", transition: "0.2s" }} onMouseOver={e=>e.currentTarget.style.background="#f8fafc"} onMouseOut={e=>e.currentTarget.style.background="transparent"}>
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
                            <div style={{ fontSize: "11px", fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", marginBottom: "12px", letterSpacing: '0.05em' }}>Format</div>
                            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "8px", marginBottom: "20px" }}>
                               {['CSV', 'PDF', 'HTML', 'TXT', 'JSON', 'XML'].map(fmt => (
                                 <button key={fmt} className={`btn small ${exportFormat === fmt ? 'pri' : 'outline'}`} style={{ fontSize: '11px', height: '32px', padding: 0 }} onClick={(e) => { e.stopPropagation(); setExportFormat(fmt); }}>{fmt}</button>
                               ))}
                            </div>
                            <div style={{ height: '1px', background: 'var(--border)', marginBottom: '16px' }}></div>
                            <div style={{ fontSize: "11px", fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", marginBottom: "12px", letterSpacing: '0.05em' }}>Scope</div>
                            <button className="item" onClick={() => handleExport('page')}>Current Page</button>
                            <button className="item" onClick={() => handleExport('filtered')}>Filtered Data</button>
                            <button className="item" onClick={() => handleExport('all')}>All Data</button>
                        </div>
                    )}
                </div>
            </div>
          </div>
          
          <div className="tableWrap h-400 border-top" style={{ borderRadius: 0, borderLeft: 'none', borderRight: 'none' }}>
            {fetchingComp ? (
               <div className="sub empty-state" style={{ padding: '40px', textAlign: 'center' }}>Loading computers...</div>
            ) : paginatedComputers.length === 0 ? (
               <div className="sub empty-state" style={{ padding: '40px', textAlign: 'center' }}>No computers found.</div>
            ) : (
              <table>
                <thead className="kpi-th-sticky">
                  <tr>
                    <th className="text-center w-40"><input type="checkbox" className="custom-checkbox" onChange={toggleAllVisible} checked={paginatedComputers.length > 0 && paginatedComputers.every(c => selectedCompIds.has(c.id))} /></th>
                    {cols.find(c=>c.id==='name')?.show && <th className="cursor-pointer" onClick={() => handleSort('name')}>Computer Name{getSortIcon('name')}</th>}
                    {cols.find(c=>c.id==='os')?.show && <th className="cursor-pointer" onClick={() => handleSort('os')}>Operating System{getSortIcon('os')}</th>}
                    {cols.find(c=>c.id==='ips')?.show && <th className="cursor-pointer" onClick={() => handleSort('ips')}>IP Address{getSortIcon('ips')}</th>}
                  </tr>
                </thead>
                <tbody>
                  {paginatedComputers.map((c) => (
                    <tr key={c.id} onClick={() => toggleComputer(c.id)} className={selectedCompIds.has(c.id) ? "selected-row" : ""}>
                      <td className="text-center"><input type="checkbox" className="custom-checkbox no-events" checked={selectedCompIds.has(c.id)} readOnly /></td>
                      {cols.find(c=>c.id==='name')?.show && <td>{c.name}</td>}
                      {cols.find(c=>c.id==='os')?.show && <td>{c.os}</td>}
                      {cols.find(c=>c.id==='ips')?.show && <td className="muted-text">{c.ips?.[0] || "-"}</td>}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <Paginator total={sortedComputers.length} rpp={rowsPerPage} setRpp={setRowsPerPage} page={currentPage} setPage={setCurrentPage} edgeToEdge={false} />
        </div>
      )}

      <div className="p-0-20-10">
        {error && <div className="banner error">{error}</div>}
        {successMsg && <div className="banner success"><svg className="banner-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg><span>{successMsg}</span></div>}
      </div>

      <div className="action-bar" style={{ borderTop: '1px solid var(--border)' }}>
        <div className="spacer"></div>
        <button className="btn pri min-w-140" onClick={handleCreate} disabled={creating || !groupName || ((groupType==='Automatic' || groupType === 'ServerBased') && !conditions.length) || (groupType==='Manual' && !selectedCompIds.size)}>
          {creating ? "Creating..." : "Create Group"}
        </button>
      </div>

      {groupType === 'Manual' && (
         <FilterDrawer isOpen={drawerOpen} onClose={() => setDrawerOpen(false)} filters={filters} setFilters={setFilters} globalLogic={globalLogic} setGlobalLogic={setGlobalLogic} propertyOptions={propertyOptions} />
      )}
    </div>
  );
}