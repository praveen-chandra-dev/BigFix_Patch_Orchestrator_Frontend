import { useState, useEffect, useMemo, useRef } from "react";
import FilterDrawer from "./FilterDrawer";
import { performExport } from "../utils/exportUtils";
import Paginator from "./common/Paginator";
import { useToast } from "./common/CustomToast";

const API = window.env?.VITE_API_BASE || "";

function getHeaders() {
  return { "Content-Type": "application/json", "Accept": "application/json", "x-user-role": sessionStorage.getItem("user_role") || "Admin" };
}

export default function ComputerList({ groupId, groupName }) {
  const { showToast } = useToast();
  const [computers, setComputers] = useState([]);
  const [loading, setLoading] = useState(true);

  // Pagination & Sorting & Display
  const [currentPage, setCurrentPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [sortConfig, setSortConfig] = useState({ key: null, direction: "asc" });
  
  // Controls
  const [showColDrop, setShowColDrop] = useState(false);
  const [showExpDrop, setShowExpDrop] = useState(false);
  const [exportFormat, setExportFormat] = useState('CSV');
  const colRef = useRef(null);
  const expRef = useRef(null);

  // Filters
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [globalLogic, setGlobalLogic] = useState("AND");
  const [filters, setFilters] = useState([]);

  const [cols, setCols] = useState([
    { id: 'name', label: 'Computer Name', show: true },
    { id: 'os', label: 'OS', show: true },
    { id: 'ip', label: 'IP Address', show: true },
    { id: 'lastReport', label: 'Last Report Time', show: true },
    { id: 'locked', label: 'Locked', show: false },
    { id: 'relay', label: 'Relay', show: false },
    { id: 'dns', label: 'DNS Name', show: false },
    { id: 'rootServer', label: 'BES Root Server', show: false },
    { id: 'agentType', label: 'Agent Type', show: false },
    { id: 'deviceType', label: 'Device Type', show: false },
    { id: 'agentVersion', label: 'Agent Version', show: false },
    { id: 'osVersion', label: 'OS Version', show: false }
  ]);

  const propertyOptions = useMemo(() => cols.map(c => ({ value: c.id, label: c.label })), [cols]);

  useEffect(() => {
    fetchComputers();
  }, [groupId]);

  useEffect(() => {
    const handleOutside = (e) => {
      if (colRef.current && !colRef.current.contains(e.target)) setShowColDrop(false);
      if (expRef.current && !expRef.current.contains(e.target)) setShowExpDrop(false);
    };
    document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, []);

  const fetchComputers = async () => {
    setLoading(true);
    try {
      const endpoint = groupId ? `/api/groups/computers-extended?groupId=${groupId}` : `/api/groups/computers-extended`;
      const r = await fetch(`${API}${endpoint}`, { headers: getHeaders() });
      const data = await r.json();
      if (data.ok) setComputers(data.computers || []);
      else throw new Error(data.error || "Failed to fetch computers");
    } catch (e) {
      showToast(e.message, "error");
    } finally {
      setLoading(false);
    }
  };

  const applyFilters = (comp) => {
    if (!filters.length) return true;
    let globalMatch = globalLogic === "OR" ? false : true;
    for (let b of filters) {
      let blockMatch = true; let validConds = 0;
      for (let c of b.conds) {
        if (!c.value) continue;
        validConds++; let condition = true;
        const search = String(c.value).toLowerCase();
        const field = String(comp[c.column] || "").toLowerCase();

        if (c.operator === "contains") condition = field.includes(search);
        else if (c.operator === "=") condition = field === search;
        else if (c.operator === "!=") condition = field !== search;
        blockMatch = blockMatch && condition;
      }
      if (validConds > 0) globalMatch = globalLogic === "OR" ? (globalMatch || blockMatch) : (globalMatch && blockMatch);
    }
    return globalMatch;
  };

  const visibleData = useMemo(() => computers.filter(applyFilters), [computers, filters, globalLogic]);

  const sortedData = useMemo(() => {
    let items = [...visibleData];
    if (sortConfig.key) {
      items.sort((a, b) => {
        const aVal = String(a[sortConfig.key] || "").toLowerCase();
        const bVal = String(b[sortConfig.key] || "").toLowerCase();
        if (aVal < bVal) return sortConfig.direction === "asc" ? -1 : 1;
        if (aVal > bVal) return sortConfig.direction === "asc" ? 1 : -1;
        return 0;
      });
    }
    return items;
  }, [visibleData, sortConfig]);

  const paginatedData = sortedData.slice((currentPage - 1) * rowsPerPage, currentPage * rowsPerPage);
  const activeFilterCount = filters.reduce((acc, b) => acc + b.conds.filter(c => c.value).length, 0);

  const handleSort = (key) => setSortConfig(prev => ({ key, direction: prev.key === key && prev.direction === "asc" ? "desc" : "asc" }));
  const getSortIcon = (key) => sortConfig.key === key ? <span className="ml-6">{sortConfig.direction === "asc" ? "↑" : "↓"}</span> : <span className="muted-text ml-6">↕</span>;

  const handleExport = (scope) => { 
    setShowExpDrop(false); 
    let dataToExport = scope === 'page' ? paginatedData : scope === 'filtered' ? sortedData : computers;
    performExport(dataToExport, cols, exportFormat, groupId ? `Group_${groupName}_Computers` : "All_Computers");
  };

  return (
    <div className="mgmt">
      <div className="topbar" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div className="left" style={{ display: 'flex', flexDirection: 'column' }}>
            <h2 style={{ margin: 0, fontSize: "22px", fontWeight: 600, color: "var(--text)" }}>
                {groupId ? `Computer List: ${groupName}` : "Computer List (All)"}
            </h2>
            <div className="sub mt-4 text-13 muted-text">View and filter extended computer properties</div>
        </div>
        <div className="right flex-row gap-12 items-center">
            {groupId && (
                <button className="btn outline sec" onClick={() => window.dispatchEvent(new CustomEvent('nav:group', {detail: 'MANAGE'}))}>
                    ← Back to Groups
                </button>
            )}
            <div style={{ position: 'relative' }}>
                 <button className="iconbtn" onClick={() => setDrawerOpen(true)} title="Filter Data">
                     <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16"><line x1="4" y1="21" x2="4" y2="14"></line><line x1="4" y1="10" x2="4" y2="3"></line><line x1="12" y1="21" x2="12" y2="12"></line><line x1="12" y1="8" x2="12" y2="3"></line><line x1="20" y1="21" x2="20" y2="16"></line><line x1="20" y1="12" x2="20" y2="3"></line><line x1="1" y1="14" x2="7" y2="14"></line><line x1="9" y1="8" x2="15" y2="8"></line><line x1="17" y1="16" x2="23" y2="16"></line></svg>
                 </button>
                 {activeFilterCount > 0 && <span className="pill blue" style={{ position: 'absolute', top: -8, right: -8, padding: '2px 6px', fontSize: 10 }}>{activeFilterCount}</span>}
             </div>
             <button className="iconbtn" onClick={fetchComputers} title="Refresh Data">
                 <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16"><path d="M23 4v6h-6"></path><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path></svg>
             </button>
        </div>
      </div>

      <div className="section overflow-visible" style={{ marginTop: '20px' }}>
          
          {activeFilterCount > 0 && (
              <div className="p-0-20-20" style={{ paddingTop: '20px' }}>
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

          <div className="section-head" style={{ paddingBottom: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: activeFilterCount > 0 ? 0 : '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span className="title">Computers</span>
              <span className="pill soft">Total: {sortedData.length}</span>
            </div>
            <div style={{ display: 'flex', gap: '12px' }}>
                <div className="dropdown" ref={colRef}>
                    <button className="btn outline sec small" onClick={() => { setShowColDrop(!showColDrop); setShowExpDrop(false); }}>
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16"><line x1="8" y1="6" x2="21" y2="6"></line><line x1="8" y1="12" x2="21" y2="12"></line><line x1="8" y1="18" x2="21" y2="18"></line><line x1="3" y1="6" x2="3.01" y2="6"></line><line x1="3" y1="12" x2="3.01" y2="12"></line><line x1="3" y1="18" x2="3.01" y2="18"></line></svg>
                        &nbsp; Columns
                    </button>
                    {showColDrop && (
                        <div className="dropdown-menu show" style={{ minWidth: "220px", padding: "12px", right: 0 }}>
                            <div style={{ display: "flex", flexDirection: "column", gap: "4px", maxHeight: '300px', overflowY: 'auto' }}>
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
            {loading ? (
               <div className="sub empty-state" style={{ padding: '40px', textAlign: 'center' }}>Fetching properties from BigFix...</div>
            ) : paginatedData.length === 0 ? (
               <div className="sub empty-state" style={{ padding: '40px', textAlign: 'center' }}>No computers found matching your criteria.</div>
            ) : (
              <table>
                <thead className="kpi-th-sticky">
                  <tr>
                    {cols.map(c => c.show && (
                        <th key={c.id} className="cursor-pointer" onClick={() => handleSort(c.id)}>
                            {c.label}{getSortIcon(c.id)}
                        </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {paginatedData.map((row, i) => (
                    <tr key={i}>
                      {cols.map(c => c.show && (
                          <td key={c.id}>
                              {c.id === 'name' ? <strong>{row[c.id]}</strong> : row[c.id]}
                          </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
          <Paginator total={sortedData.length} rpp={rowsPerPage} setRpp={setRowsPerPage} page={currentPage} setPage={setCurrentPage} edgeToEdge={false} />
        </div>
        <FilterDrawer isOpen={drawerOpen} onClose={() => setDrawerOpen(false)} filters={filters} setFilters={setFilters} globalLogic={globalLogic} setGlobalLogic={setGlobalLogic} propertyOptions={propertyOptions} />
    </div>
  );
}