// src/components/KpiDetails.jsx
import { useState, useEffect, useMemo, useRef } from "react";
import FilterDrawer from "./FilterDrawer";

const API_BASE = window.env?.VITE_API_BASE || "http://localhost:5174";
const RPP_OPTIONS = [{value: 10, label: "10"}, {value: 20, label: "20"}, {value: 50, label: "50"}, {value: 10000, label: "All"}];

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
  try { return JSON.parse(t); } catch { throw new Error(`Unexpected (not JSON): ${t.slice(0, 400)}`); }
}

async function postJSON(url, body) {
  const r = await fetch(url, {
    method: "POST",
    headers: getHeaders(),
    body: JSON.stringify(body),
  });
  const t = await r.text();
  let j; try { j = JSON.parse(t); } catch { throw new Error(`Unexpected response: ${t.slice(0, 400)}`); }
  if (!r.ok || j?.ok === false) throw new Error(j?.error || j?.message || `HTTP ${r.status}`);
  return j;
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

function ConfirmationModal({ open, title, children, onClose, onConfirm, busy = false }) {
  if (!open) return null;
  return (
    <div className="modal show" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="box max-w-520" onClick={(e) => e.stopPropagation()}>
        <h3 className="kpi-modal-title">{title || "Confirm Action"}</h3>
        <div className="sub kpi-confirm-sub">{children}</div>
        <div className="flex-row justify-end gap-8 mt-10">
          <button type="button" className="btn" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="button" className="btn pri" onClick={onConfirm} disabled={busy}>{busy ? "Processing..." : "Confirm"}</button>
        </div>
      </div>
    </div>
  );
}

const FancySelect = ({ label, options, value, onChange, disabled, placeholder, searchable, isLoading, width = '100%', menuPlacement = 'bottom' }) => {
  const [open, setOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const wrapperRef = useRef(null);
  const searchInputRef = useRef(null);

  useEffect(() => {
    function handleClickOutside(event) { 
      if (wrapperRef.current && !wrapperRef.current.contains(event.target)) {
        setOpen(false);
        setSearchTerm("");
      }
    }
    document.addEventListener("mousedown", handleClickOutside); 
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    if (open && searchable && searchInputRef.current) searchInputRef.current.focus();
  }, [open, searchable]);

  const selectedOption = options.find(o => String(o.value) === String(value));
  const displayText = isLoading ? "Loading..." : (selectedOption ? selectedOption.label : (placeholder || "—"));
  const isPlaceholder = !selectedOption && !isLoading;

  const filteredOptions = searchable && searchTerm.trim() !== ""
    ? options.filter(opt => String(opt.label).toLowerCase().includes(searchTerm.toLowerCase()))
    : options;

  return (
    <div className="field m-0" style={{ width }}>
      {label && <span className="label">{label}</span>}
      <div className={`fx-wrap flex-1 ${open ? "fx-open" : ""} ${(disabled || isLoading) ? "disabled" : ""}`} ref={wrapperRef} style={{ position: 'relative' }}>
        <button 
            type="button" 
            className="fx-trigger" 
            onClick={() => !disabled && !isLoading && setOpen(!open)} 
            style={{ 
                height: '32px', minHeight: '32px', padding: '0 10px', 
                background: (disabled || isLoading) ? 'var(--bg)' : 'var(--panel)',
                border: '1px solid var(--border)', borderRadius: '4px',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                width: '100%', cursor: disabled ? 'not-allowed' : 'pointer'
            }} 
            disabled={disabled || isLoading}
        >
          <span className={`fx-value ${isPlaceholder ? "fx-placeholder" : ""}`} title={String(displayText)} style={{ fontSize: '13px', fontWeight: 500, color: (disabled || isLoading) ? 'var(--muted)' : 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {String(displayText)}
          </span>
          <span className="fx-chevron" style={{ fontSize: '10px', marginLeft: '8px', color: 'var(--text)' }}>▼</span>
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
            {searchable && (
              <div style={{ padding: '6px 8px', borderBottom: '1px solid var(--border)', position: 'sticky', top: 0, background: 'var(--panel)', zIndex: 2, borderRadius: '6px 6px 0 0' }}>
                <input 
                  ref={searchInputRef} type="text" className="control" placeholder="Search..." 
                  value={searchTerm} onChange={e => setSearchTerm(e.target.value)} onClick={e => e.stopPropagation()} 
                  style={{ width: '100%', height: '28px', fontSize: '12px', padding: '0 8px' }} 
                />
              </div>
            )}
            <div className="fx-menu-inner" style={{ maxHeight: '200px', overflowY: 'auto' }}>
              {filteredOptions.length === 0 ? ( <div className="fx-item fx-empty" style={{ fontSize: '13px', padding: '8px' }}>No options</div> ) : (
                filteredOptions.map((opt) => (
                  <div key={opt.value} className={`fx-item ${String(value) === String(opt.value) ? "fx-active" : ""}`} onClick={() => { onChange(opt.value); setOpen(false); setSearchTerm(""); }} style={{ padding: '8px 12px', fontSize: '13px', cursor: 'pointer', background: String(value) === String(opt.value) ? 'var(--bg)' : 'transparent', color: String(value) === String(opt.value) ? 'var(--primary)' : 'var(--text)', whiteSpace: 'nowrap' }} onMouseOver={e => String(value) !== String(opt.value) && (e.currentTarget.style.background = 'var(--bg)')} onMouseOut={e => String(value) !== String(opt.value) && (e.currentTarget.style.background = 'transparent')}>
                    <span className="fx-label">{opt.label}</span>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default function KpiDetails({ context, activeTab }) {
  const type = (typeof context === 'object' ? context?.type : (typeof context === 'string' ? context : null)) || activeTab || 'health';
  const groupName = context?.group || '';
  const actionId = context?.id || null;

  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [lastUpdated, setLastUpdated] = useState("");

  const [selectedReboots, setSelectedReboots] = useState(new Set());
  const [selectedHealth, setSelectedHealth] = useState(new Set());
  
  const [actionStatus, setActionStatus] = useState({});
  const [confirmRestart, setConfirmRestart] = useState(null);
  const [confirmService, setConfirmService] = useState(null);
  
  const [confirmBulkReboot, setConfirmBulkReboot] = useState(false);
  const [bulkRebootStatus, setBulkRebootStatus] = useState("");
  
  const [confirmBulkService, setConfirmBulkService] = useState(false);
  const [bulkServiceStatus, setBulkServiceStatus] = useState("");

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

  const userRole = sessionStorage.getItem("user_role") || "Admin";
  const showService = userRole !== "Linux";

  const [cols, setCols] = useState([]);
  useEffect(() => {
      if (type === 'success') {
          setCols([
              { id: 'server', label: 'Server', show: true },
              { id: 'status', label: 'Status', show: true }
          ]);
      } else if (type === 'health') {
          setCols([
              { id: 'server', label: 'Server', show: true },
              { id: 'issues', label: 'Issue', show: true },
              ...(showService ? [{ id: 'serviceStatus', label: 'Service Status', show: true }] : []),
              { id: 'lastReportTime', label: 'Last Report', show: true }
          ]);
      } else if (type === 'reboot') {
          setCols([
              { id: 'server', label: 'Server', show: true },
              { id: 'pendingRestart', label: 'Pending Restart', show: true },
              { id: 'ip', label: 'IP Address', show: true },
              { id: 'uptime', label: 'UpTime', show: true },
              { id: 'besRelay', label: 'BES Relay', show: true }
          ]);
      }
  }, [type, showService]);

  const propertyOptions = useMemo(() => cols.map(c => ({ value: c.id, label: c.label })), [cols]);

  useEffect(() => {
    const handleOutside = (e) => {
      if (colRef.current && !colRef.current.contains(e.target)) setShowColDrop(false);
      if (expRef.current && !expRef.current.contains(e.target)) setShowExpDrop(false);
    };
    document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, []);

  function classify(raw) {
    const s = String(raw || "").trim();
    if (!s) return "Not Reported";
    const L = s.toLowerCase();
    if (/^fixed$/i.test(s) || /executed successfully/i.test(L) || /success/i.test(L)) return "Fixed";
    if (/^completed$/i.test(s)) return "Completed";
    return s;
  }

  const fetchData = async () => {
      setLoading(true); 
      setError(""); 
      setSelectedReboots(new Set());
      setSelectedHealth(new Set());
      
      try {
          const groupQuery = groupName ? `?group=${encodeURIComponent(groupName)}` : "";
          let fetchedData = [];

          if (type === 'success') {
              if (!actionId) {
                  setError("No Action ID was pinned for the previous deployment.");
                  setLoading(false);
                  return;
              }
              const res = await getJson(`${API_BASE}/api/actions/${actionId}/results`);
              if (Array.isArray(res?.rows)) {
                  const map = new Map();
                  for (const r of res.rows) {
                      if (r.server && !map.has(r.server)) { map.set(r.server, r); }
                  }
                  fetchedData = Array.from(map.values()).filter((r) => { 
                      const s = classify(r.status); return s === 'Fixed' || s === 'Completed'; 
                  });
              }
          } else if (type === 'health') {
              const data = await getJson(`${API_BASE}/api/health/critical${groupQuery}`);
              fetchedData = Array.isArray(data?.rows) ? data.rows : [];
          } else if (type === 'reboot') {
              const data = await getJson(`${API_BASE}/api/health/reboot-pending${groupQuery}`);
              fetchedData = Array.isArray(data?.rows) ? data.rows : [];
          }

          setData(fetchedData);
          setLastUpdated(new Date().toLocaleString());
      } catch (e) {
          setError(e.message || "Failed to fetch KPI data.");
      } finally {
          setLoading(false);
      }
  };

  useEffect(() => {
      fetchData();
  }, [type, groupName, actionId]);

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
        
        if (c.column === 'issues' && Array.isArray(item.issues)) {
            field = item.issues.join(", ").toLowerCase();
        } else if (c.column === 'pendingRestart') {
            field = String(item.pendingRestart ?? item.pending ?? item.restart ?? "").toLowerCase();
        } else {
            field = String(item[c.column] || "").toLowerCase();
        }

        if (c.operator === "contains") condition = field.includes(query);
        else if (c.operator === "=") condition = field === query;
        else if (c.operator === "!=") condition = field !== query;
        blockMatch = blockMatch && condition;
      }
      if (validConds > 0) globalMatch = globalLogic === "OR" ? (globalMatch || blockMatch) : (globalMatch && blockMatch);
    }
    return globalMatch;
  };

  const visibleData = useMemo(() => data.filter(applyFilters), [data, filters, globalLogic]);

  const sortedData = useMemo(() => {
    let sortableItems = [...visibleData];
    if (sortConfig.key) {
      sortableItems.sort((a, b) => {
        let aVal = a[sortConfig.key] || "";
        let bVal = b[sortConfig.key] || "";
        
        if (sortConfig.key === 'issues') {
            aVal = Array.isArray(a.issues) ? a.issues.join(", ") : "";
            bVal = Array.isArray(b.issues) ? b.issues.join(", ") : "";
        } else if (sortConfig.key === 'pendingRestart') {
            aVal = String(a.pendingRestart ?? a.pending ?? a.restart ?? "");
            bVal = String(b.pendingRestart ?? b.pending ?? b.restart ?? "");
        }

        aVal = String(aVal).toLowerCase();
        bVal = String(bVal).toLowerCase();

        if (aVal < bVal) return sortConfig.direction === "asc" ? -1 : 1;
        if (aVal > bVal) return sortConfig.direction === "asc" ? 1 : -1;
        return 0;
      });
    }
    return sortableItems;
  }, [visibleData, sortConfig]);

  const totalPages = Math.ceil(sortedData.length / rowsPerPage);
  const paginatedData = sortedData.slice((currentPage - 1) * rowsPerPage, currentPage * rowsPerPage);

  const handleSort = (key) => setSortConfig(prev => ({ key, direction: prev.key === key && prev.direction === "asc" ? "desc" : "asc" }));
  const getSortIcon = (key) => {
    if (sortConfig.key !== key) return <span className="muted-text ml-6">↕</span>;
    return <span className="ml-6">{sortConfig.direction === "asc" ? "↑" : "↓"}</span>;
  };

  const activeFilterCount = filters.reduce((acc, b) => acc + b.conds.filter(c => c.value).length, 0);

  const handleExport = (scope) => { 
    setShowExpDrop(false); 
    let dataToExport = [];
    if (scope === 'page') dataToExport = paginatedData;
    else if (scope === 'filtered') dataToExport = sortedData;
    else dataToExport = data;

    performExport(dataToExport, cols, exportFormat, `${type}_kpi_report`, (r, cId) => {
        if (cId === 'issues') return Array.isArray(r.issues) ? r.issues.join(", ") : "";
        if (cId === 'pendingRestart') return String(r.pendingRestart ?? r.pending ?? r.restart ?? "");
        if (type === 'success' && cId === 'status') return "Success";
        return r[cId] || "N/A";
    });
  };

  const toggleRebootSelection = (serverName) => {
    const next = new Set(selectedReboots);
    if (next.has(serverName)) next.delete(serverName); else next.add(serverName);
    setSelectedReboots(next);
  };

  const toggleAllReboots = () => {
    const allSelected = paginatedData.length > 0 && paginatedData.every(r => selectedReboots.has(r.server));
    const next = new Set(selectedReboots);
    if (allSelected) {
        paginatedData.forEach(r => next.delete(r.server));
    } else {
        paginatedData.forEach(r => next.add(r.server));
    }
    setSelectedReboots(next);
  };

  async function executeRestart() {
    const serverName = confirmRestart;
    if (!serverName) return;
    setActionStatus((p) => ({ ...p, [serverName]: "loading" }));
    setConfirmRestart(null); setError("");
    try {
      const result = await postJSON(`${API_BASE}/api/actions/restart`, { computerName: serverName });
      setActionStatus((p) => ({ ...p, [serverName]: "success", [`__id_${serverName}`]: result.actionId }));
    } catch (e) {
      const errorMsg = e.message || "Failed to trigger restart.";
      setActionStatus((p) => ({ ...p, [serverName]: "error", [`__msg_${serverName}`]: errorMsg }));
      setError(`Failed to restart ${serverName}: ${errorMsg}`);
    }
  }

  async function executeBulkRestart() {
    if (selectedReboots.size === 0) return;
    setBulkRebootStatus("Triggering..."); setConfirmBulkReboot(false);
    try {
      const names = Array.from(selectedReboots);
      const result = await postJSON(`${API_BASE}/api/actions/restart-bulk`, { computerNames: names });
      const newStatus = { ...actionStatus };
      names.forEach(name => { newStatus[name] = "success"; newStatus[`__id_${name}`] = result.actionId; });
      setActionStatus(newStatus);
      setBulkRebootStatus(`Success! Action ID: ${result.actionId}`);
      setSelectedReboots(new Set()); 
    } catch (e) {
      setBulkRebootStatus("Failed.");
      setError(`Bulk restart failed: ${e.message}`);
    }
  }

  const isHealthRestartable = (row) => {
      const isWindows = String(row.os || "").toLowerCase().includes("win");
      return isWindows && row.serviceStatus && row.serviceStatus.toLowerCase() !== "running" && row.serviceStatus !== "N/A" && row.serviceStatus !== "Not Applicable";
  };

  const toggleHealthSelection = (serverName) => {
    const next = new Set(selectedHealth);
    if (next.has(serverName)) next.delete(serverName); else next.add(serverName);
    setSelectedHealth(next);
  };

  const toggleAllHealth = () => {
    const restartableRows = paginatedData.filter(isHealthRestartable);
    if (restartableRows.length === 0) return;
    
    const allSelected = restartableRows.every(r => selectedHealth.has(r.server));
    const next = new Set(selectedHealth);
    
    if (allSelected) {
        restartableRows.forEach(r => next.delete(r.server));
    } else {
        restartableRows.forEach(r => next.add(r.server));
    }
    setSelectedHealth(next);
  };

  async function executeServiceRestart() {
    const serverName = confirmService;
    if (!serverName) return;
    const key = `svc_${serverName}`;
    setActionStatus((p) => ({ ...p, [key]: "loading" }));
    setConfirmService(null); setError("");
    try {
      const result = await postJSON(`${API_BASE}/api/actions/service-restart`, { computerName: serverName });
      setActionStatus((p) => ({ ...p, [key]: "success", [`__id_${key}`]: result.actionId }));
    } catch (e) {
      const errorMsg = e.message || "Failed to trigger service restart.";
      setActionStatus((p) => ({ ...p, [key]: "error", [`__msg_${key}`]: errorMsg }));
      setError(`Failed to restart service on ${serverName}: ${errorMsg}`);
    }
  }

  async function executeBulkServiceRestart() {
    if (selectedHealth.size === 0) return;
    setBulkServiceStatus("Triggering..."); setConfirmBulkService(false);
    try {
      const names = Array.from(selectedHealth);
      const newStatus = { ...actionStatus };
      
      await Promise.all(names.map(async (name) => {
          const key = `svc_${name}`;
          try {
              const result = await postJSON(`${API_BASE}/api/actions/service-restart`, { computerName: name });
              newStatus[key] = "success";
              newStatus[`__id_${key}`] = result.actionId;
          } catch(e) {
              newStatus[key] = "error";
              newStatus[`__msg_${key}`] = e.message;
          }
      }));
      
      setActionStatus(newStatus);
      setBulkServiceStatus(`Completed!`);
      setSelectedHealth(new Set()); 
    } catch (e) {
      setBulkServiceStatus("Failed.");
      setError(`Bulk service restart failed: ${e.message}`);
    }
  }

  const getTitle = () => {
      if (type === 'success') return "Deployment Success Details";
      if (type === 'health') return "Critical Health Failures";
      if (type === 'reboot') return "Pending Reboots";
      return "KPI Details";
  };

  return (
    <div className="card reveal" style={{ minHeight: '100%', display: 'flex', flexDirection: 'column', padding: 0, overflow: 'visible', boxShadow: 'none', border: 'none', background: 'transparent' }}>
      
      <div style={{ position: 'sticky', top: '-24px', background: 'var(--panel)', zIndex: 20, padding: '24px 32px 16px', borderBottom: '1px solid var(--border)', margin: '-24px -32px 24px -32px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)' }}>
        <div className="left" style={{ display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
               <h2 style={{ margin: 0, fontSize: "22px", fontWeight: 600, color: "var(--text)" }}>{getTitle()}</h2>
               <span className="pill gray">{groupName ? `Target Group: ${groupName}` : "Scope: Full Infrastructure"}</span>
            </div>
            <div className="text-13 muted-text" style={{ marginTop: '4px' }}>
               Updated: {lastUpdated || "—"}
            </div>
        </div>
        <div className="right flex-row gap-12 items-center">
            <div style={{ position: 'relative' }}>
                <button className="iconbtn" onClick={() => setDrawerOpen(true)} title="Filter Data">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16"><line x1="4" y1="21" x2="4" y2="14"></line><line x1="4" y1="10" x2="4" y2="3"></line><line x1="12" y1="21" x2="12" y2="12"></line><line x1="12" y1="8" x2="12" y2="3"></line><line x1="20" y1="21" x2="20" y2="16"></line><line x1="20" y1="12" x2="20" y2="3"></line><line x1="1" y1="14" x2="7" y2="14"></line><line x1="9" y1="8" x2="15" y2="8"></line><line x1="17" y1="16" x2="23" y2="16"></line></svg>
                </button>
                {activeFilterCount > 0 && <span className="pill blue" style={{ position: 'absolute', top: -8, right: -8, padding: '2px 6px', fontSize: 10 }}>{activeFilterCount}</span>}
            </div>
            <button className="iconbtn" onClick={fetchData} disabled={loading} title="Refresh Data">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16"><path d="M23 4v6h-6"></path><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path></svg>
            </button>
        </div>
      </div>

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
          {error && <div className="banner error" style={{ marginBottom: "16px" }}>{error}</div>}

          {activeFilterCount > 0 && (
              <div className="active-filter-banner active" style={{ marginBottom: '16px' }}>
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
                            <span className="filter-tag"><strong>{propertyOptions.find(o => String(o.value) === String(c.column))?.label || c.column}</strong>&nbsp;{c.operator}&nbsp;<strong>'{c.value}'</strong></span>
                          </span>
                        ))}
                      </div>
                    );
                  })}
                </div>
                <button className="btn outline" onClick={() => setFilters([])}>Clear Filters</button>
              </div>
          )}

          <div className="fade-in" style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
            <div className="grid-toolbar" style={{ margin: '0 0 16px 0', padding: 0, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <span className="title" style={{ fontWeight: 600, color: 'var(--text)' }}>Results</span>
                    
                    {type === 'reboot' && selectedReboots.size > 0 && (
                       <>
                         <span className="pill amber">{selectedReboots.size} selected</span>
                         <button className="btn pri h-32 px-12 text-12" onClick={() => setConfirmBulkReboot(true)}>Restart Selected</button>
                       </>
                    )}
                    {type === 'reboot' && bulkRebootStatus && <span className="text-12 text-success">{bulkRebootStatus}</span>}

                    {type === 'health' && selectedHealth.size > 0 && (
                       <>
                         <span className="pill amber">{selectedHealth.size} selected</span>
                         <button className="btn pri h-32 px-12 text-12" onClick={() => setConfirmBulkService(true)}>Restart Services</button>
                       </>
                    )}
                    {type === 'health' && bulkServiceStatus && <span className="text-12 text-success">{bulkServiceStatus}</span>}
                </div>
                
                <div style={{ display: 'flex', gap: '12px' }}>
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
                    <div className="sub empty-state" style={{ padding: '40px', textAlign: 'center' }}>Loading KPI details...</div>
                ) : paginatedData.length === 0 ? (
                    <div className="sub empty-state" style={{ padding: '40px', textAlign: 'center' }}>No data found.</div>
                ) : (
                    <table>
                        <thead className="kpi-th-sticky">
                            <tr>
                                {(type === 'reboot' || (type === 'health' && showService)) && (
                                    <th className="w-40 kpi-td-center">
                                        {type === 'reboot' && (
                                            <input type="checkbox" className="custom-checkbox" onChange={toggleAllReboots} checked={paginatedData.length > 0 && paginatedData.every(r => selectedReboots.has(r.server))} />
                                        )}
                                        {type === 'health' && (
                                            <input type="checkbox" className="custom-checkbox" onChange={toggleAllHealth} disabled={paginatedData.filter(isHealthRestartable).length === 0} checked={paginatedData.filter(isHealthRestartable).length > 0 && paginatedData.filter(isHealthRestartable).every(r => selectedHealth.has(r.server))} />
                                        )}
                                    </th>
                                )}
                                {cols.map(c => {
                                    if (!c.show) return null;
                                    return (
                                        <th key={c.id} className="cursor-pointer" onClick={() => handleSort(c.id)}>
                                            {c.label}{getSortIcon(c.id)}
                                        </th>
                                    );
                                })}
                                {(type === 'health' || type === 'reboot') && showService && (
                                    <th className="w-140 kpi-td-center">Action</th>
                                )}
                            </tr>
                        </thead>
                        <tbody>
                            {paginatedData.map((row, i) => {
                                const canRestartSvc = type === 'health' && isHealthRestartable(row);
                                return (
                                    <tr key={i} onClick={type === 'reboot' ? () => toggleRebootSelection(row.server) : (type === 'health' && canRestartSvc ? () => toggleHealthSelection(row.server) : undefined)} className={type === 'reboot' ? (selectedReboots.has(row.server) ? 'selected-row cursor-pointer' : 'cursor-pointer') : (type === 'health' && canRestartSvc ? (selectedHealth.has(row.server) ? 'selected-row cursor-pointer' : 'cursor-pointer') : "")}>
                                        {(type === 'reboot' || (type === 'health' && showService)) && (
                                            <td className="kpi-td-center">
                                                {type === 'reboot' ? (
                                                    <input type="checkbox" className="custom-checkbox no-events" checked={selectedReboots.has(row.server)} readOnly />
                                                ) : (
                                                    canRestartSvc ? <input type="checkbox" className="custom-checkbox no-events" checked={selectedHealth.has(row.server)} readOnly /> : null
                                                )}
                                            </td>
                                        )}
                                        {cols.map(c => {
                                            if (!c.show) return null;
                                            let val = row[c.id];
                                            if (type === 'success' && c.id === 'status') return <td key={c.id}><span className="pill green">Success</span></td>;
                                            if (c.id === 'issues') return <td key={c.id}>{(row.issues || []).map((issue, idx) => (<span key={idx} className="pill red mr-10 text-11">{issue}</span>))}</td>;
                                            if (c.id === 'serviceStatus' && type === 'health') { const isWindows = String(row.os || "").toLowerCase().includes("win"); return <td key={c.id}>{isWindows ? (row.serviceStatus || "N/A") : "—"}</td>; }
                                            if (c.id === 'pendingRestart') return <td key={c.id}>{String(row.pendingRestart ?? row.pending ?? row.restart ?? "N/A")}</td>;
                                            return <td key={c.id}>{val || "N/A"}</td>;
                                        })}
                                        {type === 'health' && showService && (
                                            <td className="kpi-td-center" onClick={e => e.stopPropagation()}>
                                                {canRestartSvc && (
                                                    <button className="btn pri h-32 px-10 text-11" onClick={(e) => { e.stopPropagation(); setConfirmService(row.server); }} disabled={!!actionStatus[`svc_${row.server}`]}>
                                                        {actionStatus[`svc_${row.server}`] === "loading" ? "..." : actionStatus[`svc_${row.server}`] === "success" ? "Sent" : "Restart"}
                                                    </button>
                                                )}
                                            </td>
                                        )}
                                        {type === 'reboot' && showService && (
                                            <td className="kpi-td-center" onClick={e => e.stopPropagation()}>
                                                <button className="btn pri h-32 px-10 text-11" onClick={(e) => { e.stopPropagation(); setConfirmRestart(row.server); }} disabled={!!actionStatus[row.server]}>
                                                    {actionStatus[row.server] === "loading" ? "..." : actionStatus[row.server] === "success" ? "Sent" : "Restart"}
                                                </button>
                                            </td>
                                        )}
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                )}
            </div>

            <div className="pagination" style={{ position: "relative", zIndex: 50, display: "flex", justifyContent: "flex-end", alignItems: "center", padding: "16px 32px", gap: "24px", margin: "0 -32px", width: "calc(100% + 64px)", borderBottom: '1px solid var(--border)', background: 'var(--panel)' }}>
                <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                    <span className="pager-info" style={{ fontSize: "13px", color: "var(--muted)" }}>Rows per page:</span>
                    <FancySelect options={RPP_OPTIONS} value={rowsPerPage} onChange={v => { setRowsPerPage(Number(v)); setCurrentPage(1); }} width="80px" menuPlacement="top" />
                </div>
                <span className="pager-info" style={{ fontSize: "13px", color: "var(--muted)" }}>
                    {sortedData.length > 0 ? (currentPage - 1) * rowsPerPage + 1 : 0}-{Math.min(currentPage * rowsPerPage, sortedData.length)} of {sortedData.length}
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
      </div>

      <FilterDrawer isOpen={drawerOpen} onClose={() => setDrawerOpen(false)} filters={filters} setFilters={setFilters} globalLogic={globalLogic} setGlobalLogic={setGlobalLogic} propertyOptions={propertyOptions} />

      {confirmRestart && (
        <ConfirmationModal open={!!confirmRestart} title="Confirm Server Restart" onClose={() => setConfirmRestart(null)} onConfirm={executeRestart} busy={actionStatus[confirmRestart] === "loading"}>
          Are you sure you want to restart the server: <strong>{confirmRestart}</strong>?
        </ConfirmationModal>
      )}
      {confirmService && (
        <ConfirmationModal open={!!confirmService} title="Confirm Service Restart" onClose={() => setConfirmService(null)} onConfirm={executeServiceRestart} busy={actionStatus[`svc_${confirmService}`] === "loading"}>
          Are you sure you want to restart "Window Update" service on: <strong>{confirmService}</strong>?
        </ConfirmationModal>
      )}
      {confirmBulkReboot && (
        <ConfirmationModal open={confirmBulkReboot} title={`Confirm Bulk Restart (${selectedReboots.size})`} onClose={() => setConfirmBulkReboot(false)} onConfirm={executeBulkRestart} busy={bulkRebootStatus === "Triggering..."}>
           Are you sure you want to restart <strong>{selectedReboots.size}</strong> selected servers immediately?
           <div className="kpi-bulk-box" style={{ maxHeight: '100px', overflowY: 'auto', background: '#f3f4f6', padding: '8px', borderRadius: '4px', fontSize: '12px', marginTop: '10px' }}>
              {Array.from(selectedReboots).join(", ")}
           </div>
        </ConfirmationModal>
      )}
      {confirmBulkService && (
        <ConfirmationModal open={confirmBulkService} title={`Confirm Bulk Service Restart (${selectedHealth.size})`} onClose={() => setConfirmBulkService(false)} onConfirm={executeBulkServiceRestart} busy={bulkServiceStatus === "Triggering..."}>
           Are you sure you want to restart the "Window Update" service on <strong>{selectedHealth.size}</strong> selected servers immediately?
           <div className="kpi-bulk-box" style={{ maxHeight: '100px', overflowY: 'auto', background: '#f3f4f6', padding: '8px', borderRadius: '4px', fontSize: '12px', marginTop: '10px' }}>
              {Array.from(selectedHealth).join(", ")}
           </div>
        </ConfirmationModal>
      )}
    </div>
  );
}