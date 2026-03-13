// src/components/SnapshotSelector.jsx
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
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [search, setSearch] = useState("");
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

  const observer = useRef();
  const lastElementRef = useCallback(node => {
    if (isFetching) return;
    if (observer.current) observer.current.disconnect();
    observer.current = new IntersectionObserver(entries => { if (entries[0].isIntersecting && hasMore) setPage(prevPage => prevPage + 1); });
    if (node) observer.current.observe(node);
  }, [isFetching, hasMore]);

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
           setItems(prev => { const existIds = new Set(prev.map(i => i.name)); return [...prev, ...newItems.filter(i => !existIds.has(i.name))]; });
           resolveBatch(newItems);
        }
      } catch (e) { setError(e.message); } finally { setIsFetching(false); }
    };
    fetchData();
  }, [page, mode, selectedGroupId, search]);

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

  const toggleRow = (vcId) => {
    if (!vcId || processing) return;
    setSelectedIds((prev) => { const next = new Set(prev); if (next.has(vcId)) next.delete(vcId); else next.add(vcId); return next; });
  };

  const toggleAllLoaded = () => {
    if (processing) return;
    const validIds = items.filter((i) => i.vcId).map((i) => i.vcId);
    if (validIds.length === 0) return;
    const allLoadedSelected = validIds.every(id => selectedIds.has(id));
    setSelectedIds(prev => { const next = new Set(prev); validIds.forEach(id => allLoadedSelected ? next.delete(id) : next.add(id)); return next; });
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
      <div className="topbar">
        <div className="flex-row gap-10 items-center">
           <h2>Take Snapshot</h2>
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
            <button className={`tab small ${mode === "GROUP" ? "active" : ""}`} onClick={() => setMode("GROUP")} disabled={processing}>By Groups</button>
            <button className={`tab small ${mode === "COMPUTER" ? "active" : ""}`} onClick={() => setMode("COMPUTER")} disabled={processing}>By Computers</button>
          </div>

          <div className="section overflow-visible">
            <div className="controls-grid">
              {mode === "GROUP" ? (
                <FancyDropdown options={groups} value={selectedGroupId} onChange={setSelectedGroupId} placeholder="-- Select Group --" disabled={processing} />
              ) : (
                <div className="field w-full">
                   <div className="inputwrap">
                     <input className="control" placeholder="Search Servers..." value={search} onChange={e => setSearch(e.target.value)} />
                   </div>
                </div>
              )}
            </div>
          </div>

          <div className="section">
            <div className="section-head">
              <span className="title">Select VMs</span>
              <span className="pill green">Selected: {selectedIds.size}</span>
            </div>
            <div className="tableWrap h-400">
              <table>
                <thead className="kpi-th-sticky">
                  <tr>
                    <th className="w-40 text-center"><input type="checkbox" className="custom-checkbox" onChange={toggleAllLoaded} disabled={items.length === 0 || processing} /></th>
                    <th>Hostname</th><th>IP Address</th><th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((row, i) => {
                      const isLast = items.length === i + 1;
                      const isReady = row.vcStatus === 'ready';
                      return (
                          <tr key={i} ref={isLast ? lastElementRef : null} className={!isReady ? "disabled" : selectedIds.has(row.vcId) ? "selected" : ""} onClick={() => toggleRow(row.vcId)}>
                            <td className="text-center"><input type="checkbox" className="custom-checkbox pointer-events-none" checked={selectedIds.has(row.vcId)} disabled={!isReady || processing} readOnly /></td>
                            <td>{row.name}</td><td>{row.ips?.join(", ") || "-"}</td><td>{renderVcStatus(row.vcStatus, row.vcId)}</td>
                          </tr>
                      );
                  })}
                  {isFetching && <tr><td colSpan={4} className="text-center p-10">Loading...</td></tr>}
                  {!isFetching && items.length === 0 && <tr><td colSpan={4} className="text-center p-20">No computers found.</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
          <div className="action-bar">
             <button className="btn pri min-w-140" onClick={() => setActiveTab("SETTINGS")} disabled={selectedIds.size === 0}>Next</button>
          </div>
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
          <div className="action-bar justify-between">
             <button className="btn outline" onClick={() => setActiveTab("TARGETS")} disabled={processing}>Back</button>
             <button className="btn pri min-w-140" onClick={handleExecute} disabled={processing || selectedIds.size === 0}>{processing ? "Starting..." : "Take Snapshot"}</button>
          </div>
        </>
      )}

      {activeTab === "EXECUTION" && (
        <div className="section">
          <div className="section-head">
            <span className="title">Execution History (Snapshots)</span>
            <button className="iconbtn" onClick={refreshHistory} disabled={processing} title="Refresh">
               <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="18" height="18"><polyline points="23 4 23 10 17 10"></polyline><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path></svg>
            </button>
          </div>
          <div className="tableWrap">
            <table>
              <thead className="kpi-th-sticky"><tr><th>Server Name</th><th>Snapshot Name</th><th>Task ID</th><th>Started</th><th>Status</th></tr></thead>
              <tbody>
                {executions.length === 0 ? (<tr><td colSpan={5} className="text-center p-20">No snapshots found.</td></tr>) : (
                  executions.map((ex, i) => (
                    <tr key={i}>
                      <td>{ex.name}</td><td>{ex.snapName}</td><td>{ex.taskId || "-"}</td><td>{ex.createdAt}</td>
                      <td>{renderExecStatus(ex.status)} {ex.error && <small className="text-danger d-block">{ex.error}</small>}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}