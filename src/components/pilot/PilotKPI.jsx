// frontend/src/components/pilot/PilotKPI.jsx
import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { useEnvironment } from "../Environment.jsx"; 

const API_BASE = window.env.VITE_API_BASE;

/* ------------------------------- helpers ------------------------------- */
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

const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
function useInView(ref, options = { threshold: 0.2, rootMargin: "0px 0px -20% 0px" }) {
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(([ent]) => setInView(ent.isIntersecting), options);
    io.observe(el);
    return () => io.disconnect();
  }, [ref, options.threshold, options.rootMargin]);
  return inView;
}

const toneForSuccess = (pct, th = 90) => pct >= th ? "green" : pct >= th - 5 ? "amber" : "red";
const toneForCHF = (n) => (n === 0 ? "green" : n <= 3 ? "amber" : "red");
const rebootTone = (n) => (n === 0 ? "green" : "amber");

const escapeHtml = (str) => String(str ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function rowsToCSV(rows) {
  if (!rows || !rows.length) return "";
  const header = Object.keys(rows[0]).join(",");
  const escape = (v) => {
    const s = String(v ?? "");
    if (s.includes(",") || s.includes('"') || s.includes("\n")) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };
  const lines = [header];
  for (const r of rows) {
    lines.push(Object.values(r).map(escape).join(","));
  }
  return lines.join("\n");
}

function rowsToHTML(rows, title = "Results") {
  const safeTitle = escapeHtml(title);
  if (!rows || !rows.length) return `<h1>${safeTitle}</h1><p>No Data</p>`;
  const keys = Object.keys(rows[0]);
  const head = `<meta charset="utf-8"/><title>${safeTitle}</title><style>body{font-family:system-ui,-apple-system,sans-serif;padding:16px;color:#111827}h1{font-size:18px;margin:0 0 12px}table{border-collapse:collapse;width:100%}th,td{border:1px solid #e5e7eb;padding:8px 10px;font-size:14px}thead th{background:#f8fafc;text-align:left}</style>`;
  const ths = keys.map(k => `<th>${escapeHtml(k)}</th>`).join("");
  const trs = rows.map(r => `<tr>${keys.map(k => `<td>${escapeHtml(r[k])}</td>`).join("")}</tr>`).join("");
  return `<!doctype html><html><head>${head}</head><body><h1>${safeTitle}</h1><table><thead><tr>${ths}</tr></thead><tbody>${trs}</tbody></table></body></html>`;
}

function EnhancedModal({ open, onClose, title, rows, loading, error, renderRows, csvFilter, extraToolbar }) {
  const [filter, setFilter] = useState("");
  const [sortConfig, setSortConfig] = useState({ key: null, dir: "asc" });
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [showPageMenu, setShowPageMenu] = useState(false);
  const exportBtnRef = useRef(null);
  const pageBtnRef = useRef(null);

  useEffect(() => setPage(1), [filter, pageSize, rows]);

  useEffect(() => {
    function onDocClick(e) {
      if (showExportMenu && exportBtnRef.current && !exportBtnRef.current.contains(e.target)) setShowExportMenu(false);
      if (showPageMenu && pageBtnRef.current && !pageBtnRef.current.contains(e.target)) setShowPageMenu(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [showExportMenu, showPageMenu]);

  const filtered = useMemo(() => {
    if (!filter) return rows;
    const q = filter.toLowerCase();
    return rows.filter(r => Object.values(r).some(v => String(v).toLowerCase().includes(q)));
  }, [rows, filter]);

  const sorted = useMemo(() => {
    if (!sortConfig.key) return filtered;
    return [...filtered].sort((a, b) => {
      const valA = String(a[sortConfig.key] || "").toLowerCase();
      const valB = String(b[sortConfig.key] || "").toLowerCase();
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

  const handleSort = (key) => {
    setSortConfig(current => ({ key, dir: current.key === key && current.dir === "asc" ? "desc" : "asc" }));
  };

  const doExport = (type) => {
    setShowExportMenu(false);
    const dataToExport = csvFilter ? sorted.map(csvFilter) : sorted;
    const safeTitle = title.replace(/[^\w.-]+/g, "_");
    
    if (type === 'csv') {
      const csv = rowsToCSV(dataToExport);
      downloadBlob(new Blob([csv], { type: "text/csv;charset=utf-8" }), `${safeTitle}.csv`);
    } else if (type === 'html') {
      const html = rowsToHTML(dataToExport, title);
      downloadBlob(new Blob([html], { type: "text/html;charset=utf-8" }), `${safeTitle}.html`);
    } else if (type === 'pdf') {
      const html = rowsToHTML(dataToExport, title);
      const blob = new Blob([html], { type: "text/html;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const iframe = document.createElement("iframe");
      iframe.className = "d-none";
      iframe.src = url;
      iframe.onload = () => {
        try { iframe.contentWindow?.focus(); iframe.contentWindow?.print(); } catch {}
        setTimeout(() => { URL.revokeObjectURL(url); iframe.remove(); }, 2000);
      };
      document.body.appendChild(iframe);
    }
  };

  if (!open) return null;

  return (
    <div className="modal show" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="box action-modal-box max-w-1100 w-95p" onClick={e => e.stopPropagation()}>
        <div className="action-modal-header">
          <h3>{title}</h3>
          <button className="btn" onClick={onClose}>Close</button>
        </div>

        <div className="flex-row gap-12 mb-12 wrap items-center">
          <input type="text" className="control flex-1 min-w-240" placeholder="Search..." value={filter} onChange={e => setFilter(e.target.value)} />
          {extraToolbar}
          <div className="dropdown" ref={exportBtnRef}>
            <button className="btn" onClick={() => setShowExportMenu(s => !s)}>
              Export
              <svg width="14" height="14" viewBox="0 0 24 24" className="ml-6"><path d="M6 9l6 6 6-6" fill="none" stroke="currentColor" strokeWidth="2" /></svg>
            </button>
            {showExportMenu && (
              <div className="menu">
                <button className="item" onClick={() => doExport('csv')}>Export to CSV</button>
                <button className="item" onClick={() => doExport('pdf')}>Export to PDF</button>
                <button className="item" onClick={() => doExport('html')}>Export to HTML</button>
              </div>
            )}
          </div>
        </div>

        <div className="tableWrap action-modal-body">
          {loading ? (
            <div className="action-modal-loading muted-text text-center">Loading...</div>
          ) : error ? (
            <div className="action-modal-loading text-danger text-center">{error}</div>
          ) : (
            <table className="action-modal-table">
              {renderRows(paginated, handleSort, sortConfig)}
            </table>
          )}
        </div>

        <div className="action-modal-footer">
          <div className="muted-text text-13">Showing {sorted.length === 0 ? 0 : (page - 1) * pageSize + 1} to {Math.min(page * pageSize, sorted.length)} of {sorted.length} entries</div>
          <div className="action-modal-nav">
            <div className="dropdown mr-10" ref={pageBtnRef}>
               <button className="btn h-32 px-10 text-13 min-w-90 justify-between" onClick={() => setShowPageMenu(!showPageMenu)}>
                 <span>{pageSize} / page</span>
                 <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" style={{transform: showPageMenu ? 'rotate(180deg)' : 'none', transition: '0.2s'}}><path d="M6 9l6 6 6-6"/></svg>
               </button>
               {showPageMenu && (
                 <div className="menu page-menu-up">
                    {[10, 25, 50, 100].map(opt => (
                       <button key={opt} className="item" onClick={() => { setPageSize(opt); setShowPageMenu(false); }}>{opt} / page</button>
                    ))}
                 </div>
               )}
            </div>
            <button className="btn h-32 px-10" disabled={page === 1} onClick={() => setPage(p => p - 1)}>Prev</button>
            <span className="fw-600">Page {page} of {totalPages || 1}</span>
            <button className="btn h-32 px-10" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>Next</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function MetricTile({ label, value, tone, delay = 0, onClick }) {
  return (
    <div className={`kpi kpi-metric-tile ${onClick ? "clickable" : ""}`} onClick={onClick} style={{ animationDelay: `${delay}ms` }}>
      <span className="label fw-800">{label}</span>
      <span className="value">
        <span className={`pill click ${tone} fw-900`}>{value}</span>
      </span>
    </div>
  );
}

function arcPath(cx, cy, r, startDeg, endDeg, innerR = 0) {
  const sweep = endDeg - startDeg;
  if (sweep >= 359.99) return null; 
  const toRad = (d) => (d - 90) * (Math.PI / 180);
  const large = sweep > 180 ? 1 : 0;
  const sx = cx + r * Math.cos(toRad(startDeg));
  const sy = cy + r * Math.sin(toRad(startDeg));
  const ex = cx + r * Math.cos(toRad(endDeg));
  const ey = cy + r * Math.sin(toRad(endDeg));
  if (!innerR) return `M ${cx} ${cy} L ${sx} ${sy} A ${r} ${r} 0 ${large} 1 ${ex} ${ey} Z`;
  const six = cx + innerR * Math.cos(toRad(endDeg));
  const siy = cy + innerR * Math.sin(toRad(endDeg));
  const eix = cx + innerR * Math.cos(toRad(startDeg));
  const eiy = cy + innerR * Math.sin(toRad(startDeg));
  return [`M ${sx} ${sy}`, `A ${r} ${r} 0 ${large} 1 ${ex} ${ey}`, `L ${six} ${siy}`, `A ${innerR} ${innerR} 0 ${large} 0 ${eix} ${eiy}`, "Z"].join(" ");
}

function fullRingPaths(cx, cy, r, innerR) {
  const p1 = arcPath(cx, cy, r, 0, 180, innerR);
  const p2 = arcPath(cx, cy, r, 180, 360, innerR);
  return [p1, p2];
}

function DonutChart({ donut, center, hoverKey, setHoverKey, onClickMap }) {
  const handleSliceClick = (e, key) => {
      e.stopPropagation();
      const lowerKey = String(key).toLowerCase();
      if (lowerKey === 'success' && onClickMap.success) onClickMap.success();
      else if (lowerKey === 'health' && onClickMap.health) onClickMap.health();
      else if (lowerKey === 'reboot' && onClickMap.reboot) onClickMap.reboot();
  };

  const getVal = (key) => donut.find(d => d.key === key)?.val || 0;

  return (
    <div className="chart">
      <svg viewBox="0 0 120 64" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Pilot distribution">
        <g transform="translate(0,0)">
          {donut.length === 0 ? (
            fullRingPaths(30, 32, 26, 16).map((path, idx) => (
                <path key={idx} d={path} fill="var(--panel-2)" stroke="var(--border)" strokeWidth="1" />
            ))
          ) : (
            donut.map((s, i) => {
              const mid = (s.start + s.end) / 2;
              const rad = ((mid - 90) * Math.PI) / 180;
              const explode = hoverKey === s.key ? 3 : 0;
              const dx = explode * Math.cos(rad);
              const dy = explode * Math.sin(rad);
              const d = arcPath(30, 32, 26, s.start, s.end, 16);
              
              const activeStyle = { cursor: "pointer", transition: "transform 180ms ease, filter 180ms ease", filter: hoverKey === s.key ? "brightness(1.05)" : "none" };
              
              if (d === null) {
                  return (
                      <g key={i} transform={`translate(${dx},${dy})`} onMouseEnter={() => setHoverKey(s.key)} onMouseLeave={() => setHoverKey(null)} onClick={(e) => handleSliceClick(e, s.key)} style={activeStyle}>
                         {fullRingPaths(30, 32, 26, 16).map((path, idx) => (
                             <path key={idx} d={path} fill={s.fill} stroke="var(--panel-1)" strokeWidth="0.2" />
                         ))}
                      </g>
                  );
              }
              return (
                <path key={i} d={d} fill={s.fill} stroke="var(--panel-1)" strokeWidth="0.2" transform={`translate(${dx},${dy})`} style={activeStyle} onClick={(e) => handleSliceClick(e, s.key)} onMouseEnter={() => setHoverKey(s.key)} onMouseLeave={() => setHoverKey(null)} />
              );
            })
          )}
          <text x="30" y="29" textAnchor="middle" fontSize="7" fontWeight="600" fill="var(--text)" style={{ pointerEvents: 'none' }}>{center.pct}%</text>
          <text x="30" y="38" textAnchor="middle" fontSize="5" fill="var(--muted)" style={{ pointerEvents: 'none' }}>{center.label}</text>
        </g>
        <g transform="translate(64,10)" fontSize="6">
          {[{ key: "Success", fill: "var(--success)", y: 7 }, { key: "Reboot", fill: "var(--warn)", y: 18 }, { key: "Health", fill: "var(--danger)", y: 30 }].map((l) => (
            <g key={l.key} transform={`translate(6,${l.y})`} onClick={(e) => handleSliceClick(e, l.key)} onMouseEnter={() => setHoverKey(l.key)} onMouseLeave={() => setHoverKey(null)} className="cursor-pointer" style={{ opacity: hoverKey && hoverKey !== l.key ? 0.7 : 1, transition: "opacity 160ms ease" }}>
              <circle cx="4" cy="4" r="3" fill={l.fill} />
              <text x="12" y="6">{l.key} ({getVal(l.key)})</text> 
            </g>
          ))}
        </g>
      </svg>
    </div>
  );
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

export default function PilotKPI({ title = "Pilot KPI", lastActions = {}, onKpiClick }) {
  const mode = /production/i.test(title) ? "production" : "pilot";
  
  const getPinnedActionId = useCallback(() => {
    try {
      const la = lastActions || {};
      if (mode === "production") return la?.PILOT?.id ?? null;
      return la?.SANDBOX?.id ?? null;
    } catch {
      return null;
    }
  }, [lastActions, mode]);

  // 🚀 FIXED: Always query the PREVIOUS stage's target group to check its health!
  const scopeGroup = useMemo(() => {
    try {
      const la = lastActions || {};
      if (mode === "production") return la?.PILOT?.group ?? la?.SANDBOX?.group ?? null;
      return la?.SANDBOX?.group ?? null;
    } catch {
      return null;
    }
  }, [lastActions, mode]);

  const [kpi, setKpi] = useState({ rebootPending: 0, critHealthFails: 0, successRate: 0, successCount: 0, totalCount: 0 });
  const [totalComputers, setTotalComputers] = useState(0);
  
  const [rebootRows, setRebootRows] = useState([]);
  const [openReboot, setOpenReboot] = useState(false);
  const [rebootLoading, setRebootLoading] = useState(false);
  const [selectedReboots, setSelectedReboots] = useState(new Set());
  const [confirmBulkReboot, setConfirmBulkReboot] = useState(false);
  const [bulkRebootStatus, setBulkRebootStatus] = useState("");

  const [openSuccess, setOpenSuccess] = useState(false);
  const [successRows, setSuccessRows] = useState([]);
  const [successLoading, setSuccessLoading] = useState(false);

  const [openHealth, setOpenHealth] = useState(false);
  const [healthRows, setHealthRows] = useState([]);
  const [healthLoading, setHealthLoading] = useState(false);

  const [confirmRestart, setConfirmRestart] = useState(null);
  const [confirmService, setConfirmService] = useState(null);
  const [actionStatus, setActionStatus] = useState({});
  const [globalError, setGlobalError] = useState("");

  const userRole = sessionStorage.getItem("user_role") || "Admin";
  const isEUC = userRole === "EUC";

  const [isActionStopped, setIsActionStopped] = useState(false);

  useEffect(() => {
    setIsActionStopped(false); 
  }, [getPinnedActionId()]);

  function classify(raw) {
    const s = String(raw || "").trim();
    if (!s) return "Not Reported";
    const L = s.toLowerCase();
    if (/^fixed$/i.test(s) || /executed successfully/i.test(L) || /success/i.test(L)) return "Fixed";
    if (/^completed$/i.test(s)) return "Completed";
    return s;
  }

  const rootRef = useRef(null);
  useInView(rootRef);

  const donut = useMemo(() => {
    const R = kpi.rebootPending || 0;
    const H = kpi.critHealthFails || 0;
    const S_action = kpi.successCount || 0;
    const T_action = kpi.totalCount || 0;
    const O_action = Math.max(0, T_action - S_action);

    const partsCombined = [
      { key: "Success", val: S_action, fill: "var(--success)" },
      { key: "Reboot", val: R, fill: "var(--warn)" },
      { key: "Health", val: H + O_action, fill: "var(--danger)" },
    ];
    const total = partsCombined.reduce((a, b) => a + b.val, 0) || 1;
    let acc = 0;
    return partsCombined.map((p) => {
      const start = (acc / total) * 360;
      const end = ((acc + p.val) / total) * 360;
      acc += p.val;
      return { ...p, start, end, pct: Math.round((p.val / total) * 100) };
    });
  }, [kpi.rebootPending, kpi.critHealthFails, kpi.successCount, kpi.totalCount]);

  const [hoverKey, setHoverKey] = useState(null);
  const center = useMemo(() => {
    let lbl = "Success";
    let pt = kpi.totalCount > 0 ? Math.round((kpi.successCount / kpi.totalCount) * 100) : 0;
    
    if (hoverKey) {
      lbl = hoverKey;
      const targetData = donut.find(d => d.key === hoverKey);
      pt = targetData ? targetData.pct : 0;
    }

    const shortLabel = lbl.length > 10 ? lbl.substring(0, 8) + '..' : lbl;
    return { pct: pt, label: shortLabel, fullLabel: lbl };
  }, [hoverKey, donut, kpi.successCount, kpi.totalCount]);

  const handleKpiClick = (type) => {
      if (onKpiClick) {
          onKpiClick({ type, group: scopeGroup, id: getPinnedActionId() });
      } else {
          if (type === 'success') openSuccessModal();
          else if (type === 'health') openHealthModal();
          else if (type === 'reboot') openRebootModal();
      }
  };

  async function openSuccessModal() {
    setOpenSuccess(true);
    const id = getPinnedActionId();
    if (!id) { setSuccessRows([]); setSuccessLoading(false); return; }
    try {
      setSuccessLoading(true);
      const res = await getJson(`${API_BASE}/api/actions/${id}/results`);
      let uniqueRows = [];
      if (Array.isArray(res?.rows)) {
          const map = new Map();
          for (const r of res.rows) {
              if (r.server && !map.has(r.server)) { map.set(r.server, r); }
          }
          uniqueRows = Array.from(map.values());
      }
      setSuccessRows(uniqueRows.filter((r) => { const s = classify(r.status); return s === 'Fixed' || s === 'Completed'; }));
    } catch { setSuccessRows([]); } finally { setSuccessLoading(false); }
  }

  async function openHealthModal() {
    setOpenHealth(true); setGlobalError("");
    try {
      setHealthLoading(true);
      const groupQuery = scopeGroup ? `?group=${encodeURIComponent(scopeGroup)}` : "";
      const data = await getJson(`${API_BASE}/api/health/critical${groupQuery}`);
      setHealthRows(Array.isArray(data?.rows) ? data.rows : []);
    } catch { setHealthRows([]); } finally { setHealthLoading(false); }
  }

  async function openRebootModal() {
    setOpenReboot(true); setGlobalError(""); setSelectedReboots(new Set()); 
    try {
      setRebootLoading(true);
      const groupQuery = scopeGroup ? `?group=${encodeURIComponent(scopeGroup)}` : "";
      const data = await getJson(`${API_BASE}/api/health/reboot-pending${groupQuery}`);
      setRebootRows(Array.isArray(data?.rows) ? data.rows : []);
    } catch { setRebootRows([]); } finally { setRebootLoading(false); }
  }

  const toggleRebootSelection = (serverName) => {
    const next = new Set(selectedReboots);
    if (next.has(serverName)) next.delete(serverName); else next.add(serverName);
    setSelectedReboots(next);
  };

  const toggleAllReboots = () => {
    if (selectedReboots.size === rebootRows.length) setSelectedReboots(new Set());
    else setSelectedReboots(new Set(rebootRows.map(r => r.server)));
  };

  async function executeRestart() {
    const serverName = confirmRestart;
    if (!serverName) return;
    setActionStatus((p) => ({ ...p, [serverName]: "loading" }));
    setConfirmRestart(null); setGlobalError("");
    try {
      const result = await postJSON(`${API_BASE}/api/actions/restart`, { computerName: serverName });
      setActionStatus((p) => ({ ...p, [serverName]: "success", [`__id_${serverName}`]: result.actionId }));
    } catch (e) {
      const errorMsg = e.message || "Failed to trigger restart.";
      setActionStatus((p) => ({ ...p, [serverName]: "error", [`__msg_${serverName}`]: errorMsg }));
      setGlobalError(`Failed to restart ${serverName}: ${errorMsg}`);
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
      setGlobalError(`Bulk restart failed: ${e.message}`);
    }
  }

  async function executeServiceRestart() {
    const serverName = confirmService;
    if (!serverName) return;
    const key = `svc_${serverName}`;
    setActionStatus((p) => ({ ...p, [key]: "loading" }));
    setConfirmService(null); setGlobalError("");
    try {
      const result = await postJSON(`${API_BASE}/api/actions/service-restart`, { computerName: serverName });
      setActionStatus((p) => ({ ...p, [key]: "success", [`__id_${key}`]: result.actionId }));
    } catch (e) {
      const errorMsg = e.message || "Failed to trigger service restart.";
      setActionStatus((p) => ({ ...p, [key]: "error", [`__msg_${key}`]: errorMsg }));
      setGlobalError(`Failed to restart service on ${serverName}: ${errorMsg}`);
    }
  }

  // 🚀 FIXED: Polling Logic. Health & Reboot run ALWAYS. Action results stop when done.
  useEffect(() => {
    let timer; const ab = new AbortController();
    async function tick() {
      try {
        const groupQuery = scopeGroup ? `?group=${encodeURIComponent(scopeGroup)}` : "";

        // 1. 🚀 ALWAYS FETCH HEALTH METRICS
        const ch = await getJson(`${API_BASE}/api/health/critical${groupQuery}`, ab.signal);
        const healthPayload = { count: Number(ch?.count || 0), rows: Array.isArray(ch?.rows) ? ch.rows : [] };
        setKpi((p) => ({ ...p, critHealthFails: healthPayload.count }));
        
        try {
          const rp = await getJson(`${API_BASE}/api/health/reboot-pending${groupQuery}`, ab.signal);
          const rpRows = Array.isArray(rp?.rows) ? rp.rows : [];
          const rpCount = Number(rp?.count ?? (rpRows.length || 0));
          setKpi((p) => ({ ...p, rebootPending: rpCount }));
          setRebootRows(rpRows);
        } catch (e) {}

        // 2. 🚀 ONLY FETCH ACTION STATUS IF NOT STOPPED
        if (!isActionStopped) {
            let actionId = getPinnedActionId();
            if (actionId) {
                const statusRes = await getJson(`${API_BASE}/api/actions/${actionId}/status`, ab.signal).catch(()=>({}));
                const st = String(statusRes?.state || "").toLowerCase();
                const isDone = st === 'stopped' || st === 'expired';

                const res = await getJson(`${API_BASE}/api/actions/${actionId}/results`, ab.signal);
                let uniqueRows = [];
                if (Array.isArray(res?.rows)) {
                    const map = new Map();
                    for (const r of res.rows) { if (r.server && !map.has(r.server)) map.set(r.server, r); }
                    uniqueRows = Array.from(map.values());
                }
                const success = uniqueRows.length > 0 
                    ? uniqueRows.filter(r => { const s = classify(r.status); return s === 'Fixed' || s === 'Completed'; }).length 
                    : Number(res?.success ?? 0);
                
                const total = uniqueRows.length > 0 ? uniqueRows.length : Number(res?.total ?? 0);
                const rate = total > 0 ? Math.round((success / total) * 100) : 0;
                
                setKpi((p) => ({ ...p, successRate: rate, successCount: success, totalCount: total }));

                if (isDone) setIsActionStopped(true); // Stop Action polling, but Health/Reboot will continue
            } else {
                setKpi((p) => ({ ...p, successRate: 0, successCount: 0, totalCount: 0 }));
            }
        }
      } catch (err) {
        if (err.name !== "AbortError") console.warn("PilotKPI refresh failed:", err?.message || err);
      }
    }
    tick(); timer = setInterval(tick, 15000); 
    return () => { clearInterval(timer); ab.abort(); };
  }, [mode, getPinnedActionId, scopeGroup, isActionStopped]);

  return (
    <section ref={rootRef} className="card reveal" data-reveal>
      <h2>{title}</h2>
      <div className="kpi-row-wrap">
        <div className="flex-1 min-w-220">
          <div className="kpis kpi-row-wrap">
            {!isEUC && (
              // 🚀 FIXED: Value now concatenates percentage and (successCount/totalCount)
              <MetricTile 
                 label="Success Rate" 
                 value={kpi.totalCount > 0 ? `${kpi.successRate}% (${kpi.successCount}/${kpi.totalCount})` : `${kpi.successRate}%`} 
                 tone={toneForSuccess(kpi.successRate)} 
                 onClick={() => handleKpiClick('success')} 
              />
            )}
            <MetricTile label="Critical Health Failures" value={kpi.critHealthFails} tone={toneForCHF(kpi.critHealthFails)} delay={80} onClick={() => handleKpiClick('health')} />
            <MetricTile label="Reboot Pending" value={kpi.rebootPending} tone={rebootTone(kpi.rebootPending)} delay={140} onClick={() => handleKpiClick('reboot')} />
          </div>
          <div className="sep"></div>
          <DonutChart 
              donut={donut} center={center} hoverKey={hoverKey} setHoverKey={setHoverKey} 
              onClickMap={{ success: () => handleKpiClick('success'), health: () => handleKpiClick('health'), reboot: () => handleKpiClick('reboot') }}
          />
        </div>
      </div>

      <EnhancedModal 
        open={openSuccess} onClose={() => setOpenSuccess(false)} title={`${title.replace("KPI", "Success Details")}`} 
        rows={successRows} loading={successLoading} 
        renderRows={(rows, handleSort, sortConfig) => (
          <>
            <thead className="kpi-th-sticky">
              <tr>
                <th className="cursor-pointer" onClick={() => handleSort('server')}>Server {sortConfig.key==='server'? (sortConfig.dir==='asc'?'↑':'↓') : ''}</th>
                <th className="cursor-pointer" onClick={() => handleSort('status')}>Status {sortConfig.key==='status'? (sortConfig.dir==='asc'?'↑':'↓') : ''}</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (<tr><td colSpan={2} className="sub">No success rows.</td></tr>) : (rows.map((r, i) => (<tr key={i}><td>{r.server || "—"}</td><td>Success</td></tr>)))}
            </tbody>
          </>
        )}
      />

      <EnhancedModal
        open={openHealth} onClose={() => setOpenHealth(false)} title={`${title.replace("KPI", "Critical Health")}`}
        rows={healthRows} loading={healthLoading} error={globalError}
        renderRows={(rows, handleSort, sortConfig) => {
          const role = sessionStorage.getItem("user_role") || "Admin";
          const showService = role !== "Linux"; 
          return (
            <>
              <thead className="kpi-th-sticky">
                <tr>
                  <th className="cursor-pointer" onClick={() => handleSort('server')}>Server {sortConfig.key==='server'?(sortConfig.dir==='asc'?'↑':'↓'):''}</th>
                  <th className="cursor-pointer" onClick={() => handleSort('issues')}>Issue</th>
                  {showService && <th>Service Name</th>}
                  {showService && <th>Service Status</th>}
                  <th>Last Report</th>
                  {showService && <th className="kpi-td-120">Action</th>}
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (<tr><td colSpan={showService ? 6 : 3} className="sub">No critical failures.</td></tr>) : (
                  rows.map((r, i) => {
                    const svcKey = `svc_${r.server}`;
                    const status = actionStatus[svcKey];
                    const isWindows = String(r.os || "").toLowerCase().includes("win");
                    const canRestart = isWindows && r.serviceStatus && r.serviceStatus.toLowerCase() !== "running" && r.serviceStatus !== "N/A" && r.serviceStatus !== "Not Applicable";
                    return (
                      <tr key={i}>
                        <td>{r.server || "N/A"}</td>
                        <td>{(r.issues || []).map((issue, idx) => (<span key={idx} className="pill red mr-10 text-11">{issue}</span>))}</td>
                        {showService && <td>{isWindows ? "Window Update" : "—"}</td>}
                        {showService && <td>{isWindows ? (r.serviceStatus || "N/A") : "—"}</td>}
                        <td>{r.lastReportTime}</td>
                        {showService && (
                          <td className="kpi-td-center">
                            {canRestart && (
                              <button className="btn pri h-32 px-10 text-11" onClick={() => setConfirmService(r.server)} disabled={!!status}>
                                {status === "loading" ? "..." : status === "success" ? "Sent" : "Restart"}
                              </button>
                            )}
                          </td>
                        )}
                      </tr>
                    )
                  })
                )}
              </tbody>
            </>
          );
        }}
      />

      <EnhancedModal
        open={openReboot} onClose={() => setOpenReboot(false)} title={`${title.replace("KPI", "Reboot Pending")}`}
        rows={rebootRows} loading={rebootLoading} error={globalError}
        extraToolbar={
          <div className="flex-row gap-8 items-center">
             {selectedReboots.size > 0 && (
                <>
                  <span className="pill amber">{selectedReboots.size} selected</span>
                  <button className="btn pri h-32 px-12 text-12" onClick={() => setConfirmBulkReboot(true)}>Restart Selected</button>
                </>
             )}
             {bulkRebootStatus && <span className="text-12 text-success">{bulkRebootStatus}</span>}
          </div>
        }
        renderRows={(rows, handleSort, sortConfig) => (
          <>
            <thead className="kpi-th-sticky">
              <tr>
                <th className="w-40 kpi-td-center"><input type="checkbox" className="custom-checkbox" onChange={toggleAllReboots} checked={rebootRows.length > 0 && selectedReboots.size === rebootRows.length} /></th>
                <th className="cursor-pointer" onClick={() => handleSort('server')}>Server {sortConfig.key==='server'?(sortConfig.dir==='asc'?'↑':'↓'):''}</th>
                <th>Pending Restart</th>
                <th>IP</th>
                <th>UpTime</th>
                <th>BES Relay</th>
                <th className="w-140 kpi-td-center">Action</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (<tr><td colSpan={7} className="sub">No computers require reboot.</td></tr>) : (
                rows.map((r, i) => {
                  const status = actionStatus[r.server];
                  return (
                    <tr key={i} onClick={() => toggleRebootSelection(r.server)} className={`cursor-pointer ${selectedReboots.has(r.server) ? 'selected-row' : ''}`}>
                      <td className="kpi-td-center"><input type="checkbox" className="custom-checkbox" checked={selectedReboots.has(r.server)} readOnly /></td>
                      <td>{r.server || "N/A"}</td>
                      <td>{String(r.pendingRestart ?? r.pending ?? r.restart ?? "N/A")}</td>
                      <td>{r.ip || "N/A"}</td>
                      <td>{r.uptime || "N/A"}</td>
                      <td>{r.besRelay || "N/A"}</td>
                      <td className="kpi-td-center" onClick={e => e.stopPropagation()}>
                        <button className="btn pri h-32 px-10 text-11" onClick={() => setConfirmRestart(r.server)} disabled={!!status}>
                          {status === "loading" ? "..." : status === "success" ? "Sent" : "Restart"}
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </>
        )}
      />

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
           <div className="kpi-bulk-box">{Array.from(selectedReboots).join(", ")}</div>
        </ConfirmationModal>
      )}
    </section>
  );
}