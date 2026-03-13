// src/components/KpiDetails.jsx
import React, { useState, useEffect, useMemo, useRef } from "react";
import FilterDrawer from "./FilterDrawer";

const API_BASE = window.env?.VITE_API_BASE || "http://localhost:5174";

// ... [Existing imports and helper functions, NoDataSVG, etc. exactly the same] ...
function getHeaders() {
  return {
    "Content-Type": "application/json",
    "Accept": "application/json",
    "x-user-role": sessionStorage.getItem("user_role") || "Admin",
  };
}

async function getJson(url, signal) {
  const headers = getHeaders();
  delete headers["Content-Type"]; 
  const r = await fetch(url, { headers, cache: "no-store", signal });
  const t = await r.text();
  if (!r.ok) throw new Error(`HTTP ${r.status}: ${t.slice(0, 400)}`);
  try { return JSON.parse(t); } catch { throw new Error(`Unexpected: ${t.slice(0, 400)}`); }
}

const fmtTime = (s) => {
  if (!s || s === "N/A") return "—";
  const m = s.match(/\b(\d{2}:\d{2}:\d{2})\b/);
  return m ? m[1] : s;
};

function classify(raw) {
  const s = String(raw || "").trim();
  if (!s) return "Not Reported";
  const L = s.toLowerCase();
  if (/^fixed$/i.test(s) || /^completed$/i.test(s) || /executed successfully/i.test(L)) return "Success";
  if (/^pending restart$/i.test(s) || /waiting for restart/i.test(L)) return "Pending Restart";
  if (/^running$/i.test(s) || /is currently running/i.test(L)) return "Running";
  if (/^failed$/i.test(s) || /\baction failed\b/i.test(L)) return "Failed";
  if (/success/i.test(L)) return "Success";
  if (/fail|error/i.test(L)) return "Failed";
  return s; 
}

const NoDataSVG = () => (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', width: '100%', padding: '60px 0' }}>
      <div style={{ fontSize: '18px', fontWeight: 600, color: 'var(--text)', fontFamily: '"HCL BOOMER", sans-serif' }}>No Data Available</div>
    </div>
);

export default function KpiDetails({ context, onBack }) {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState("");
  const [error, setError] = useState("");
  
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [sortConfig, setSortConfig] = useState({ key: null, dir: "asc" });
  const [showColDrop, setShowColDrop] = useState(false);
  const [showExpDrop, setShowExpDrop] = useState(false);

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [globalLogic, setGlobalLogic] = useState("AND");
  const [filters, setFilters] = useState([]);

  const colRef = useRef(null);
  const expRef = useRef(null);

  const [cols, setCols] = useState([
    { id: 'server', label: 'Server Name', show: true },
    { id: 'status', label: 'Status', show: true },
    { id: 'issue', label: 'Issue', show: true },
    { id: 'serviceStatus', label: 'Service Status', show: true },
    { id: 'lastReportTime', label: 'Last Report', show: true },
    { id: 'ip', label: 'IP Address', show: true },
    { id: 'uptime', label: 'UpTime', show: true },
    { id: 'besRelay', label: 'BES Relay', show: true },
    { id: 'patch', label: 'Patch Name', show: true },
    { id: 'start', label: 'Start', show: true },
    { id: 'end', label: 'End', show: true },
    { id: 'issuer', label: 'Issuer', show: true }
  ]);

  useEffect(() => {
    const handleOutside = (e) => {
      if (colRef.current && !colRef.current.contains(e.target)) setShowColDrop(false);
      if (expRef.current && !expRef.current.contains(e.target)) setShowExpDrop(false);
    };
    document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, []);

  const type = typeof context === 'string' ? context : (context?.type || 'health');
  const actionId = context && typeof context === 'object' ? context.id : null;

  const titleMap = {
    'success': 'Success Rate Details',
    'health': 'Critical Health Failures',
    'reboot': 'Reboot Pending Servers',
    'sandbox': `Action Results ${actionId ? `(#${actionId})` : ''}`
  };

  const propertyOptionsMap = {
    'health': [
      { value: "server", label: "Server Name" }, { value: "os", label: "OS" }, { value: "serviceStatus", label: "Service Status" }
    ],
    'reboot': [
      { value: "server", label: "Server Name" }, { value: "ip", label: "IP Address" }, { value: "besRelay", label: "BES Relay" }
    ],
    'success': [
      { value: "server", label: "Server Name" }, { value: "status", label: "Status" }
    ],
    'sandbox': [
      { value: "server", label: "Server Name" }, { value: "patch", label: "Patch Name" }, { value: "status", label: "Status" }, { value: "issuer", label: "Issuer" }
    ]
  };

  const propertyOptions = propertyOptionsMap[type] || propertyOptionsMap['health'];

  const fetchData = async (signal) => {
    try {
      setLoading(true); setError("");
      if (!context) { setData([]); return; }
      let url = "";
      if (type === 'health') url = `${API_BASE}/api/health/critical`;
      else if (type === 'reboot') url = `${API_BASE}/api/health/reboot-pending`;
      else if (type === 'success' || type === 'sandbox') {
        let targetId = actionId;
        if (!targetId) { const last = await getJson(`${API_BASE}/api/actions/last`, signal); targetId = last?.actionId; }
        if (!targetId) { setData([]); return; }
        url = `${API_BASE}/api/actions/${targetId}/results`;
      }
      const res = await getJson(url, signal);
      let rows = Array.isArray(res?.rows) ? res.rows : [];
      if (type === 'success') rows = rows.filter((r) => /success/i.test(r?.status || ""));
      setData(rows);
      setLastUpdated(new Date().toLocaleString());
    } catch (err) {
      if (err.name !== "AbortError") setError(err.message);
    } finally { setLoading(false); }
  };

  useEffect(() => { const ab = new AbortController(); fetchData(ab.signal); return () => ab.abort(); }, [type, actionId, context]);

  const activeFilterCount = filters.reduce((acc, b) => acc + b.conds.filter(c => c.value).length, 0);

  const applyFilters = (row) => {
    if (!filters.length) return true;
    let globalMatch = globalLogic === "OR" ? false : true;
    for (let b of filters) {
      let blockMatch = true; let validConds = 0;
      for (let c of b.conds) {
        if (!c.value) continue;
        validConds++;
        const search = String(c.value).toLowerCase();
        let field = String(row[c.column] || "").toLowerCase();
        if (c.column === "status") field = classify(field).toLowerCase();
        if (c.operator === "contains") blockMatch = blockMatch && field.includes(search);
        else if (c.operator === "=") blockMatch = blockMatch && field === search;
        else if (c.operator === "!=") blockMatch = blockMatch && field !== search;
      }
      if (validConds > 0) globalMatch = globalLogic === "OR" ? (globalMatch || blockMatch) : (globalMatch && blockMatch);
    }
    return globalMatch;
  };

  const filtered = useMemo(() => data.filter(applyFilters), [data, filters, globalLogic]);

  const sorted = useMemo(() => {
    if (!sortConfig.key) return filtered;
    return [...filtered].sort((a, b) => {
      let valA = String(a[sortConfig.key] || "").toLowerCase();
      let valB = String(b[sortConfig.key] || "").toLowerCase();
      if (sortConfig.key === 'status') { valA = classify(valA); valB = classify(valB); }
      if (valA < valB) return sortConfig.dir === "asc" ? -1 : 1;
      if (valA > valB) return sortConfig.dir === "asc" ? 1 : -1;
      return 0;
    });
  }, [filtered, sortConfig]);

  const totalPages = Math.ceil(sorted.length / pageSize);
  const paginated = useMemo(() => sorted.slice((page - 1) * pageSize, page * pageSize), [sorted, page, pageSize]);

  const handleSort = (key) => setSortConfig(c => ({ key, dir: c.key === key && c.dir === "asc" ? "desc" : "asc" }));
  const getSortIcon = (key) => { if (sortConfig.key !== key) return <span className="muted-text ml-6">↕</span>; return <span className="ml-6">{sortConfig.dir === "asc" ? "↑" : "↓"}</span>; };

  const handleExport = (fmt, scope) => { setShowExpDrop(false); };

  return (
    <div className="card reveal" style={{ minHeight: '100%', display: 'flex', flexDirection: 'column', padding: 0, overflow: 'visible', boxShadow: 'none', border: 'none', background: 'transparent' }}>
      
      {/* EXACT STICKY HEADER AS RISK MODULE FOR FULL WIDTH */}
      <div style={{ position: 'sticky', top: '-24px', background: 'var(--panel)', zIndex: 20, padding: '24px 32px 16px', borderBottom: '1px solid var(--border)', margin: '-24px -32px 24px -32px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: "22px", fontWeight: 600, color: "var(--text)" }}>{titleMap[type] || 'KPI Details'}</h2>
          <div className="text-13 muted-text" style={{ marginTop: '4px' }}>Updated: {lastUpdated || "—"}</div>
        </div>
        <div style={{ display: 'flex', gap: '12px' }}>
          <div style={{ position: 'relative' }}>
            <button className="iconbtn" onClick={() => setDrawerOpen(true)}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16"><line x1="4" y1="21" x2="4" y2="14"></line><line x1="4" y1="10" x2="4" y2="3"></line><line x1="12" y1="21" x2="12" y2="12"></line><line x1="12" y1="8" x2="12" y2="3"></line><line x1="20" y1="21" x2="20" y2="16"></line><line x1="20" y1="12" x2="20" y2="3"></line><line x1="1" y1="14" x2="7" y2="14"></line><line x1="9" y1="8" x2="15" y2="8"></line><line x1="17" y1="16" x2="23" y2="16"></line></svg>
            </button>
            {activeFilterCount > 0 && <span className="pill blue" style={{ position: 'absolute', top: -8, right: -8, padding: '2px 6px', fontSize: 10 }}>{activeFilterCount}</span>}
          </div>
          <button className="iconbtn" onClick={() => fetchData(null)} title="Refresh Data">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16"><path d="M23 4v6h-6"></path><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path></svg>
          </button>
        </div>
      </div>

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
          
        {activeFilterCount > 0 && (
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
        )}

        <div className="grid-toolbar" style={{ margin: '0 0 16px 0', padding: 0 }}>
          
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
                            <div style={{ fontSize: "11px", fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", marginBottom: "12px", letterSpacing: '0.05em' }}>Format</div>
                            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "8px", marginBottom: "20px" }}>
                               {['CSV', 'PDF', 'HTML', 'TXT', 'JSON', 'XML'].map(fmt => (
                                 <button key={fmt} className="btn outline small" style={{ fontSize: '12px', height: '32px', padding: 0 }} onClick={() => handleExport(fmt, 'current')}>{fmt}</button>
                               ))}
                            </div>
                            <div style={{ height: '1px', background: 'var(--border)', marginBottom: '16px' }}></div>
                            <div style={{ fontSize: "11px", fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", marginBottom: "12px", letterSpacing: '0.05em' }}>Scope</div>
                            <button className="item" onClick={() => handleExport('CSV', 'page')}>Current Page</button>
                            <button className="item" onClick={() => handleExport('CSV', 'filtered')}>Filtered Data</button>
                            <button className="item" onClick={() => handleExport('CSV', 'all')}>All Data</button>
                        </div>
                    )}
                </div>
            </div>
        </div>

        <div className="tableWrap border-top" style={{flex: 1, overflow: 'auto', margin: '0 -32px', width: 'calc(100% + 64px)', borderLeft: 'none', borderRight: 'none', borderRadius: 0 }}>
            {loading ? <div style={{ padding: "40px", textAlign: "center" }}>Loading...</div> : data.length === 0 ? <NoDataSVG /> : (
                <table>
                    <thead className="kpi-th-sticky">
                        <tr>
                            {cols.filter(c => c.show && (
                                (type === 'health' && ['server', 'issue', 'serviceStatus', 'lastReportTime'].includes(c.id)) ||
                                (type === 'reboot' && ['server', 'ip', 'uptime', 'besRelay'].includes(c.id)) ||
                                (type === 'success' && ['server', 'status'].includes(c.id)) ||
                                (type === 'sandbox' && ['server', 'patch', 'start', 'end', 'status', 'issuer'].includes(c.id))
                            )).map(c => (
                                <th key={c.id} className="cursor-pointer" onClick={() => handleSort(c.id)}>
                                    {c.label} {getSortIcon(c.id)}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {paginated.length === 0 ? (
                            <tr><td colSpan={6} style={{ padding: 0 }}><NoDataSVG /></td></tr>
                        ) : (
                            paginated.map((r, i) => (
                                <tr key={i}>
                                    {cols.filter(c => c.show && (
                                        (type === 'health' && ['server', 'issue', 'serviceStatus', 'lastReportTime'].includes(c.id)) ||
                                        (type === 'reboot' && ['server', 'ip', 'uptime', 'besRelay'].includes(c.id)) ||
                                        (type === 'success' && ['server', 'status'].includes(c.id)) ||
                                        (type === 'sandbox' && ['server', 'patch', 'start', 'end', 'status', 'issuer'].includes(c.id))
                                    )).map(c => {
                                        if (c.id === 'issue') return <td key={c.id}>{(r.issues || []).map((iss, idx) => (<span key={idx} className="pill red mr-10 text-11">{iss}</span>))}</td>;
                                        if (c.id === 'status') return <td key={c.id}><span className={`pill ${classify(r.status) === 'Success' ? 'green' : 'red'}`}>{classify(r.status)}</span></td>;
                                        if (c.id === 'start' || c.id === 'end') return <td key={c.id}>{fmtTime(r[c.id])}</td>;
                                        return <td key={c.id}>{r[c.id] || "—"}</td>;
                                    })}
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            )}
        </div>

        <div className="pagination" style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", padding: "16px 32px", gap: "24px", margin: "0 -32px", width: "calc(100% + 64px)", borderBottom: '1px solid var(--border)'}}>
            <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                <span className="pager-info" style={{ fontSize: "13px", color: "var(--muted)" }}>Rows per page:</span>
                <select className="control" style={{ width: "70px", height: "32px", padding: '0 8px' }} value={pageSize} onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1); }}>
                    <option value={10}>10</option><option value={20}>20</option><option value={50}>50</option>
                </select>
            </div>
            <span className="pager-info" style={{ fontSize: "13px", color: "var(--muted)" }}>
                {sorted.length > 0 ? (page - 1) * pageSize + 1 : 0}-{Math.min(page * pageSize, sorted.length)} of {sorted.length}
            </span>
            <div className="pager-btns" style={{ display: "flex", gap: "4px" }}>
                <button className="pager-btn" disabled={page === 1} onClick={() => setPage(p => p - 1)}>&lt;</button>
                <button className={`pager-btn ${page === 1 ? 'active' : ''}`} onClick={() => setPage(1)}>1</button>
                {totalPages > 1 && <button className={`pager-btn ${page === 2 ? 'active' : ''}`} onClick={() => setPage(2)}>2</button>}
                {totalPages > 2 && <span style={{ padding: '0 4px', color: 'var(--muted)' }}>..</span>}
                {totalPages > 2 && page > 2 && page < totalPages && <button className="pager-btn active">{page}</button>}
                {totalPages > 2 && <button className={`pager-btn ${page === totalPages ? 'active' : ''}`} onClick={() => setPage(totalPages)}>{totalPages}</button>}
                <button className="pager-btn" disabled={page === totalPages || totalPages === 0} onClick={() => setPage(p => p + 1)}>&gt;</button>
            </div>
        </div>

      </div>

      <FilterDrawer isOpen={drawerOpen} onClose={() => setDrawerOpen(false)} filters={filters} setFilters={setFilters} globalLogic={globalLogic} setGlobalLogic={setGlobalLogic} propertyOptions={propertyOptions} />
    </div>
  );
}