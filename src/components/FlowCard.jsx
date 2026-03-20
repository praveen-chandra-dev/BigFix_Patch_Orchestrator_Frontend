// src/components/FlowCard.jsx
import { useEffect, useState, useMemo, useRef } from "react";
import FilterDrawer from "./FilterDrawer";

export const Stage = {
  HISTORY: "HISTORY", CONFIG: "CONFIG", SANDBOX: "SANDBOX", PILOT: "PILOT", PRODUCTION: "PRODUCTION", FinalResult: "FINAL RESULT",
};
const API = window.env.VITE_API_BASE;

async function getJson(url, signal) {
  const r = await fetch(url, { headers: { Accept: "application/json" }, cache: "no-store", signal });
  const t = await r.text();
  if (!r.ok) throw new Error(`HTTP ${r.status}: ${t.slice(0, 400)}`);
  return JSON.parse(t);
}

function classify(raw) {
  const s = String(raw || "").trim(); if (!s) return "Not Reported";
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

function evaluateCondition(f, operator, s, colId) {
    if (!s) return true;
    const dateFields = ['date', 'month', 'CreatedAt', 'lastReportTime', 'issued', 'stopped', 'start', 'end', 'createdAt'];
    if (dateFields.includes(colId) || (!isNaN(Date.parse(f)) && isNaN(f))) {
        const dateF = new Date(f).getTime(); const dateS = new Date(s).getTime();
        if (!isNaN(dateF) && !isNaN(dateS)) {
            if (operator === "=") return new Date(f).toDateString() === new Date(s).toDateString();
            if (operator === "!=") return new Date(f).toDateString() !== new Date(s).toDateString();
            if (operator === ">") return dateF > dateS;
            if (operator === "<") return dateF < dateS;
            if (operator === ">=") return dateF >= dateS;
            if (operator === "<=") return dateF <= dateS;
        }
    }
    const numF = Number(f); const numS = Number(s);
    if (!isNaN(numF) && !isNaN(numS) && String(s).trim() !== '') {
        if (operator === "=") return numF === numS;
        if (operator === "!=") return numF !== numS;
        if (operator === ">") return numF > numS;
        if (operator === "<") return numF < numS;
        if (operator === ">=") return numF >= numS;
        if (operator === "<=") return numF <= numS;
    }
    let strF = String(f).toLowerCase(); let strS = String(s).toLowerCase();
    if (operator === "contains") return strF.includes(strS);
    if (operator === "=") return strF === strS;
    if (operator === "!=") return strF !== strS;
    if (operator === ">") return strF > strS;
    if (operator === "<") return strF < strS;
    if (operator === ">=") return strF >= strS;
    if (operator === "<=") return strF <= strS;
    return true;
}

function performExport(dataToExport, columns, format, filenamePrefix, getVal = (row, colId) => row[colId]) {
    const visibleCols = columns.filter(c => c.show);
    const headers = visibleCols.map(c => c.label);
    const triggerDownload = (content, type, ext) => {
        const blob = new Blob([content], { type });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a"); a.href = url; a.download = `${filenamePrefix}.${ext}`; a.click(); URL.revokeObjectURL(url);
    };
    if (format === 'JSON') {
        const json = dataToExport.map(row => { let obj = {}; visibleCols.forEach(c => obj[c.label] = getVal(row, c.id)); return obj; });
        triggerDownload(JSON.stringify(json, null, 2), "application/json", "json");
    } else if (format === 'XML') {
        let xml = '<?xml version="1.0" encoding="UTF-8"?><rows>\n';
        dataToExport.forEach(row => {
            xml += '  <row>\n';
            visibleCols.forEach(c => { const tag = c.label.replace(/[^a-zA-Z0-9]/g, '_'); xml += `    <${tag}>${getVal(row, c.id) || ''}</${tag}>\n`; });
            xml += '  </row>\n';
        });
        xml += '</rows>'; triggerDownload(xml, "application/xml", "xml");
    } else if (format === 'HTML') {
        let html = '<table border="1"><thead><tr>'; headers.forEach(h => html += `<th>${h}</th>`); html += '</tr></thead><tbody>';
        dataToExport.forEach(row => { html += '<tr>'; visibleCols.forEach(c => html += `<td>${getVal(row, c.id) || ''}</td>`); html += '</tr>'; });
        html += '</tbody></table>'; triggerDownload(html, "text/html", "html");
    } else if (format === 'TXT') {
        const txt = [headers.join('\t'), ...dataToExport.map(r => visibleCols.map(c => getVal(r, c.id) || '').join('\t'))].join('\n');
        triggerDownload(txt, "text/plain", "txt");
    } else if (format === 'PDF') {
        const loadScript = (src) => new Promise(resolve => {
            if (document.querySelector(`script[src="${src}"]`)) return resolve();
            const script = document.createElement('script'); script.src = src; script.onload = resolve; document.body.appendChild(script);
        });
        Promise.all([
            loadScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js'),
            loadScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.5.31/jspdf.plugin.autotable.min.js')
        ]).then(() => {
            const { jsPDF } = window.jspdf; const doc = new jsPDF();
            doc.text(`Export: ${filenamePrefix}`, 14, 15);
            const body = dataToExport.map(row => visibleCols.map(c => getVal(row, c.id) || ''));
            doc.autoTable({ head: [headers], body: body, startY: 20 }); doc.save(`${filenamePrefix}.pdf`);
        });
    } else { 
        const csv = [headers.join(','), ...dataToExport.map(r => visibleCols.map(c => `"${String(getVal(r, c.id) || '').replace(/"/g, '""')}"`).join(','))].join('\n');
        triggerDownload(csv, "text/csv", "csv");
    }
}

// FIXED: FancySelect to prevent clipping and empty rendering
const FancySelect = ({ label, options = [], value, onChange, disabled, width = '100%', menuPlacement = 'bottom' }) => {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef(null);

  useEffect(() => {
    function handleClickOutside(event) { 
      if (wrapperRef.current && !wrapperRef.current.contains(event.target)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside); 
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const selectedOption = options.find(o => (o.value !== undefined ? o.value : o) === value);
  const displayText = selectedOption ? (selectedOption.label !== undefined ? selectedOption.label : selectedOption) : value;

  return (
    <div className="field flex-1 m-0" style={{ width }}>
      {label && <span className="label">{label}</span>}
      <div className={`fx-wrap flex-1 ${open ? "fx-open" : ""} ${disabled ? "disabled" : ""}`} ref={wrapperRef} style={{ position: 'relative' }}>
        <button type="button" className="fx-trigger" onClick={() => !disabled && setOpen(!open)} style={{ height: '32px', minHeight: '32px', padding: '0 10px', background: disabled ? 'var(--bg)' : 'var(--panel)' }}>
          <span className="fx-value" title={displayText} style={{ fontSize: '13px', fontWeight: 500, color: disabled ? 'var(--muted)' : 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{displayText}</span>
          <span className="fx-chevron" style={{ fontSize: '10px', marginLeft: '8px' }}>▼</span>
        </button>
        {open && (
          <div className="fx-menu" style={{ 
              position: 'absolute',
              top: menuPlacement === 'bottom' ? 'calc(100% + 4px)' : 'auto', 
              bottom: menuPlacement === 'top' ? 'calc(100% + 4px)' : 'auto',
              left: 0,
              minWidth: '100%',
              width: 'max-content',
              boxShadow: '0 4px 12px rgba(0,0,0,0.15)', 
              border: '1px solid var(--border)',
              zIndex: 99999,
              background: 'var(--panel)',
              borderRadius: '6px'
          }}>
            <div className="fx-menu-inner" style={{ maxHeight: '200px', overflowY: 'auto' }}>
              {options.length === 0 ? ( <div className="fx-item fx-empty" style={{ fontSize: '13px', padding: '8px' }}>No options</div> ) : (
                options.map((opt) => {
                  const optVal = opt.value !== undefined ? opt.value : opt;
                  const optLabel = opt.label !== undefined ? opt.label : opt;
                  const isSelected = value === optVal;
                  return (
                    <div key={optVal} className={`fx-item ${isSelected ? "fx-active" : ""}`} onClick={() => { onChange(optVal); setOpen(false); }} style={{ padding: '8px 12px', fontSize: '13px', cursor: 'pointer', background: isSelected ? 'var(--bg)' : 'transparent', color: isSelected ? 'var(--primary)' : 'var(--text)', whiteSpace: 'nowrap' }} onMouseOver={e => !isSelected && (e.currentTarget.style.background = 'var(--bg)')} onMouseOut={e => !isSelected && (e.currentTarget.style.background = 'transparent')}>
                      <span className="fx-label">{optLabel}</span>
                    </div>
                  )
                })
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default function DeploymentHistory() {
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [items, setItems] = useState([]); 
  const [lastUpdated, setLastUpdated] = useState("");

  const [detailAction, setDetailAction] = useState(null); 
  const [detailResults, setDetailResults] = useState({ loading: false, rows: [], error: null });
  const [detailLastUpdated, setDetailLastUpdated] = useState("");

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [globalLogic, setGlobalLogic] = useState("AND");
  const [filters, setFilters] = useState([]);
  const propertyOptions = [
    { value: "name", label: "Action Name" }, { value: "id", label: "ID" },
    { value: "state", label: "State" }, { value: "issuer", label: "Issuer" }
  ];

  const [currentPage, setCurrentPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [sortConfig, setSortConfig] = useState({ key: null, direction: "asc" });
  const [showColDrop, setShowColDrop] = useState(false);
  const [showExpDrop, setShowExpDrop] = useState(false);
  const [exportFormat, setExportFormat] = useState('CSV');
  
  const colRef = useRef(null); const expRef = useRef(null);

  const [cols, setCols] = useState([
    { id: 'name', label: 'Action Name', show: true }, { id: 'id', label: 'ID', show: true },
    { id: 'state', label: 'State', show: true }, { id: 'issued', label: 'Issued', show: true },
    { id: 'stopped', label: 'Stopped', show: true }, { id: 'issuer', label: 'Issuer', show: true }
  ]);

  useEffect(() => {
    const handleOutside = (e) => {
      if (colRef.current && !colRef.current.contains(e.target)) setShowColDrop(false);
      if (expRef.current && !expRef.current.contains(e.target)) setShowExpDrop(false);
    };
    document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, []);

  const fetchDeployments = async () => {
    setLoading(true); setErr("");
    try {
      const r = await fetch(`${API}/api/deployments/bps`, { headers: { Accept: "application/json" } });
      const t = await r.text();
      if (!r.ok) throw new Error(t);
      const j = JSON.parse(t);
      setItems(Array.isArray(j?.items) ? j.items : []);
      setLastUpdated(new Date().toLocaleString());
    } catch (e) { setErr(e?.message || String(e)); } finally { setLoading(false); }
  };

  useEffect(() => { fetchDeployments(); }, []);

  const openActionDetails = async (action) => {
    if (!action || !action.id) return;
    setDetailAction(action); setDetailResults({ loading: true, rows: [], error: null });
    try {
      const res = await getJson(`${API}/api/actions/${action.id}/results`);
      setDetailResults({ loading: false, rows: Array.isArray(res?.rows) ? res.rows : [], error: null });
      setDetailLastUpdated(new Date().toLocaleString());
    } catch (e) { setDetailResults({ loading: false, rows: [], error: e.message || "Failed to load action results." }); }
  };

  const applyFilters = (item) => {
    if (!filters.length) return true;
    let globalMatch = globalLogic === "OR" ? false : true;
    let validBlocks = 0;
    for (let b of filters) {
      let blockMatch = true; let validConds = 0;
      for (let c of b.conds) {
        if (!c.value) continue;
        validConds++;
        const field = String(item[c.column] || "");
        blockMatch = blockMatch && evaluateCondition(field, c.operator, c.value, c.column);
      }
      if (validConds > 0) { validBlocks++; globalMatch = globalLogic === "OR" ? (globalMatch || blockMatch) : (globalMatch && blockMatch); }
    }
    return validBlocks === 0 ? true : globalMatch;
  };

  const filteredItems = useMemo(() => items.filter(applyFilters), [items, filters, globalLogic]);

  const sortedItems = useMemo(() => {
    let sortableItems = [...filteredItems];
    if (sortConfig.key) {
      sortableItems.sort((a, b) => {
        let aVal = a[sortConfig.key] || ""; let bVal = b[sortConfig.key] || "";
        if (sortConfig.key === 'id') { aVal = Number(aVal) || 0; bVal = Number(bVal) || 0; } 
        else { aVal = String(aVal).toLowerCase(); bVal = String(bVal).toLowerCase(); }
        if (aVal < bVal) return sortConfig.direction === "asc" ? -1 : 1;
        if (aVal > bVal) return sortConfig.direction === "asc" ? 1 : -1;
        return 0;
      });
    }
    return sortableItems;
  }, [filteredItems, sortConfig]);

  const totalPages = Math.ceil(sortedItems.length / rowsPerPage);
  const paginatedItems = sortedItems.slice((currentPage - 1) * rowsPerPage, currentPage * rowsPerPage);

  useEffect(() => { setCurrentPage(1); }, [filters, rowsPerPage]);

  const handleSort = (key) => setSortConfig(prev => ({ key, direction: prev.key === key && prev.direction === "asc" ? "desc" : "asc" }));
  const getSortIcon = (key) => {
    if (sortConfig.key !== key) return <span className="muted-text ml-6">↕</span>;
    return <span className="ml-6">{sortConfig.direction === "asc" ? "↑" : "↓"}</span>;
  };

  const handleExport = (scope) => { 
    setShowExpDrop(false); 
    let dataToExport = [];
    if (scope === 'page') dataToExport = paginatedItems;
    else if (scope === 'filtered') dataToExport = sortedItems;
    else dataToExport = items;
    performExport(dataToExport, cols, exportFormat, "deployment_history");
  };

  const activeFilterCount = filters.reduce((acc, b) => acc + b.conds.filter(c => c.value).length, 0);
  
  // Options for FancySelect
  const rppOptions = [
      {value: 10, label: "10"}, 
      {value: 20, label: "20"}, 
      {value: 50, label: "50"}, 
      {value: 10000, label: "All"}
  ];

  if (detailAction) {
     return <ActionResultsView action={detailAction} loading={detailResults.loading} rows={detailResults.rows} error={detailResults.error} lastUpdated={detailLastUpdated} onBack={() => setDetailAction(null)} onRefresh={() => openActionDetails(detailAction)} />
  }

  return (
    <div className="card reveal" style={{ minHeight: '100%', display: 'flex', flexDirection: 'column', padding: 0, overflow: 'visible', boxShadow: 'none', border: 'none', background: 'transparent' }}>
      
      <div style={{ position: 'sticky', top: '-24px', background: 'var(--panel)', zIndex: 20, padding: '24px 32px 16px', borderBottom: '1px solid var(--border)', margin: '-24px -32px 24px -32px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: "22px", fontWeight: 600, color: "var(--text)" }}>Deployment History</h2>
          <div className="text-13 muted-text" style={{ marginTop: '4px' }}>Updated: {lastUpdated || "—"}</div>
        </div>
        <div style={{ display: 'flex', gap: '12px' }}>
          <div style={{ position: 'relative' }}>
            <button className="iconbtn" onClick={() => setDrawerOpen(true)} title="Filter Data">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16"><line x1="4" y1="21" x2="4" y2="14"></line><line x1="4" y1="10" x2="4" y2="3"></line><line x1="12" y1="21" x2="12" y2="12"></line><line x1="12" y1="8" x2="12" y2="3"></line><line x1="20" y1="21" x2="20" y2="16"></line><line x1="20" y1="12" x2="20" y2="3"></line><line x1="1" y1="14" x2="7" y2="14"></line><line x1="9" y1="8" x2="15" y2="8"></line><line x1="17" y1="16" x2="23" y2="16"></line></svg>
            </button>
            {activeFilterCount > 0 && <span className="pill blue" style={{ position: 'absolute', top: -8, right: -8, padding: '2px 6px', fontSize: 10 }}>{activeFilterCount}</span>}
          </div>
          <button className="iconbtn" onClick={fetchDeployments} title="Refresh Data">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16"><path d="M23 4v6h-6"></path><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path></svg>
          </button>
        </div>
      </div>

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        
        {activeFilterCount > 0 && (
          <div className="active-filter-banner active" style={{ marginBottom: "16px" }}>
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
            <div className="grid-toolbar-left" style={{ display: 'flex', alignItems: 'center', gap: '16px' }}></div>
            <div className="grid-toolbar-right" style={{ display: 'flex', gap: '12px' }}>
                <div className="dropdown" ref={colRef}>
                    <button className="btn outline sec small" style={{ height: '36px' }} onClick={() => { setShowColDrop(!showColDrop); setShowExpDrop(false); }}>
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
                    <button className="btn outline small" style={{ height: '36px' }} onClick={() => { setShowExpDrop(!showExpDrop); setShowColDrop(false); }}>
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

        <div className="tableWrap border-top" style={{ flex: 1, overflow: 'auto', margin: '0 -32px', width: 'calc(100% + 64px)', borderLeft: 'none', borderRight: 'none', borderRadius: 0 }}>
            {loading ? (
                <div style={{ padding: "40px", textAlign: "center", color: "var(--muted)" }}>Loading records...</div>
            ) : err ? (
                <div style={{ padding: "40px", textAlign: "center", color: "var(--danger)" }}>{err}</div>
            ) : (
                <table>
                    <thead className="kpi-th-sticky">
                        <tr>
                            {cols.find(c=>c.id==='name')?.show && <th className="cursor-pointer" onClick={() => handleSort('name')}>Action Name{getSortIcon('name')}</th>}
                            {cols.find(c=>c.id==='id')?.show && <th className="cursor-pointer" onClick={() => handleSort('id')}>ID{getSortIcon('id')}</th>}
                            {cols.find(c=>c.id==='state')?.show && <th className="cursor-pointer" onClick={() => handleSort('state')}>State{getSortIcon('state')}</th>}
                            {cols.find(c=>c.id==='issued')?.show && <th className="cursor-pointer" onClick={() => handleSort('issued')}>Issued{getSortIcon('issued')}</th>}
                            {cols.find(c=>c.id==='stopped')?.show && <th className="cursor-pointer" onClick={() => handleSort('stopped')}>Stopped{getSortIcon('stopped')}</th>}
                            {cols.find(c=>c.id==='issuer')?.show && <th className="cursor-pointer" onClick={() => handleSort('issuer')}>Issuer{getSortIcon('issuer')}</th>}
                        </tr>
                    </thead>
                    <tbody>
                        {paginatedItems.length === 0 ? (
                            <tr><td colSpan="6" style={{ padding: "40px", textAlign: "center", color: "var(--muted)" }}>No actions found.</td></tr>
                        ) : (
                            paginatedItems.map((it) => (
                                <tr key={it.id} onClick={() => openActionDetails(it)} className="cursor-pointer">
                                    {cols.find(c=>c.id==='name')?.show && <td><button className="name-link" onClick={(e) => { e.stopPropagation(); openActionDetails(it); }} style={{ display: 'inline-flex', alignItems: 'center', textAlign: 'left', background: 'none', border: 'none', color: 'var(--primary)', cursor: 'pointer', padding: 0, font: 'inherit' }}>{it.name}</button></td>}
                                    {cols.find(c=>c.id==='id')?.show && <td style={{ fontFamily: 'monospace', color: 'var(--muted)' }}>{it.id}</td>}
                                    {cols.find(c=>c.id==='state')?.show && <td><span className={`pill ${it.state.toLowerCase() === 'open' ? 'green' : 'amber'}`}>{it.state}</span></td>}
                                    {cols.find(c=>c.id==='issued')?.show && <td>{it.issued}</td>}
                                    {cols.find(c=>c.id==='stopped')?.show && <td>{it.stopped}</td>}
                                    {cols.find(c=>c.id==='issuer')?.show && <td>{it.issuer}</td>}
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            )}
        </div>
        
        {/* ADDED position: "relative" and zIndex: 50 to prevent FancySelect menu from hiding behind the table */}
        <div className="pagination" style={{ position: "relative", zIndex: 50, display: "flex", justifyContent: "flex-end", alignItems: "center", padding: "16px 32px", gap: "24px", margin: "0 -32px", width: "calc(100% + 64px)", borderBottom: '1px solid var(--border)' }}>
            <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                <span className="pager-info" style={{ fontSize: "13px", color: "var(--muted)" }}>Rows per page:</span>
                <FancySelect options={rppOptions} value={rowsPerPage} onChange={v => { setRowsPerPage(Number(v)); setCurrentPage(1); }} width="80px" menuPlacement="top" />
            </div>
            <span className="pager-info" style={{ fontSize: "13px", color: "var(--muted)" }}>
                {sortedItems.length > 0 ? (currentPage - 1) * rowsPerPage + 1 : 0}-{Math.min(currentPage * rowsPerPage, filteredItems.length)} of {filteredItems.length}
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

      <FilterDrawer isOpen={drawerOpen} onClose={() => setDrawerOpen(false)} filters={filters} setFilters={setFilters} globalLogic={globalLogic} setGlobalLogic={setGlobalLogic} propertyOptions={propertyOptions} />

    </div>
  );
}

function ActionResultsView({ action, loading, rows, error, onBack, onRefresh, lastUpdated }) {
    const title = action?.name || "Action Details";

    const [currentPage, setCurrentPage] = useState(1);
    const [rowsPerPage, setRowsPerPage] = useState(10);
    const [sortConfig, setSortConfig] = useState({ key: "status", direction: "asc" });
    const [showColDrop, setShowColDrop] = useState(false);
    const [showExpDrop, setShowExpDrop] = useState(false);
    const [exportFormat, setExportFormat] = useState('CSV');
    
    const colRef = useRef(null); const expRef = useRef(null);

    const [cols, setCols] = useState([
        { id: 'server', label: 'Server Name', show: true },
        { id: 'status', label: 'Status', show: true }
    ]);

    const [drawerOpen, setDrawerOpen] = useState(false);
    const [globalLogic, setGlobalLogic] = useState("AND");
    const [filters, setFilters] = useState([]);
    const propertyOptions = [
      { value: "server", label: "Server Name" },
      { value: "status", label: "Status" }
    ];

    const rppOptions = [
        {value: 10, label: "10"}, 
        {value: 20, label: "20"}, 
        {value: 50, label: "50"}, 
        {value: 10000, label: "All"}
    ];

    useEffect(() => {
        const handleOutside = (e) => {
          if (colRef.current && !colRef.current.contains(e.target)) setShowColDrop(false);
          if (expRef.current && !expRef.current.contains(e.target)) setShowExpDrop(false);
        };
        document.addEventListener("mousedown", handleOutside);
        return () => document.removeEventListener("mousedown", handleOutside);
    }, []);

    useEffect(() => setCurrentPage(1), [filters, rowsPerPage, rows]);

    const applyFilters = (row) => {
      if (!filters.length) return true;
      let globalMatch = globalLogic === "OR" ? false : true;
      let validBlocks = 0;
      for (let b of filters) {
        let blockMatch = true; let validConds = 0;
        for (let c of b.conds) {
          if (!c.value) continue;
          validConds++;
          const field = String(row[c.column] || "");
          blockMatch = blockMatch && evaluateCondition(field, c.operator, c.value, c.column);
        }
        if (validConds > 0) { validBlocks++; globalMatch = globalLogic === "OR" ? (globalMatch || blockMatch) : (globalMatch && blockMatch); }
      }
      return validBlocks === 0 ? true : globalMatch;
    };

    const filtered = useMemo(() => rows.filter(applyFilters), [rows, filters, globalLogic]);

    const sorted = useMemo(() => {
        if (!sortConfig.key) return filtered;
        return [...filtered].sort((a, b) => {
            const valA = sortConfig.key === 'status' ? classify(a.status).toLowerCase() : String(a[sortConfig.key] || "").toLowerCase();
            const valB = sortConfig.key === 'status' ? classify(b.status).toLowerCase() : String(b[sortConfig.key] || "").toLowerCase();
            if (valA < valB) return sortConfig.direction === "asc" ? -1 : 1;
            if (valA > valB) return sortConfig.direction === "asc" ? 1 : -1;
            return 0;
        });
    }, [filtered, sortConfig]);

    const totalPages = Math.ceil(sorted.length / rowsPerPage);
    const paginated = sorted.slice((currentPage - 1) * rowsPerPage, currentPage * rowsPerPage);

    const handleSort = (key) => setSortConfig(c => ({ key, direction: c.key === key && c.direction === "asc" ? "desc" : "asc" }));
    const getSortIcon = (key) => {
      if (sortConfig.key !== key) return <span className="muted-text ml-6">↕</span>;
      return <span className="ml-6">{sortConfig.direction === "asc" ? "↑" : "↓"}</span>;
    };

    const getBadgeClass = (status) => {
      const s = classify(status);
      if (s === 'Success') return 'pill green';
      if (s === 'Failed') return 'pill red';
      if (s === 'Running') return 'pill blue';
      return 'pill amber';
    };
    
    const handleExport = (scope) => { 
        setShowExpDrop(false); 
        let dataToExport = [];
        if (scope === 'page') dataToExport = paginated;
        else if (scope === 'filtered') dataToExport = sorted;
        else dataToExport = rows;
        performExport(dataToExport, cols, exportFormat, "action_results");
    };

    const activeFilterCount = filters.reduce((acc, b) => acc + b.conds.filter(c => c.value).length, 0);

    return (
        <div className="card reveal" style={{ minHeight: '100%', display: 'flex', flexDirection: 'column', padding: 0, overflow: 'visible', boxShadow: 'none', border: 'none', background: 'transparent' }}>
            
            <div style={{ position: 'sticky', top: '-24px', background: 'var(--panel)', zIndex: 20, padding: '24px 32px 16px', borderBottom: '1px solid var(--border)', margin: '-24px -32px 24px -32px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)' }}>
                <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
                    <button className="iconbtn" onClick={onBack} title="Back to History" style={{ background: "var(--panel)" }}>
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 18l-6-6 6-6"/></svg>
                    </button>
                    <div>
                        <h2 style={{ margin: 0, fontSize: "22px", fontWeight: 600, color: "var(--text)" }}>{title}</h2>
                        <div className="text-13 muted-text" style={{ marginTop: '4px' }}>Updated: {lastUpdated || "—"}</div>
                    </div>
                </div>
                <div style={{ display: 'flex', gap: '12px' }}>
                    <div style={{ position: 'relative' }}>
                        <button className="iconbtn" onClick={() => setDrawerOpen(true)} title="Filter Data">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16"><line x1="4" y1="21" x2="4" y2="14"></line><line x1="4" y1="10" x2="4" y2="3"></line><line x1="12" y1="21" x2="12" y2="12"></line><line x1="12" y1="8" x2="12" y2="3"></line><line x1="20" y1="21" x2="20" y2="16"></line><line x1="20" y1="12" x2="20" y2="3"></line><line x1="1" y1="14" x2="7" y2="14"></line><line x1="9" y1="8" x2="15" y2="8"></line><line x1="17" y1="16" x2="23" y2="16"></line></svg>
                        </button>
                        {activeFilterCount > 0 && <span className="pill blue" style={{ position: 'absolute', top: -8, right: -8, padding: '2px 6px', fontSize: 10 }}>{activeFilterCount}</span>}
                    </div>
                    <button className="iconbtn" onClick={onRefresh} title="Refresh Data">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16"><path d="M23 4v6h-6"></path><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path></svg>
                    </button>
                </div>
            </div>

            <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>

                {activeFilterCount > 0 && (
                  <div className="active-filter-banner active" style={{ marginBottom: "16px" }}>
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
                    <div className="grid-toolbar-left"></div>
                    <div className="grid-toolbar-right" style={{ display: 'flex', gap: '12px' }}>
                        <div className="dropdown" ref={colRef}>
                            <button className="btn outline sec small" style={{ height: '36px' }} onClick={() => { setShowColDrop(!showColDrop); setShowExpDrop(false); }}>
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
                            <button className="btn outline small" style={{ height: '36px' }} onClick={() => { setShowExpDrop(!showExpDrop); setShowColDrop(false); }}>
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

                <div className="tableWrap border-top" style={{ flex: 1, overflow: 'auto', margin: '0 -32px', width: 'calc(100% + 64px)', borderLeft: 'none', borderRight: 'none', borderRadius: 0 }}>
                    <table>
                        <thead className="kpi-th-sticky">
                            <tr>
                                {cols.find(c=>c.id==='server')?.show && <th className="cursor-pointer" onClick={() => handleSort('server')}>Server {getSortIcon('server')}</th>}
                                {cols.find(c=>c.id==='status')?.show && <th className="cursor-pointer" onClick={() => handleSort('status')}>Status {getSortIcon('status')}</th>}
                            </tr>
                        </thead>
                        <tbody>
                            {paginated.length === 0 ? (
                                <tr><td colSpan="2" style={{ padding: "40px", textAlign: "center", color: "var(--muted)" }}>No results found.</td></tr>
                            ) : (
                                paginated.map((r, i) => (
                                    <tr key={i}>
                                        {cols.find(c=>c.id==='server')?.show && <td style={{ fontWeight: 500 }}>{r.server}</td>}
                                        {cols.find(c=>c.id==='status')?.show && (
                                          <td>
                                            <span className={getBadgeClass(r.status)}>
                                              {classify(r.status)}
                                            </span>
                                          </td>
                                        )}
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>

                {/* ADDED position: "relative" and zIndex: 50 to prevent FancySelect menu from hiding behind the table */}
                <div className="pagination" style={{ position: "relative", zIndex: 50, display: "flex", justifyContent: "flex-end", alignItems: "center", padding: "16px 32px", gap: "24px", margin: "0 -32px", width: "calc(100% + 64px)", borderBottom: '1px solid var(--border)' }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                        <span className="pager-info" style={{ fontSize: "13px", color: "var(--muted)" }}>Rows per page:</span>
                        <FancySelect options={rppOptions} value={rowsPerPage} onChange={v => { setRowsPerPage(Number(v)); setCurrentPage(1); }} width="80px" menuPlacement="top" />
                    </div>
                    <span className="pager-info" style={{ fontSize: "13px", color: "var(--muted)" }}>
                        {sorted.length > 0 ? (currentPage - 1) * rowsPerPage + 1 : 0}-{Math.min(currentPage * rowsPerPage, sorted.length)} of {sorted.length}
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

            <FilterDrawer isOpen={drawerOpen} onClose={() => setDrawerOpen(false)} filters={filters} setFilters={setFilters} globalLogic={globalLogic} setGlobalLogic={setGlobalLogic} propertyOptions={propertyOptions} />
        </div>
    );
}