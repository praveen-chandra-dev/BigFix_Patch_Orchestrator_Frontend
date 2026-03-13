// src/components/CloneSelector.jsx
import { useState, useEffect, useRef, useCallback } from "react";

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
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [search, setSearch] = useState("");
  const [isFetching, setIsFetching] = useState(false);

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

  const observer = useRef();
  const lastElementRef = useCallback(node => {
    if (isFetching) return;
    if (observer.current) observer.current.disconnect();
    observer.current = new IntersectionObserver(entries => { if (entries[0].isIntersecting && hasMore) setPage(p => p + 1); });
    if (node) observer.current.observe(node);
  }, [isFetching, hasMore]);

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

  useEffect(() => { setItems([]); setPage(1); setHasMore(true); setSelectedIds(new Set()); }, [mode, selectedGroupId, search]);

  useEffect(() => {
    if (mode === "GROUP" && !selectedGroupId) return;
    const fetchData = async () => {
      setIsFetching(true); setError("");
      try {
        let newItems = [];
        if (mode === "GROUP") {
          if (page === 1) { 
              const g = groups.find((x) => x.value === selectedGroupId);
              if (g) { const res = await getJSON(`/api/groups/${encodeURIComponent(g.label)}/members`); newItems = res.members || []; setHasMore(false); }
          }
        } else {
          const res = await getJSON(`/api/groups/metadata/computers?page=${page}&limit=20&search=${encodeURIComponent(search)}`);
          if (res.ok) { newItems = res.computers.map(c => ({ ...c, vcId: null, vcStatus: 'pending' })); setHasMore(page < res.totalPages); }
        }
        if (newItems.length > 0) {
           setItems(prev => { const exist = new Set(prev.map(i => i.name)); return [...prev, ...newItems.filter(i => !exist.has(i.name))]; });
           resolveBatch(newItems);
        }
      } catch (e) { setError(e.message); } finally { setIsFetching(false); }
    };
    fetchData();
  }, [page, mode, selectedGroupId, search]);

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

  const toggleRow = (vcId) => {
    if (!vcId || processing) return;
    setSelectedIds(prev => { const next = new Set(prev); next.has(vcId) ? next.delete(vcId) : next.add(vcId); return next; });
  };

  const toggleAllLoaded = () => {
    if (processing) return;
    const validIds = items.filter((i) => i.vcId).map((i) => i.vcId);
    if (!validIds.length) return;
    const allSelected = validIds.every(id => selectedIds.has(id));
    setSelectedIds(prev => { const next = new Set(prev); validIds.forEach(id => allSelected ? next.delete(id) : next.add(id)); return next; });
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
      <div className="topbar">
        <div className="flex-row gap-10 items-center">
           <h2>Clone Manager</h2>
           {environment && <span className="pill gray">{environment.toUpperCase()}</span>}
        </div>
        <button className="btn" onClick={onClose}>Close</button>
      </div>
      <div className="tabs">
        <button className={`tab ${activeTab === "TARGETS" ? "active" : ""}`} onClick={() => setActiveTab("TARGETS")}>1. Targets</button>
        <button className={`tab ${activeTab === "SETTINGS" ? "active" : ""}`} onClick={() => setActiveTab("SETTINGS")}>2. Settings</button>
        <button className={`tab ${activeTab === "EXECUTION" ? "active" : ""}`} onClick={() => setActiveTab("EXECUTION")}>3. Execution</button>
      </div>
      
      {activeTab === "TARGETS" && (
        <>
          <div className="tabs sub">
            <button className={`tab small ${mode === "GROUP" ? "active" : ""}`} onClick={() => setMode("GROUP")} disabled={processing}>By Group</button>
            <button className={`tab small ${mode === "COMPUTER" ? "active" : ""}`} onClick={() => setMode("COMPUTER")} disabled={processing}>All Servers</button>
          </div>
          <div className="section overflow-visible">
            <div className="controls-grid">
              {mode === "GROUP" ? (
                <FancySelect label="Select Group" options={groups} value={selectedGroupId} onChange={setSelectedGroupId} placeholder="-- Select Group --" disabled={processing} />
              ) : (
                <div className="field w-full">
                    <div className="meta"><label>Search</label></div>
                    <div className="inputwrap"><input className="control" value={search} onChange={e => setSearch(e.target.value)} /></div>
                </div>
              )}
            </div>
          </div>
          <div className="section">
            <div className="section-head"><span className="title">Select VMs</span> <span className="pill green">Selected: {selectedIds.size}</span></div>
            <div className="tableWrap h-400">
              <table>
                <thead className="kpi-th-sticky"><tr><th className="w-40 text-center"><input type="checkbox" className="custom-checkbox" onChange={toggleAllLoaded} disabled={!items.length}/></th><th>Hostname</th><th>IP</th><th>Status</th></tr></thead>
                <tbody>
                  {items.map((row, i) => (
                    <tr key={i} ref={items.length === i+1 ? lastElementRef : null} onClick={() => toggleRow(row.vcId)} className={selectedIds.has(row.vcId) ? "selected" : row.vcStatus !== 'ready' ? 'disabled' : ''}>
                      <td className="text-center"><input type="checkbox" className="custom-checkbox pointer-events-none" checked={selectedIds.has(row.vcId)} readOnly /></td>
                      <td>{row.name}</td><td>{row.ips?.join(", ")}</td><td>{renderVcStatus(row.vcStatus, row.vcId)}</td>
                    </tr>
                  ))}
                  {isFetching && <tr><td colSpan={4} className="text-center p-10">Loading...</td></tr>}
                </tbody>
              </table>
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
            <div className="tableWrap h-400">
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
          <div className="section-head">
              <span className="title">Execution History (Clones)</span>
              <button className="iconbtn" onClick={() => refreshHistory()} disabled={processing} title="Refresh">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="18" height="18"><polyline points="23 4 23 10 17 10"></polyline><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path></svg>
              </button>
          </div>
          <div className="tableWrap">
            <table>
              <thead className="kpi-th-sticky"><tr><th>Original</th><th>Clone Name</th><th>Time</th><th>Status</th></tr></thead>
              <tbody>{executions.map((x,i) => (<tr key={i}><td>{x.name}</td><td>{x.backupName}</td><td>{x.createdAt}</td><td>{renderExecStatus(x.status)}</td></tr>))}</tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}