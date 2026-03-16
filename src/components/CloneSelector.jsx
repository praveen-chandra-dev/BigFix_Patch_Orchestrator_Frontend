// src/components/CloneSelector.jsx
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

const FancySelect = ({ label, options, value, onChange, placeholder, disabled, isLoading }) => {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    const handleClickOutside = (event) => { if (ref.current && !ref.current.contains(event.target)) setOpen(false); };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);
  const selectedLabel = options.find((o) => o.value === value)?.label || placeholder;
  return (
    <div className="field flex-1 min-w-200" ref={ref}>
      {label && <div className="meta"><label>{label}</label></div>}
      <div className="inputwrap">
          <div className={`fx-wrap flex-1 ${open ? "fx-open" : ""} ${disabled ? "disabled" : ""}`}>
            <button type="button" className="fx-trigger" onClick={() => !disabled && setOpen(!open)} disabled={disabled || isLoading}>
              <span className="fx-value">{isLoading ? "Loading..." : selectedLabel}</span>
              <span className="fx-chevron">▾</span>
            </button>
            {open && (
              <div className="fx-menu">
                <div className="fx-menu-inner">
                    {options.length === 0 ? (
                    <div className="fx-item empty">No Options Found</div>
                    ) : (
                    options.map((opt) => (
                        <div key={opt.value} className={`fx-item ${value === opt.value ? "active" : ""}`} onClick={() => { onChange(opt.value); setOpen(false); }}>
                        {opt.label}
                        </div>
                    ))
                    )}
                </div>
              </div>
            )}
          </div>
      </div>
    </div>
  );
};

export default function CloneManager({ onClose, groupName: initialGroup, onComplete, environment }) {
  const [activeTab, setActiveTab] = useState("TARGETS");
  const [mode, setMode] = useState(initialGroup ? "GROUP" : "COMPUTER");
  const [items, setItems] = useState([]);
  const [groups, setGroups] = useState([]);
  const [selectedGroupId, setSelectedGroupId] = useState("");
  const [selectedIds, setSelectedIds] = useState(new Set()); 
  const [isFetching, setIsFetching] = useState(false);
  const [lastUpdated, setLastUpdated] = useState("");
  const [execLastUpdated, setExecLastUpdated] = useState("");

  // Toolbar, Pagination & Sorting State
  const [currentPage, setCurrentPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [sortConfig, setSortConfig] = useState({ key: null, direction: "asc" });
  const [showColDrop, setShowColDrop] = useState(false);
  const [showExpDrop, setShowExpDrop] = useState(false);
  
  const [execCurrentPage, setExecCurrentPage] = useState(1);
  const [execRowsPerPage, setExecRowsPerPage] = useState(10);
  const [execSortConfig, setExecSortConfig] = useState({ key: null, direction: "asc" });
  const [showExecColDrop, setShowExecColDrop] = useState(false);
  const [showExecExpDrop, setShowExecExpDrop] = useState(false);

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
    { id: 'name', label: 'Original', show: true },
    { id: 'backupName', label: 'Clone Name', show: true },
    { id: 'createdAt', label: 'Time', show: true },
    { id: 'status', label: 'Status', show: true }
  ]);

  const propertyOptions = activeTab === 'EXECUTION' ? [
    { value: "name", label: "Original" },
    { value: "backupName", label: "Clone Name" },
    { value: "status", label: "Status" }
  ] : [
    { value: "name", label: "Hostname" },
    { value: "ips", label: "IP Address" },
    { value: "vcStatus", label: "Status" }
  ];

  const [inventory, setInventory] = useState({ datacenters: [], hosts: [], datastores: [], folders: [], osSpecs: [] });
  const [invLoading, setInvLoading] = useState(false);
  const [globalDest, setGlobalDest] = useState({ datacenter: "", host: "", datastore: "", folder: "", osSpec: "" });
  const [vmConfigs, setVmConfigs] = useState({});
  const [bulkIp, setBulkIp] = useState("10.1.153.138");
  const [bulkSubnet, setBulkSubnet] = useState("255.255.254.0");
  const [bulkGateway, setBulkGateway] = useState("10.1.152.1");
  const [bulkDns, setBulkDns] = useState("10.1.50.2");

  const [error, setError] = useState("");
  const [processing, setProcessing] = useState(false);
  const [executions, setExecutions] = useState([]); 

  // Communicate with Header.jsx
  useEffect(() => { window.dispatchEvent(new CustomEvent('sync:clone_tab', { detail: activeTab })); }, [activeTab]);
  useEffect(() => { 
      const handler = (e) => {
          setActiveTab(e.detail);
          setFilters([]); 
      };
      window.addEventListener('nav:clone', handler); 
      return () => window.removeEventListener('nav:clone', handler); 
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
        const gRes = await getJSON("/api/groups/list");
        if (gRes.ok) {
          setGroups(gRes.groups.map((g) => ({ value: g.id, label: g.name })));
          if (initialGroup) { const found = gRes.groups.find((g) => g.name === initialGroup); if (found) setSelectedGroupId(found.id); }
        }
      } catch (e) {}
      setInvLoading(true);
      try {
        const invRes = await getJSON("/api/vcenter/inventory");
        if (invRes.ok && invRes.inventory) {
           const i = invRes.inventory;
           setInventory({
             datacenters: i.datacenters.map(x => ({ value: x.id, label: x.name })),
             hosts: i.hosts.map(x => ({ value: x.id, label: x.name })),
             datastores: i.datastores.map(x => ({ value: x.id, label: `${x.name} (${x.type})` })),
             folders: i.folders.map(x => ({ value: x.id, label: x.name })),
             osSpecs: i.osSpecs.map(x => ({ value: x.name, label: x.name })),
           });
        }
      } catch (e) {} finally { setInvLoading(false); }
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
      if (!targets.length) return;
      setItems(prev => prev.map(i => batchItems.some(b => b.name === i.name) ? { ...i, vcStatus: 'resolving' } : i));
      try {
          const look = await postJSON("/api/vcenter/lookup", { targets });
          const resultMap = new Map();
          (look.matches || []).forEach(m => { if (m.name && m.id) resultMap.set(m.name, m.id); });
          setItems(prev => prev.map(i => {
             if (batchItems.some(b => b.name === i.name)) {
                 const vcId = resultMap.get(i.name);
                 return { ...i, vcId: vcId || null, vcStatus: vcId ? 'ready' : 'not_found' };
             }
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
    setSelectedIds(prev => { const next = new Set(prev); next.has(vcId) ? next.delete(vcId) : next.add(vcId); return next; });
  };

  const toggleAllVisible = () => {
    if (processing) return;
    const validIds = sortedItems.filter(i => i.vcStatus === 'ready' && i.vcId).map(i => i.vcId);
    if (validIds.length === 0) return;
    const allSelected = validIds.every(id => selectedIds.has(id));
    setSelectedIds(prev => { 
        const next = new Set(prev); 
        validIds.forEach(id => allSelected ? next.delete(id) : next.add(id)); 
        return next; 
    });
  };

  const activeFilterCount = filters.reduce((acc, b) => acc + b.conds.filter(c => c.value).length, 0);

  const handleExport = (fmt, isExec) => { 
    if (isExec) setShowExecExpDrop(false); else setShowExpDrop(false); 
    if (fmt === 'CSV') {
        const columns = isExec ? execCols : cols;
        const dataToExport = isExec ? sortedExecs : sortedItems;
        const header = columns.filter(c => c.show).map(c => c.label);
        const rows = dataToExport.map(p => columns.filter(c => c.show).map(c => {
           let val = p[c.id];
           if (!isExec && c.id === 'ips') val = Array.isArray(p.ips) ? p.ips.join(", ") : "";
           if (!isExec && c.id === 'vcStatus') val = p.vcStatus === 'ready' ? 'Ready' : p.vcStatus === 'resolving' ? 'Resolving' : p.vcStatus === 'not_found' ? 'Not Found' : 'Pending';
           return `"${val || ""}"`;
        }));
        const csv = [header.join(','), ...rows.map(r => r.join(','))].join('\n');
        const blob = new Blob([csv], { type: "text/csv" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url; a.download = isExec ? "clone_history.csv" : "clone_targets.csv"; a.click();
    }
  };

  useEffect(() => {
    if (activeTab === "SETTINGS") {
        setVmConfigs(prev => {
            const next = { ...prev };
            selectedIds.forEach(id => {
                if (!next[id]) {
                    const original = items.find(i => i.vcId === id);
                    next[id] = { cloneName: original ? `${original.name}-clone` : "", newIp: "", subnet: bulkSubnet, gateway: bulkGateway, dns: bulkDns };
                }
            });
            return next;
        });
    }
  }, [activeTab, selectedIds, items]);

  const applyBulkSettings = () => {
    const incrementIp = (ip, add) => {
        const parts = ip.split('.').map(Number);
        if (parts.length !== 4 || parts.some(isNaN)) return ip;
        let val = (parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3];
        val = (val + add) >>> 0;
        return [(val >>> 24) & 255, (val >>> 16) & 255, (val >>> 8) & 255, val & 255].join('.');
    };
    setVmConfigs(prev => {
        const next = { ...prev }; let index = 0; const sortedIds = Array.from(selectedIds); 
        sortedIds.forEach(id => { if (next[id]) { next[id] = { ...next[id], subnet: bulkSubnet, gateway: bulkGateway, dns: bulkDns, newIp: bulkIp ? incrementIp(bulkIp, index) : next[id].newIp }; index++; } });
        return next;
    });
  };

  const updateVmConfig = (id, field, value) => { setVmConfigs(prev => ({ ...prev, [id]: { ...prev[id], [field]: value } })); };

  const handleExecute = async () => {
    if (selectedIds.size === 0) return;
    setProcessing(true); setError(""); setActiveTab("EXECUTION");
    const clonesPayload = [];
    selectedIds.forEach(id => {
        const item = items.find(i => i.vcId === id); const conf = vmConfigs[id] || {};
        if (item) clonesPayload.push({ id: item.vcId, name: item.name, cloneName: conf.cloneName, newIp: conf.newIp, subnet: conf.subnet, gateway: conf.gateway, dns: conf.dns });
    });
    try {
      const res = await postJSON("/api/vcenter/clone", { global: globalDest, clones: clonesPayload });
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
        const mapped = res.history.filter(h => h.Type === 'Clone').map(h => ({ id: h.VmId, taskId: h.TaskId, name: h.VmName, backupName: h.SnapshotName, status: h.Status, error: h.Error, createdAt: new Date(h.CreatedAt).toLocaleString() }));
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
      const st = String(s).toLowerCase();
      if (st === 'completed' || st === 'success') return <span className="pill green">Success</span>;
      if (st === 'running') return <span className="pill blue">Running...</span>;
      if (st === 'queued') return <span className="pill gray">Queued...</span>;
      return <span className="pill red">Failed</span>;
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
               <h2 className="m-0">Clone Manager</h2>
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
            <button className={`tab small ${mode === "GROUP" ? "active" : ""}`} onClick={() => setMode("GROUP")} disabled={processing}>By Group</button>
            <button className={`tab small ${mode === "COMPUTER" ? "active" : ""}`} onClick={() => setMode("COMPUTER")} disabled={processing}>All Servers</button>
          </div>
          
          {mode === "GROUP" && (
            <div className="section overflow-visible">
              <div className="controls-grid">
                  <FancySelect label="Select Group" options={groups} value={selectedGroupId} onChange={setSelectedGroupId} placeholder="-- Select Group --" disabled={processing} />
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
                                <div style={{ fontSize: "11px", fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", marginBottom: "12px" }}>Format</div>
                                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "8px", marginBottom: "20px" }}>
                                   {['CSV', 'PDF', 'HTML', 'TXT', 'JSON', 'XML'].map(fmt => (
                                     <button key={fmt} className="btn outline small" style={{ fontSize: '11px', height: '32px' }} onClick={() => handleExport(fmt, false)}>{fmt}</button>
                                   ))}
                                </div>
                                <div style={{ height: '1px', background: 'var(--border)', marginBottom: '16px' }}></div>
                                <div style={{ fontSize: "11px", fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", marginBottom: "12px" }}>Scope</div>
                                <button className="item" onClick={() => handleExport('CSV', false)}>Filtered Data</button>
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
                    {paginatedItems.map((row, i) => (
                      <tr key={i} onClick={() => toggleRow(row.vcId)} className={selectedIds.has(row.vcId) ? "selected-row cursor-pointer" : row.vcStatus !== 'ready' ? 'disabled' : 'cursor-pointer'}>
                        <td className="text-center"><input type="checkbox" className="custom-checkbox no-events" checked={selectedIds.has(row.vcId)} readOnly /></td>
                        {cols.find(c=>c.id==='name')?.show && <td>{row.name}</td>}
                        {cols.find(c=>c.id==='ips')?.show && <td>{row.ips?.join(", ")}</td>}
                        {cols.find(c=>c.id==='vcStatus')?.show && <td>{renderVcStatus(row.vcStatus, row.vcId)}</td>}
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
          <div className="action-bar"><button className="btn pri min-w-140" onClick={() => setActiveTab("SETTINGS")} disabled={!selectedIds.size}>Next</button></div>
        </>
      )}

      {activeTab === "SETTINGS" && (
        <>
          <div className="section overflow-visible">
            <div className="section-head"><span className="title">1. Destination (Global)</span></div>
            <div className="controls-grid">
               <FancySelect label="Datacenter" options={inventory.datacenters} value={globalDest.datacenter} onChange={v=>setGlobalDest(p=>({...p,datacenter:v}))} placeholder="Select DC" isLoading={invLoading} />
               <FancySelect label="Cluster/Host" options={inventory.hosts} value={globalDest.host} onChange={v=>setGlobalDest(p=>({...p,host:v}))} placeholder="Select Host" isLoading={invLoading} />
               <FancySelect label="Datastore" options={inventory.datastores} value={globalDest.datastore} onChange={v=>setGlobalDest(p=>({...p,datastore:v}))} placeholder="Select DS" isLoading={invLoading} />
               <FancySelect label="VM Folder" options={inventory.folders} value={globalDest.folder} onChange={v=>setGlobalDest(p=>({...p,folder:v}))} placeholder="Select Folder" isLoading={invLoading} />
               <FancySelect label="OS Spec" options={inventory.osSpecs} value={globalDest.osSpec} onChange={v=>setGlobalDest(p=>({...p,osSpec:v}))} placeholder="Select Spec" isLoading={invLoading} />
            </div>
          </div>
          <div className="section">
            <div className="section-head"><span className="title">2. Network Configuration</span></div>
            <div className="grid">
               <div className="field">
                   <div className="meta"><label>Start IP</label></div>
                   <div className="inputwrap"><input className="control" value={bulkIp} onChange={e=>setBulkIp(e.target.value)} placeholder="10.1.x.x" /></div>
               </div>
               <div className="field">
                   <div className="meta"><label>Subnet</label></div>
                   <div className="inputwrap"><input className="control" value={bulkSubnet} onChange={e=>setBulkSubnet(e.target.value)} /></div>
               </div>
               <div className="field">
                   <div className="meta"><label>Gateway</label></div>
                   <div className="inputwrap"><input className="control" value={bulkGateway} onChange={e=>setBulkGateway(e.target.value)} /></div>
               </div>
               <div className="field">
                   <div className="meta"><label>DNS</label></div>
                   <div className="inputwrap"><input className="control" value={bulkDns} onChange={e=>setBulkDns(e.target.value)} /></div>
               </div>
            </div>
            <div className="action-bar" style={{borderTop: 'none', paddingTop: 0, paddingBottom: '20px', justifyContent: 'flex-start', background: 'transparent'}}>
                <button className="btn outline" onClick={applyBulkSettings}>Apply to All Rows</button>
            </div>
            <div className="tableWrap h-400 border-top" style={{ borderRadius: 0, borderLeft: 'none', borderRight: 'none' }}>
              <table>
                <thead className="kpi-th-sticky"><tr><th>Original VM</th><th>Clone Name</th><th>New IP</th><th>Subnet</th><th>Gateway</th><th>DNS</th></tr></thead>
                <tbody>
                  {Array.from(selectedIds).map(id => {
                     const item = items.find(i => i.vcId === id); const conf = vmConfigs[id] || {}; if (!item) return null;
                     return (
                       <tr key={id}>
                         <td className="fw-800">{item.name}</td>
                         <td><input className="table-input" value={conf.cloneName} onChange={e=>updateVmConfig(id,'cloneName',e.target.value)} /></td>
                         <td><input className={`table-input ${!conf.newIp ? 'border-danger' : ''}`} value={conf.newIp} onChange={e=>updateVmConfig(id,'newIp',e.target.value)} /></td>
                         <td><input className="table-input" value={conf.subnet} onChange={e=>updateVmConfig(id,'subnet',e.target.value)} /></td>
                         <td><input className="table-input" value={conf.gateway} onChange={e=>updateVmConfig(id,'gateway',e.target.value)} /></td>
                         <td><input className="table-input" value={conf.dns} onChange={e=>updateVmConfig(id,'dns',e.target.value)} /></td>
                       </tr>
                     );
                  })}
                </tbody>
              </table>
            </div>
          </div>
          {error && <div className="banner error">{error}</div>}
          <div className="action-bar justify-between">
              <button className="btn outline" onClick={() => setActiveTab("TARGETS")} disabled={processing}>Back</button>
              <button className="btn pri min-w-140" onClick={handleExecute} disabled={processing || !globalDest.datacenter}>{processing ? "Cloning..." : `Start Cloning (${selectedIds.size} VMs)`}</button>
          </div>
        </>
      )}

      {activeTab === "EXECUTION" && (
        <div className="section">
          <div className="section-head" style={{ paddingBottom: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span className="title">Execution History (Clones)</span>
            </div>
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
                                    <label key={col.id} style={{ display: "flex", alignItems: "center", gap: "10px", cursor: "pointer", padding: "6px 12px", borderRadius: "4px", transition: "0.2s" }} onMouseOver={e=>e.currentTarget.style.background="#f8fafc"} onMouseOut={e=>e.currentTarget.style.background="transparent"}>
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
                            <div style={{ fontSize: "11px", fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", marginBottom: "12px" }}>Format</div>
                            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "8px", marginBottom: "20px" }}>
                               {['CSV', 'PDF', 'HTML', 'TXT', 'JSON', 'XML'].map(fmt => (
                                 <button key={fmt} className="btn outline small" style={{ fontSize: '11px', height: '32px' }} onClick={() => handleExport(fmt, true)}>{fmt}</button>
                               ))}
                            </div>
                            <div style={{ height: '1px', background: 'var(--border)', marginBottom: '16px' }}></div>
                            <div style={{ fontSize: "11px", fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", marginBottom: "12px" }}>Scope</div>
                            <button className="item" onClick={() => handleExport('CSV', true)}>Filtered Data</button>
                        </div>
                    )}
                </div>
            </div>
          </div>
          <div className="tableWrap border-top" style={{ borderRadius: 0, borderLeft: 'none', borderRight: 'none' }}>
            <table>
              <thead className="kpi-th-sticky">
                <tr>
                  {execCols.find(c=>c.id==='name')?.show && <th className="cursor-pointer" onClick={() => handleExecSort('name')}>Original{getSortIcon('name', execSortConfig)}</th>}
                  {execCols.find(c=>c.id==='backupName')?.show && <th className="cursor-pointer" onClick={() => handleExecSort('backupName')}>Clone Name{getSortIcon('backupName', execSortConfig)}</th>}
                  {execCols.find(c=>c.id==='createdAt')?.show && <th className="cursor-pointer" onClick={() => handleExecSort('createdAt')}>Time{getSortIcon('createdAt', execSortConfig)}</th>}
                  {execCols.find(c=>c.id==='status')?.show && <th className="cursor-pointer" onClick={() => handleExecSort('status')}>Status{getSortIcon('status', execSortConfig)}</th>}
                </tr>
              </thead>
              <tbody>
                {execPaginatedItems.length === 0 ? (<tr><td colSpan={4} className="text-center p-20">No clones found.</td></tr>) : (
                  execPaginatedItems.map((x, i) => (
                    <tr key={i}>
                      {execCols.find(c=>c.id==='name')?.show && <td>{x.name}</td>}
                      {execCols.find(c=>c.id==='backupName')?.show && <td>{x.backupName}</td>}
                      {execCols.find(c=>c.id==='createdAt')?.show && <td>{x.createdAt}</td>}
                      {execCols.find(c=>c.id==='status')?.show && <td>{renderExecStatus(x.status)}</td>}
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