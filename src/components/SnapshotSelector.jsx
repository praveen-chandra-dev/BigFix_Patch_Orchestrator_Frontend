// src/components/SnapshotSelector.jsx
import { useState, useEffect, useRef, useMemo } from "react";
import FilterDrawer from "./FilterDrawer";

const API = window.env?.VITE_API_BASE || "http://localhost:5174";

function getHeaders() {
  return { "Content-Type": "application/json", "x-user-role": sessionStorage.getItem("user_role") || "Admin" };
}
async function getJSON(url) {
  const r = await fetch(`${API}${url}`, { headers: getHeaders() });
  return r.json();
}
async function postJSON(url, body) {
  const r = await fetch(`${API}${url}`, { method: "POST", headers: getHeaders(), body: JSON.stringify(body) });
  return r.json();
}

function performExport(dataToExport, columns, format, filenamePrefix, getVal = (row, colId) => row[colId]) {
    const visibleCols = columns.filter(c => c.show);
    const headers = visibleCols.map(c => c.label);
    const triggerDownload = (content, type, ext) => {
        const blob = new Blob([content], { type });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url; a.download = `${filenamePrefix}.${ext}`;
        a.click(); URL.revokeObjectURL(url);
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

const FancyDropdown = ({ options, value, onChange, placeholder, disabled }) => {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    const handleClickOutside = (event) => { if (ref.current && !ref.current.contains(event.target)) setOpen(false); };
    document.addEventListener("mousedown", handleClickOutside); return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);
  const selectedLabel = options.find((o) => o.value === value)?.label || placeholder;
  return (
    <div className="field flex-1" ref={ref}>
      <div className="meta"><label>Select Group</label></div>
      <div className="inputwrap">
          <div className={`fx-wrap flex-1 ${open ? "fx-open" : ""} ${disabled ? "disabled" : ""}`}>
            <button type="button" className="fx-trigger" onClick={() => !disabled && setOpen(!open)} disabled={disabled}>
              <span className="fx-value">{selectedLabel}</span>
              <span className="fx-chevron">▾</span>
            </button>
            {open && (
              <div className="fx-menu">
                {options.length === 0 ? (
                  <div className="fx-item empty">No Groups Found</div>
                ) : (
                  options.map((opt) => (
                    <div key={opt.value} className={`fx-item ${value === opt.value ? "active" : ""}`} onClick={() => { onChange(opt.value); setOpen(false); }}>{opt.label}</div>
                  ))
                )}
              </div>
            )}
          </div>
      </div>
    </div>
  );
};

export default function SnapshotManager({ onClose, groupName: initialGroup, onComplete, environment }) {
  const [activeTab, setActiveTab] = useState("TARGETS");
  const [mode, setMode] = useState(initialGroup ? "GROUP" : "COMPUTER");
  const [items, setItems] = useState([]);
  const [isFetching, setIsFetching] = useState(false);
  const [groups, setGroups] = useState([]);
  const [selectedGroupId, setSelectedGroupId] = useState("");
  const [selectedIds, setSelectedIds] = useState(new Set()); 
  const [error, setError] = useState("");
  const [processing, setProcessing] = useState(false);
  const [snapName, setSnapName] = useState(`Patching_${new Date().toISOString().slice(0, 10)}`);
  const [description, setDescription] = useState("Automated Patching Snapshot");
  const [includeMemory, setIncludeMemory] = useState(false);
  const [quiesce, setQuiesce] = useState(false);
  const [executions, setExecutions] = useState([]); 
  const [lastUpdated, setLastUpdated] = useState("");
  const [execLastUpdated, setExecLastUpdated] = useState("");

  // Toolbar, Pagination & Sorting State
  const [currentPage, setCurrentPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [sortConfig, setSortConfig] = useState({ key: null, direction: "asc" });
  const [showColDrop, setShowColDrop] = useState(false);
  const [showExpDrop, setShowExpDrop] = useState(false);
  const [exportFormat, setExportFormat] = useState('CSV');
  
  const [execCurrentPage, setExecCurrentPage] = useState(1);
  const [execRowsPerPage, setExecRowsPerPage] = useState(10);
  const [execSortConfig, setExecSortConfig] = useState({ key: null, direction: "asc" });
  const [showExecColDrop, setShowExecColDrop] = useState(false);
  const [showExecExpDrop, setShowExecExpDrop] = useState(false);
  const [execExportFormat, setExecExportFormat] = useState('CSV');

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [globalLogic, setGlobalLogic] = useState("AND");
  const [filters, setFilters] = useState([]);
  
  const colRef = useRef(null);
  const expRef = useRef(null);

  const execColRef = useRef(null);
  const execExpRef = useRef(null);

  const [cols, setCols] = useState([
    { id: 'name', label: 'Hostname', show: true },
    { id: 'ips', label: 'IP Address', show: true },
    { id: 'vcStatus', label: 'Status', show: true }
  ]);

  const [execCols, setExecCols] = useState([
    { id: 'name', label: 'Server Name', show: true },
    { id: 'snapName', label: 'Snapshot Name', show: true },
    { id: 'taskId', label: 'Task ID', show: true },
    { id: 'createdAt', label: 'Started', show: true },
    { id: 'status', label: 'Status', show: true }
  ]);

  const propertyOptions = activeTab === 'EXECUTION' ? [
    { value: "name", label: "Server Name" },
    { value: "snapName", label: "Snapshot Name" },
    { value: "taskId", label: "Task ID" },
    { value: "status", label: "Status" }
  ] : [
    { value: "name", label: "Hostname" },
    { value: "ips", label: "IP Address" },
    { value: "vcStatus", label: "Status" }
  ];

  // Communicate with Header.jsx
  useEffect(() => { window.dispatchEvent(new CustomEvent('sync:snapshot_tab', { detail: activeTab })); }, [activeTab]);
  useEffect(() => { 
    const handler = (e) => {
        setActiveTab(e.detail);
        setFilters([]); // Clear filters when changing tabs
    };
    window.addEventListener('nav:snapshot', handler); 
    return () => window.removeEventListener('nav:snapshot', handler); 
  }, []);

  useEffect(() => {
    const handleOutside = (e) => {
      if (colRef.current && !colRef.current.contains(e.target)) setShowColDrop(false);
      if (expRef.current && !expRef.current.contains(e.target)) setShowExpDrop(false);
      if (execColRef.current && !execColRef.current.contains(e.target)) setShowExecColDrop(false);
      if (execExpRef.current && !execExpRef.current.contains(e.target)) setShowExecExpDrop(false);
    };
    document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, []);

  useEffect(() => {
    async function init() {
      try {
        const envRes = await getJSON("/api/env");
        if (envRes.values?.SNAPSHOT_DEFAULT_NAME) setSnapName(envRes.values.SNAPSHOT_DEFAULT_NAME.replace("{Date}", new Date().toISOString().slice(0, 10)));
        const gRes = await getJSON("/api/groups/list");
        if (gRes.ok) {
          setGroups(gRes.groups.map((g) => ({ value: g.id, label: g.name })));
          if (initialGroup) { const found = gRes.groups.find((g) => g.name === initialGroup); if (found) setSelectedGroupId(found.id); }
        }
      } catch (e) {}
    }
    init();
  }, [initialGroup]);

  const fetchData = async () => {
    if (mode === "GROUP" && !selectedGroupId) return;
    setIsFetching(true); setError("");
    try {
      let newItems = [];
      if (mode === "GROUP") {
          const g = groups.find((x) => x.value === selectedGroupId);
          if (g) { const res = await getJSON(`/api/groups/${encodeURIComponent(g.label)}/members`); newItems = res.members || []; }
      } else {
          const res = await getJSON(`/api/groups/metadata/computers?page=1&limit=10000`);
          if (res.ok) { newItems = res.computers.map(c => ({ ...c, vcId: null, vcStatus: 'pending' })); }
      }
      setItems(newItems);
      setLastUpdated(new Date().toLocaleString());
      setCurrentPage(1);
      if (newItems.length > 0) resolveBatch(newItems);
    } catch (e) { setError(e.message); } finally { setIsFetching(false); }
  };

  useEffect(() => { setItems([]); setSelectedIds(new Set()); setCurrentPage(1); }, [mode, selectedGroupId]);
  useEffect(() => { fetchData(); }, [mode, selectedGroupId]);

  const resolveBatch = async (batchItems) => {
      const targets = batchItems.map(m => ({ name: m.name, ips: (m.ips || []).map(ip => String(ip).trim()) }));
      if (targets.length === 0) return;
      setItems(prev => prev.map(i => { if (batchItems.some(b => b.name === i.name)) return { ...i, vcStatus: 'resolving' }; return i; }));
      try {
          const look = await postJSON("/api/vcenter/lookup", { targets });
          const resultMap = new Map();
          (look.matches || []).forEach(m => { if (m.name && m.id) resultMap.set(m.name, m.id); });
          setItems(prev => prev.map(i => {
             if (batchItems.some(b => b.name === i.name)) { const vcId = resultMap.get(i.name); return { ...i, vcId: vcId || null, vcStatus: vcId ? 'ready' : 'not_found' }; }
             return i;
          }));
      } catch (e) {}
  };

  const applyFilters = (item) => {
    if (!filters.length) return true;
    let globalMatch = globalLogic === "OR" ? false : true;
    for (let b of filters) {
      let blockMatch = true; let validConds = 0;
      for (let c of b.conds) {
        if (!c.value) continue;
        validConds++; let condition = true;
        const query = String(c.value).toLowerCase();
        let field = "";
        if (c.column === "ips") field = (item.ips || []).join(", ").toLowerCase();
        else field = String(item[c.column] || "").toLowerCase();

        if (c.operator === "contains") condition = field.includes(query);
        else if (c.operator === "=") condition = field === query;
        else if (c.operator === "!=") condition = field !== query;
        blockMatch = blockMatch && condition;
      }
      if (validConds > 0) globalMatch = globalLogic === "OR" ? (globalMatch || blockMatch) : (globalMatch && blockMatch);
    }
    return globalMatch;
  };

  const visibleItems = useMemo(() => items.filter(applyFilters), [items, filters, globalLogic]);
  const visibleExecs = useMemo(() => executions.filter(applyFilters), [executions, filters, globalLogic]);

  const sortedItems = useMemo(() => {
    let sortableItems = [...visibleItems];
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
  }, [visibleItems, sortConfig]);

  const sortedExecs = useMemo(() => {
    let sortableItems = [...visibleExecs];
    if (execSortConfig.key) {
      sortableItems.sort((a, b) => {
        let aVal = String(a[execSortConfig.key] || "").toLowerCase();
        let bVal = String(b[execSortConfig.key] || "").toLowerCase();
        if (aVal < bVal) return execSortConfig.direction === "asc" ? -1 : 1;
        if (aVal > bVal) return execSortConfig.direction === "asc" ? 1 : -1;
        return 0;
      });
    }
    return sortableItems;
  }, [visibleExecs, execSortConfig]);

  const totalPages = Math.ceil(sortedItems.length / rowsPerPage);
  const paginatedItems = sortedItems.slice((currentPage - 1) * rowsPerPage, currentPage * rowsPerPage);

  const execTotalPages = Math.ceil(sortedExecs.length / execRowsPerPage);
  const execPaginatedItems = sortedExecs.slice((execCurrentPage - 1) * execRowsPerPage, execCurrentPage * execRowsPerPage);

  const handleSort = (key) => setSortConfig(prev => ({ key, direction: prev.key === key && prev.direction === "asc" ? "desc" : "asc" }));
  const handleExecSort = (key) => setExecSortConfig(prev => ({ key, direction: prev.key === key && prev.direction === "asc" ? "desc" : "asc" }));
  
  const getSortIcon = (key, config) => {
    if (config.key !== key) return <span className="muted-text ml-6">↕</span>;
    return <span className="ml-6">{config.direction === "asc" ? "↑" : "↓"}</span>;
  };

  const toggleRow = (vcId) => {
    if (!vcId || processing) return;
    setSelectedIds((prev) => { const next = new Set(prev); if (next.has(vcId)) next.delete(vcId); else next.add(vcId); return next; });
  };

  const toggleAllVisible = () => {
    if (processing) return;
    const validIds = sortedItems.filter(i => i.vcStatus === 'ready' && i.vcId).map(i => i.vcId);
    if (validIds.length === 0) return;
    const allLoadedSelected = validIds.every(id => selectedIds.has(id));
    setSelectedIds(prev => { 
        const next = new Set(prev); 
        validIds.forEach(id => allLoadedSelected ? next.delete(id) : next.add(id)); 
        return next; 
    });
  };

  const activeFilterCount = filters.reduce((acc, b) => acc + b.conds.filter(c => c.value).length, 0);

  const handleExport = (scope, isExec) => { 
    if (isExec) setShowExecExpDrop(false); else setShowExpDrop(false); 

    let dataToExport = [];
    const format = isExec ? execExportFormat : exportFormat;
    const columns = isExec ? execCols : cols;
    const filename = isExec ? "snapshot_history" : "snapshot_targets";

    if (scope === 'page') dataToExport = isExec ? execPaginatedItems : paginatedItems;
    else if (scope === 'filtered') dataToExport = isExec ? sortedExecs : sortedItems;
    else dataToExport = isExec ? visibleExecs : visibleItems;

    performExport(dataToExport, columns, format, filename, (p, c) => {
        let val = p[c];
        if (!isExec && c === 'ips') val = Array.isArray(p.ips) ? p.ips.join(", ") : "";
        if (!isExec && c === 'vcStatus') val = p.vcStatus === 'ready' ? 'Ready' : p.vcStatus === 'resolving' ? 'Resolving' : p.vcStatus === 'not_found' ? 'Not Found' : 'Pending';
        return val;
    });
  };

  const handleExecute = async () => {
    if (selectedIds.size === 0) return;
    setProcessing(true); setError(""); setActiveTab("EXECUTION");
    const vmNames = {}; items.forEach(i => { if (i.vcId) vmNames[i.vcId] = i.name; });
    try {
      const res = await postJSON("/api/vcenter/snapshot", { vmIds: Array.from(selectedIds), snapshotName: snapName, description, includeMemory, quiesce, vmNames });
      if (!res.ok) throw new Error(res.error);
      await refreshHistory(); 
      const successCount = res.results?.filter((r) => r.ok).length || 0;
      setProcessing(false);
      if (onComplete) onComplete({ successCount });
    } catch (e) { setError(e.message); setProcessing(false); setActiveTab("SETTINGS"); }
  };

  const refreshHistory = async () => {
    const res = await getJSON("/api/vcenter/history");
    if (res.ok && Array.isArray(res.history)) {
        const mapped = res.history.filter(h => h.Type === 'Snapshot').map(h => ({ id: h.VmId, name: h.VmName, snapName: h.SnapshotName, taskId: h.TaskId, status: h.Status, error: h.Error, createdAt: new Date(h.CreatedAt).toLocaleString() }));
        setExecutions(mapped);
        setExecLastUpdated(new Date().toLocaleString());
        return mapped;
    }
    return [];
  };

  useEffect(() => {
    if (activeTab !== "EXECUTION") return;
    const checkStatus = async () => {
        const currentList = await refreshHistory();
        const activeTasks = currentList.filter(x => (x.status === 'queued' || x.status === 'running') && x.taskId).map(x => x.taskId);
        if (activeTasks.length > 0) { await postJSON("/api/vcenter/tasks", { taskIds: activeTasks }); await refreshHistory(); }
    };
    checkStatus(); const interval = setInterval(checkStatus, 5000);
    return () => clearInterval(interval);
  }, [activeTab]);

  const renderExecStatus = (s) => {
      const st = String(s || "").toLowerCase();
      if (st === 'completed' || st === 'success') return <span className="pill green">Success</span>;
      if (st === 'running') return <span className="pill blue">Running...</span>;
      if (st === 'queued') return <span className="pill gray">Queued...</span>;
      if (st === 'failed' || st === 'error') return <span className="pill red">Failed</span>;
      return <span className="pill gray">{st}</span>;
  };

  const renderVcStatus = (status, vcId) => {
      if (status === 'ready') return <span className="pill green">Ready ({vcId})</span>;
      if (status === 'not_found') return <span className="pill red">Not Found</span>;
      if (status === 'resolving') return <span className="pill blue">Resolving...</span>;
      return <span className="pill gray">Waiting...</span>;
  };

  return (
    <div className="mgmtenv">
      <div className="topbar" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div className="left" style={{ display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
               <h2 className="m-0">Take Snapshot</h2>
               {environment && <span className="pill gray">{environment.toUpperCase()}</span>}
            </div>
            {activeTab !== 'SETTINGS' && (
                <div className="sub mt-4 text-13 muted-text">
                   Updated: {activeTab === 'EXECUTION' ? execLastUpdated || "—" : lastUpdated || "—"}
                </div>
            )}
        </div>
        <div className="right flex-row gap-12 items-center">
            {(activeTab === 'TARGETS' || activeTab === 'EXECUTION') && (
              <>
                <div style={{ position: 'relative' }}>
                    <button className="iconbtn" onClick={() => setDrawerOpen(true)} title="Filter Data">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16"><line x1="4" y1="21" x2="4" y2="14"></line><line x1="4" y1="10" x2="4" y2="3"></line><line x1="12" y1="21" x2="12" y2="12"></line><line x1="12" y1="8" x2="12" y2="3"></line><line x1="20" y1="21" x2="20" y2="16"></line><line x1="20" y1="12" x2="20" y2="3"></line><line x1="1" y1="14" x2="7" y2="14"></line><line x1="9" y1="8" x2="15" y2="8"></line><line x1="17" y1="16" x2="23" y2="16"></line></svg>
                    </button>
                    {activeFilterCount > 0 && <span className="pill blue" style={{ position: 'absolute', top: -8, right: -8, padding: '2px 6px', fontSize: 10 }}>{activeFilterCount}</span>}
                </div>
                <button className="iconbtn" onClick={activeTab === 'EXECUTION' ? refreshHistory : fetchData} disabled={processing || isFetching} title="Refresh Data">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16"><path d="M23 4v6h-6"></path><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path></svg>
                </button>
              </>
            )}
        </div>
      </div>

      {activeFilterCount > 0 && activeTab !== 'SETTINGS' && (
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

      {activeTab === "TARGETS" && (
        <>
          <div className="tabs sub">
            <button className={`tab small ${mode === "GROUP" ? "active" : ""}`} onClick={() => setMode("GROUP")} disabled={processing}>By Groups</button>
            <button className={`tab small ${mode === "COMPUTER" ? "active" : ""}`} onClick={() => setMode("COMPUTER")} disabled={processing}>By Computers</button>
          </div>

          {mode === "GROUP" && (
            <div className="section overflow-visible">
              <div className="controls-grid">
                  <FancyDropdown options={groups} value={selectedGroupId} onChange={setSelectedGroupId} placeholder="-- Select Group --" disabled={processing} />
              </div>
            </div>
          )}

          <div className="section">
            <div className="section-head" style={{ paddingBottom: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <span className="title">Select VMs</span> 
                  <span className="pill soft">Selected: {selectedIds.size}</span>
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
                                <button className="item" onClick={() => handleExport('page', false)}>Current Page</button>
                                <button className="item" onClick={() => handleExport('filtered', false)}>Filtered Data</button>
                                <button className="item" onClick={() => handleExport('all', false)}>All Data</button>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            <div className="tableWrap h-400 border-top" style={{ borderRadius: 0, borderLeft: 'none', borderRight: 'none' }}>
              {isFetching ? (
                  <div className="sub empty-state" style={{ padding: '40px', textAlign: 'center' }}>Loading servers...</div>
              ) : paginatedItems.length === 0 ? (
                  <div className="sub empty-state" style={{ padding: '40px', textAlign: 'center' }}>No servers found.</div>
              ) : (
                <table>
                  <thead className="kpi-th-sticky">
                    <tr>
                        <th className="w-40 text-center"><input type="checkbox" className="custom-checkbox" onChange={toggleAllVisible} disabled={!paginatedItems.length}/></th>
                        {cols.find(c=>c.id==='name')?.show && <th className="cursor-pointer" onClick={() => handleSort('name')}>Hostname{getSortIcon('name', sortConfig)}</th>}
                        {cols.find(c=>c.id==='ips')?.show && <th className="cursor-pointer" onClick={() => handleSort('ips')}>IP Address{getSortIcon('ips', sortConfig)}</th>}
                        {cols.find(c=>c.id==='vcStatus')?.show && <th className="cursor-pointer" onClick={() => handleSort('vcStatus')}>Status{getSortIcon('vcStatus', sortConfig)}</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {paginatedItems.map((row, i) => {
                        const isReady = row.vcStatus === 'ready';
                        return (
                            <tr key={i} className={!isReady ? "disabled" : selectedIds.has(row.vcId) ? "selected-row cursor-pointer" : "cursor-pointer"} onClick={() => toggleRow(row.vcId)}>
                              <td className="text-center"><input type="checkbox" className="custom-checkbox pointer-events-none" checked={selectedIds.has(row.vcId)} disabled={!isReady || processing} readOnly /></td>
                              {cols.find(c=>c.id==='name')?.show && <td>{row.name}</td>}
                              {cols.find(c=>c.id==='ips')?.show && <td>{row.ips?.join(", ") || "-"}</td>}
                              {cols.find(c=>c.id==='vcStatus')?.show && <td>{renderVcStatus(row.vcStatus, row.vcId)}</td>}
                            </tr>
                        );
                    })}
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
                    {sortedItems.length > 0 ? (currentPage - 1) * rowsPerPage + 1 : 0}-{Math.min(currentPage * rowsPerPage, sortedItems.length)} of {sortedItems.length}
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
          <div className="action-bar"><button className="btn pri min-w-140" onClick={() => setActiveTab("SETTINGS")} disabled={selectedIds.size === 0}>Next</button></div>
        </>
      )}

      {activeTab === "SETTINGS" && (
        <>
          <div className="section">
            <div className="section-head"><span className="title">Snapshot Configuration</span></div>
            <div className="grid">
              <div className="field">
                <div className="meta"><label>Snapshot Name</label></div>
                <div className="inputwrap">
                    <input className="control" value={snapName} onChange={(e) => setSnapName(e.target.value)} disabled={processing} />
                </div>
              </div>
              <div className="field">
                <div className="meta"><label>Description</label></div>
                <div className="inputwrap">
                    <input className="control" value={description} onChange={(e) => setDescription(e.target.value)} disabled={processing} />
                </div>
              </div>
              <div className="field w-full flex-row gap-20 mt-10" style={{ alignItems: 'center' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                  <input type="checkbox" className="custom-checkbox" checked={includeMemory} onChange={(e) => setIncludeMemory(e.target.checked)} disabled={processing} /> <span style={{ fontWeight: 500, color: 'var(--text)' }}>Include Memory</span>
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                  <input type="checkbox" className="custom-checkbox" checked={quiesce} onChange={(e) => setQuiesce(e.target.checked)} disabled={processing} /> <span style={{ fontWeight: 500, color: 'var(--text)' }}>Quiesce Filesystem</span>
                </label>
              </div>
            </div>
          </div>
          {error && <div className="banner error">{error}</div>}
          <div className="action-bar justify-between" style={{ borderTop: '1px solid var(--border)' }}>
             <button className="btn outline" onClick={() => setActiveTab("TARGETS")} disabled={processing}>Back</button>
             <button className="btn pri min-w-140" onClick={handleExecute} disabled={processing || selectedIds.size === 0}>{processing ? "Starting..." : "Take Snapshot"}</button>
          </div>
        </>
      )}

      {activeTab === "EXECUTION" && (
        <div className="section">
          <div className="section-head" style={{ paddingBottom: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span className="title">Execution History (Snapshots)</span>
            <div style={{ display: 'flex', gap: '12px' }}>
                <div className="dropdown" ref={execColRef}>
                    <button className="btn outline sec small" onClick={() => { setShowExecColDrop(!showExecColDrop); setShowExecExpDrop(false); }}>
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16"><line x1="8" y1="6" x2="21" y2="6"></line><line x1="8" y1="12" x2="21" y2="12"></line><line x1="8" y1="18" x2="21" y2="18"></line><line x1="3" y1="6" x2="3.01" y2="6"></line><line x1="3" y1="12" x2="3.01" y2="12"></line><line x1="3" y1="18" x2="3.01" y2="18"></line></svg>
                        &nbsp; Columns
                    </button>
                    {showExecColDrop && (
                        <div className="dropdown-menu show" style={{ minWidth: "220px", padding: "12px", right: 0 }}>
                            <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                                {execCols.map((col, i) => (
                                    <label key={col.id} style={{ display: "flex", alignItems: "center", gap: "10px", cursor: "pointer", padding: "6px 12px", borderRadius: "4px" }} onMouseOver={e=>e.currentTarget.style.background="#f8fafc"} onMouseOut={e=>e.currentTarget.style.background="transparent"}>
                                        <input type="checkbox" className="custom-checkbox" checked={col.show} onChange={e => {
                                            const next = [...execCols]; next[i].show = e.target.checked; setExecCols(next);
                                        }} />
                                        <span style={{ fontSize: "13px", fontWeight: 500 }}>{col.label}</span>
                                    </label>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
                <div className="dropdown" ref={execExpRef}>
                    <button className="btn outline small" onClick={() => { setShowExecExpDrop(!showExecExpDrop); setShowExecColDrop(false); }}>
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"></path></svg>
                        &nbsp; Export
                    </button>
                    {showExecExpDrop && (
                        <div className="dropdown-menu show" style={{ width: "280px", padding: "16px", right: 0 }}>
                            <div style={{ fontSize: "11px", fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", marginBottom: "12px", letterSpacing: '0.05em' }}>Format</div>
                            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "8px", marginBottom: "20px" }}>
                               {['CSV', 'PDF', 'HTML', 'TXT', 'JSON', 'XML'].map(fmt => (
                                 <button key={fmt} className={`btn small ${execExportFormat === fmt ? 'pri' : 'outline'}`} style={{ fontSize: '11px', height: '32px', padding: 0 }} onClick={(e) => { e.stopPropagation(); setExecExportFormat(fmt); }}>{fmt}</button>
                               ))}
                            </div>
                            <div style={{ height: '1px', background: 'var(--border)', marginBottom: '16px' }}></div>
                            <div style={{ fontSize: "11px", fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", marginBottom: "12px", letterSpacing: '0.05em' }}>Scope</div>
                            <button className="item" onClick={() => handleExport('page', true)}>Current Page</button>
                            <button className="item" onClick={() => handleExport('filtered', true)}>Filtered Data</button>
                            <button className="item" onClick={() => handleExport('all', true)}>All Data</button>
                        </div>
                    )}
                </div>
            </div>
          </div>
          <div className="tableWrap border-top" style={{ borderRadius: 0, borderLeft: 'none', borderRight: 'none' }}>
            <table>
              <thead className="kpi-th-sticky">
                <tr>
                  {execCols.find(c=>c.id==='name')?.show && <th className="cursor-pointer" onClick={() => handleExecSort('name')}>Server Name{getSortIcon('name', execSortConfig)}</th>}
                  {execCols.find(c=>c.id==='snapName')?.show && <th className="cursor-pointer" onClick={() => handleExecSort('snapName')}>Snapshot Name{getSortIcon('snapName', execSortConfig)}</th>}
                  {execCols.find(c=>c.id==='taskId')?.show && <th className="cursor-pointer" onClick={() => handleExecSort('taskId')}>Task ID{getSortIcon('taskId', execSortConfig)}</th>}
                  {execCols.find(c=>c.id==='createdAt')?.show && <th className="cursor-pointer" onClick={() => handleExecSort('createdAt')}>Started{getSortIcon('createdAt', execSortConfig)}</th>}
                  {execCols.find(c=>c.id==='status')?.show && <th className="cursor-pointer" onClick={() => handleExecSort('status')}>Status{getSortIcon('status', execSortConfig)}</th>}
                </tr>
              </thead>
              <tbody>
                {execPaginatedItems.length === 0 ? (<tr><td colSpan={5} className="text-center p-20">No snapshots found.</td></tr>) : (
                  execPaginatedItems.map((ex, i) => (
                    <tr key={i}>
                      {execCols.find(c=>c.id==='name')?.show && <td>{ex.name}</td>}
                      {execCols.find(c=>c.id==='snapName')?.show && <td>{ex.snapName}</td>}
                      {execCols.find(c=>c.id==='taskId')?.show && <td>{ex.taskId || "-"}</td>}
                      {execCols.find(c=>c.id==='createdAt')?.show && <td>{ex.createdAt}</td>}
                      {execCols.find(c=>c.id==='status')?.show && <td>{renderExecStatus(ex.status)} {ex.error && <small className="text-danger d-block">{ex.error}</small>}</td>}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          <div className="pagination" style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", padding: "16px 20px", gap: "24px", background: 'var(--panel)' }}>
              <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                  <span className="pager-info" style={{ fontSize: "13px", color: "var(--muted)" }}>Rows per page:</span>
                  <select className="control" style={{ width: "70px", height: "32px", padding: '0 8px' }} value={execRowsPerPage} onChange={(e) => { setExecRowsPerPage(Number(e.target.value)); setExecCurrentPage(1); }}>
                      <option value={10}>10</option><option value={20}>20</option><option value={50}>50</option>
                  </select>
              </div>
              <span className="pager-info" style={{ fontSize: "13px", color: "var(--muted)" }}>
                  {sortedExecs.length > 0 ? (execCurrentPage - 1) * execRowsPerPage + 1 : 0}-{Math.min(execCurrentPage * execRowsPerPage, sortedExecs.length)} of {sortedExecs.length}
              </span>
              <div className="pager-btns" style={{ display: "flex", gap: "4px" }}>
                  <button className="pager-btn" disabled={execCurrentPage === 1} onClick={() => setExecCurrentPage(p => p - 1)}>&lt;</button>
                  <button className={`pager-btn ${execCurrentPage === 1 ? 'active' : ''}`} onClick={() => setExecCurrentPage(1)}>1</button>
                  {execTotalPages > 1 && <button className={`pager-btn ${execCurrentPage === 2 ? 'active' : ''}`} onClick={() => setExecCurrentPage(2)}>2</button>}
                  {execTotalPages > 2 && <span style={{ padding: '0 4px', color: 'var(--muted)' }}>..</span>}
                  {execTotalPages > 2 && execCurrentPage > 2 && execCurrentPage < execTotalPages && <button className="pager-btn active">{execCurrentPage}</button>}
                  {execTotalPages > 2 && <button className={`pager-btn ${execCurrentPage === execTotalPages ? 'active' : ''}`} onClick={() => setExecCurrentPage(execTotalPages)}>{execTotalPages}</button>}
                  <button className="pager-btn" disabled={execCurrentPage === execTotalPages || execTotalPages === 0} onClick={() => setExecCurrentPage(p => p + 1)}>&gt;</button>
              </div>
          </div>
        </div>
      )}
      
      <FilterDrawer isOpen={drawerOpen} onClose={() => setDrawerOpen(false)} filters={filters} setFilters={setFilters} globalLogic={globalLogic} setGlobalLogic={setGlobalLogic} propertyOptions={propertyOptions} />
    </div>
  );
}