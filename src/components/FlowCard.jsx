// src/components/FlowCard.jsx
import { useEffect, useState, useMemo } from "react";
import FilterDrawer from "./FilterDrawer";

export const Stage = {
  HISTORY: "HISTORY",
  CONFIG: "CONFIG",
  SANDBOX: "SANDBOX",
  PILOT: "PILOT",
  PRODUCTION: "PRODUCTION",
  FinalResult: "FINAL RESULT",
};

const API = window.env.VITE_API_BASE;

async function getJson(url, signal) {
  const r = await fetch(url, { headers: { Accept: "application/json" }, cache: "no-store", signal });
  const t = await r.text();
  if (!r.ok) throw new Error(`HTTP ${r.status}: ${t.slice(0, 400)}`);
  return JSON.parse(t);
}

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
  if (/wait|pending/i.test(L)) return "Waiting";
  return s; 
}

export default function DeploymentHistory() {
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [items, setItems] = useState([]); 

  const [detailAction, setDetailAction] = useState(null); 
  const [detailResults, setDetailResults] = useState({ loading: false, rows: [], error: null });

  // Filter Drawer State
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [globalLogic, setGlobalLogic] = useState("AND");
  const [filters, setFilters] = useState([]);
  const propertyOptions = [
    { value: "name", label: "Action Name" },
    { value: "id", label: "ID" },
    { value: "state", label: "State" },
    { value: "issuer", label: "Issuer" }
  ];

  useEffect(() => {
    const fetchDeployments = async () => {
      setLoading(true);
      setErr("");
      try {
        const r = await fetch(`${API}/api/deployments/bps`, { headers: { Accept: "application/json" } });
        const t = await r.text();
        if (!r.ok) throw new Error(t);
        const j = JSON.parse(t);
        setItems(Array.isArray(j?.items) ? j.items : []);
      } catch (e) {
        setErr(e?.message || String(e));
      } finally {
        setLoading(false);
      }
    };
    fetchDeployments();
  }, []);

  const openActionDetails = async (action) => {
    if (!action || !action.id) return;
    setDetailAction(action); 
    setDetailResults({ loading: true, rows: [], error: null });
    try {
      const res = await getJson(`${API}/api/actions/${action.id}/results`);
      setDetailResults({
        loading: false,
        rows: Array.isArray(res?.rows) ? res.rows : [],
        error: null,
      });
    } catch (e) {
      setDetailResults({
        loading: false,
        rows: [],
        error: e.message || "Failed to load action results.",
      });
    }
  };

  const applyFilters = (item) => {
    if (!filters.length) return true;
    let globalMatch = globalLogic === "OR" ? false : true;
    let validBlocks = 0;

    for (let b of filters) {
      let blockMatch = true;
      let validConds = 0;

      for (let c of b.conds) {
        if (!c.value) continue;
        validConds++;
        let condition = true;
        const search = String(c.value).toLowerCase();
        const field = String(item[c.column] || "").toLowerCase();

        if (c.operator === "contains") condition = field.includes(search);
        else if (c.operator === "=") condition = field === search;
        else if (c.operator === "!=") condition = field !== search;
        
        blockMatch = blockMatch && condition;
      }
      if (validConds > 0) {
        validBlocks++;
        globalMatch = globalLogic === "OR" ? (globalMatch || blockMatch) : (globalMatch && blockMatch);
      }
    }
    return validBlocks === 0 ? true : globalMatch;
  };

  const filteredItems = items.filter(applyFilters);
  const activeFilterCount = filters.reduce((acc, b) => acc + b.conds.filter(c => c.value).length, 0);

  if (detailAction) {
     return <ActionResultsView action={detailAction} loading={detailResults.loading} rows={detailResults.rows} error={detailResults.error} onBack={() => setDetailAction(null)} />
  }

  return (
    <>
      <section className="card reveal" style={{ padding: 0, overflow: 'visible', boxShadow: 'none', border: 'none', background: 'transparent' }}>
        
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
            <div>
                <h2 style={{ margin: 0, fontSize: "24px", fontWeight: 500, color: "var(--text)" }}>Deployment History</h2>
                <div className="sub mt-4" style={{ fontSize: "12px", color: "var(--muted)" }}>History of all BigFix Patch Setu actions executed.</div>
            </div>
        </div>

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

        <div className="grid-toolbar" style={{ margin: '16px 0', padding: 0 }}>
          <div className="grid-toolbar-left" style={{ fontWeight: 600, color: 'var(--text)' }}>
            Showing {filteredItems.length} Deployments
          </div>
          
          <div className="grid-toolbar-right" style={{ display: 'flex', gap: '12px' }}>
            <button className="iconbtn" onClick={() => setDrawerOpen(true)} title="Filter Data">
               <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="18" height="18"><line x1="4" y1="21" x2="4" y2="14"></line><line x1="4" y1="10" x2="4" y2="3"></line><line x1="12" y1="21" x2="12" y2="12"></line><line x1="12" y1="8" x2="12" y2="3"></line><line x1="20" y1="21" x2="20" y2="16"></line><line x1="20" y1="12" x2="20" y2="3"></line><line x1="1" y1="14" x2="7" y2="14"></line><line x1="9" y1="8" x2="15" y2="8"></line><line x1="17" y1="16" x2="23" y2="16"></line></svg>
            </button>
            <button className="iconbtn" onClick={() => { setFilters([]); window.location.reload(); }} title="Refresh">
               <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="18" height="18"><polyline points="23 4 23 10 17 10"></polyline><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path></svg>
            </button>
          </div>
        </div>

        {loading && <div className="app-loading-content">Loading history…</div>}
        {err && !loading && <div className="banner error">{err}</div>}
        
        {!loading && !err && (
          <div className="tableWrap" style={{ maxHeight: 'calc(100vh - 260px)' }}>
            <table>
              <thead>
                <tr>
                  <th style={{ width: "40%" }}>Action Name</th>
                  <th>ID</th>
                  <th>State</th>
                  <th>Issued</th>
                  <th>Stopped</th>
                  <th>Issuer</th>
                </tr>
              </thead>
              <tbody>
                {filteredItems.length === 0 && (
                  <tr><td colSpan="6" style={{ textAlign: "center", padding: "40px", color: "var(--muted)" }}>No actions found.</td></tr>
                )}
                {filteredItems.map((it) => (
                  <tr
                    key={it.id}
                    onClick={() => openActionDetails(it)}
                    tabIndex={0}
                    style={{ cursor: 'pointer' }}
                    title={`Click to view results for Action ${it.id}`}
                  >
                    <td>
                      <button className="name-link" onClick={(e) => { e.stopPropagation(); openActionDetails(it); }}>
                        {it.name}
                      </button>
                    </td>
                    <td style={{ fontFamily: 'monospace', color: 'var(--muted)' }}>{it.id}</td>
                    <td>
                      <span className={`pill ${it.state.toLowerCase() === 'open' ? 'green' : 'amber'}`}>
                        {it.state}
                      </span>
                    </td>
                    <td>{it.issued}</td>
                    <td>{it.stopped}</td>
                    <td>{it.issuer}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <FilterDrawer 
        isOpen={drawerOpen} 
        onClose={() => setDrawerOpen(false)} 
        filters={filters} 
        setFilters={setFilters} 
        globalLogic={globalLogic} 
        setGlobalLogic={setGlobalLogic} 
        propertyOptions={propertyOptions} 
      />
    </>
  );
}

function ActionResultsView({ action, loading, rows, error, onBack }) {
    const [sortConfig, setSortConfig] = useState({ key: "status", dir: "asc" });
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(10);
    const title = action?.name || "Action Details";

    const [drawerOpen, setDrawerOpen] = useState(false);
    const [globalLogic, setGlobalLogic] = useState("AND");
    const [filters, setFilters] = useState([]);
    const propertyOptions = [
      { value: "server", label: "Server Name" },
      { value: "status", label: "Status" }
    ];

    useEffect(() => setPage(1), [filters, pageSize, rows]);

    const applyFilters = (row) => {
      if (!filters.length) return true;
      let globalMatch = globalLogic === "OR" ? false : true;
      let validBlocks = 0;

      for (let b of filters) {
        let blockMatch = true;
        let validConds = 0;

        for (let c of b.conds) {
          if (!c.value) continue;
          validConds++;
          let condition = true;
          const search = String(c.value).toLowerCase();
          const field = String(row[c.column] || "").toLowerCase();

          if (c.operator === "contains") condition = field.includes(search);
          else if (c.operator === "=") condition = field === search;
          else if (c.operator === "!=") condition = field !== search;
          
          blockMatch = blockMatch && condition;
        }
        if (validConds > 0) {
          validBlocks++;
          globalMatch = globalLogic === "OR" ? (globalMatch || blockMatch) : (globalMatch && blockMatch);
        }
      }
      return validBlocks === 0 ? true : globalMatch;
    };

    const filtered = useMemo(() => rows.filter(applyFilters), [rows, filters, globalLogic]);

    const sorted = useMemo(() => {
        if (!sortConfig.key) return filtered;
        return [...filtered].sort((a, b) => {
            const valA = sortConfig.key === 'status' ? classify(a.status).toLowerCase() : String(a[sortConfig.key] || "").toLowerCase();
            const valB = sortConfig.key === 'status' ? classify(b.status).toLowerCase() : String(b[sortConfig.key] || "").toLowerCase();
            if (valA < valB) return sortConfig.dir === "asc" ? -1 : 1;
            if (valA > valB) return sortConfig.dir === "asc" ? 1 : -1;
            return 0;
        });
    }, [filtered, sortConfig]);

    const totalPages = Math.ceil(sorted.length / pageSize);
    const paginated = useMemo(() => {
        const start = (page - 1) * pageSize;
        return sorted.slice(start, start + pageSize);
    }, [sorted, page, pageSize]);

    const handleSort = (key) => setSortConfig(c => ({ key, dir: c.key === key && c.dir === "asc" ? "desc" : "asc" }));

    const getSortIndicator = (key) => {
        if (sortConfig.key === key) {
            return sortConfig.dir === 'asc' ? ' ↑' : ' ↓';
        }
        return '';
    };

    const getBadgeClass = (status) => {
      const s = classify(status);
      if (s === 'Success') return 'pill green';
      if (s === 'Failed') return 'pill red';
      if (s === 'Running') return 'pill blue';
      return 'pill amber';
    };
    
    const activeFilterCount = filters.reduce((acc, b) => acc + b.conds.filter(c => c.value).length, 0);

    return (
        <section className="card reveal" style={{ padding: 0, overflow: 'visible', boxShadow: 'none', border: 'none', background: 'transparent' }}>
            
            <div style={{ display: "flex", alignItems: "center", gap: "16px", marginBottom: "20px" }}>
                <button className="iconbtn" onClick={onBack} title="Back to History" style={{ background: "var(--panel)" }}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 18l-6-6 6-6"/></svg>
                </button>
                <div>
                    <h2 style={{ margin: 0, fontSize: "20px", fontWeight: 500, color: "var(--text)" }}>{title}</h2>
                    <div className="sub mt-4" style={{ fontSize: "12px", color: "var(--muted)" }}>Action Execution Details</div>
                </div>
            </div>

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

            <div className="grid-toolbar" style={{ margin: '16px 0', padding: 0 }}>
              <div className="grid-toolbar-left" style={{ fontWeight: 600, color: 'var(--text)' }}>
                Showing {filtered.length} Servers
              </div>
              <div className="grid-toolbar-right" style={{ display: 'flex', gap: '12px' }}>
                <button className="iconbtn" onClick={() => setDrawerOpen(true)} title="Filter Data">
                   <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="18" height="18"><line x1="4" y1="21" x2="4" y2="14"></line><line x1="4" y1="10" x2="4" y2="3"></line><line x1="12" y1="21" x2="12" y2="12"></line><line x1="12" y1="8" x2="12" y2="3"></line><line x1="20" y1="21" x2="20" y2="16"></line><line x1="20" y1="12" x2="20" y2="3"></line><line x1="1" y1="14" x2="7" y2="14"></line><line x1="9" y1="8" x2="15" y2="8"></line><line x1="17" y1="16" x2="23" y2="16"></line></svg>
                </button>
              </div>
            </div>

            <div className="tableWrap" style={{ flex: 1 }}>
                {loading ? <div style={{ padding: "40px", textAlign: "center", color: "var(--muted)" }}>Loading action results...</div> : error ? <div style={{ padding: "40px", textAlign: "center", color: "var(--danger)" }}>{error}</div> : (
                    <table>
                        <thead>
                            <tr>
                                <th style={{ cursor: "pointer", color: sortConfig.key === 'server' ? 'var(--primary)' : 'var(--text)' }} onClick={() => handleSort('server')}>
                                  Server {getSortIndicator('server')}
                                </th>
                                <th style={{ cursor: "pointer", color: sortConfig.key === 'status' ? 'var(--primary)' : 'var(--text)' }} onClick={() => handleSort('status')}>
                                  Status {getSortIndicator('status')}
                                </th>
                            </tr>
                        </thead>
                        <tbody>
                            {paginated.length === 0 && (
                              <tr><td colSpan="2" style={{ textAlign: "center", padding: "40px", color: "var(--muted)" }}>No results found.</td></tr>
                            )}
                            {paginated.map((r, i) => (
                                <tr key={i}>
                                    <td style={{ fontWeight: 500 }}>{r.server}</td>
                                    <td>
                                      <span className={getBadgeClass(r.status)}>
                                        {classify(r.status)}
                                      </span>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>

            <div className="pagination">
                <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
                    <span className="pager-info">Rows per page:</span>
                    <select className="control" style={{ width: "75px", padding: "6px 10px", height: "32px", minWidth: 0 }} value={pageSize} onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1); }}>
                        <option value={10}>10</option>
                        <option value={20}>20</option>
                        <option value={50}>50</option>
                    </select>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "20px" }}>
                    <div className="pager-info">
                      {sorted.length > 0 ? (page - 1) * pageSize + 1 : 0}-{Math.min(page * pageSize, sorted.length)} of {sorted.length}
                    </div>
                    <div className="pager-btns">
                        <button className="pager-btn" disabled={page === 1} onClick={() => setPage(p => p - 1)}>
                          &lt; Prev
                        </button>
                        <button className="pager-btn" disabled={page >= totalPages || totalPages === 0} onClick={() => setPage(p => p + 1)}>
                          Next &gt;
                        </button>
                    </div>
                </div>
            </div>

            <FilterDrawer 
              isOpen={drawerOpen} 
              onClose={() => setDrawerOpen(false)} 
              filters={filters} 
              setFilters={setFilters} 
              globalLogic={globalLogic} 
              setGlobalLogic={setGlobalLogic} 
              propertyOptions={propertyOptions} 
            />
        </section>
    );
}