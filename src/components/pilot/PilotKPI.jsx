// frontend/src/components/pilot/PilotKPI.jsx
import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import PropTypes from "prop-types";
import { useEnvironment } from "../Environment.jsx";

const API_BASE = globalThis.env?.VITE_API_BASE || "";

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
  try { return JSON.parse(t); } catch (e) { console.warn(e); throw new Error(`Unexpected (not JSON): ${t.slice(0, 400)}`); }
}

async function postJSON(url, body) {
  const r = await fetch(url, {
    method: "POST",
    headers: getHeaders(),
    body: JSON.stringify(body),
  });
  const t = await r.text();
  let j; try { j = JSON.parse(t); } catch (e) { console.warn(e); throw new Error(`Unexpected response: ${t.slice(0, 400)}`); }
  if (!r.ok || j?.ok === false) throw new Error(j?.error || j?.message || `HTTP ${r.status}`);
  return j;
}

// S7721 Fix: Moved classify outside the component body
function classify(raw) {
  const s = String(raw || "").trim();
  if (!s) return "Not Reported";
  const L = s.toLowerCase();
  if (/^fixed$/i.test(s) || /executed successfully/i.test(L) || /success/i.test(L)) return "Fixed";
  if (/^completed$/i.test(s)) return "Completed";
  return s;
}

// S7737 Fix: Extracted default parameter object
const defaultOptions = { threshold: 0.2, rootMargin: "0px 0px -20% 0px" };
function useInView(ref, options = defaultOptions) {
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

// S3358 Fix: Extracted nested ternaries into independent statements
const toneForSuccess = (pct, th = 90) => {
    if (pct >= th) return "green";
    if (pct >= th - 5) return "amber";
    return "red";
};

const toneForCHF = (n) => {
    if (n === 0) return "green";
    if (n <= 3) return "amber";
    return "red";
};

const rebootTone = (n) => {
    if (n === 0) return "green";
    return "amber";
};

const escapeHtml = (str) => String(str ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");

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
  if (!rows?.length) return "";
  const header = Object.keys(rows[0]).join(",");
  const escape = (v) => {
    const s = String(v ?? "");
    if (s.includes(",") || s.includes('"') || s.includes("\n")) return `"${s.replaceAll('"', '""')}"`;
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
  const noDataRow = `<tr><td colspan="10">No Data</td></tr>`;
  const tbodyContent = rows?.length ? rows.map(r => {
      const keys = Object.keys(r);
      const cells = keys.map(k => `<td>${escapeHtml(r[k])}</td>`).join("");
      return `<tr>${cells}</tr>`;
  }).join("") : noDataRow;

  const keys = rows?.length ? Object.keys(rows[0]) : [];
  const head = `<meta charset="utf-8"/><title>${safeTitle}</title><style>body{font-family:system-ui,-apple-system,sans-serif;padding:16px;color:#111827}h1{font-size:18px;margin:0 0 12px}table{border-collapse:collapse;width:100%}th,td{border:1px solid #e5e7eb;padding:8px 10px;font-size:14px}thead th{background:#f8fafc;text-align:left}</style>`;
  const ths = keys.map(k => `<th>${escapeHtml(k)}</th>`).join("");
  return `<!doctype html><html><head>${head}</head><body><h1>${safeTitle}</h1><table><thead><tr>${ths}</tr></thead><tbody>${tbodyContent}</tbody></table></body></html>`;
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
    const safeTitle = title.replaceAll(/[^\w.-]+/g, "_");
    
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
        try { iframe.contentWindow?.focus(); iframe.contentWindow?.print(); } catch (e) { console.warn(e); }
        setTimeout(() => { URL.revokeObjectURL(url); iframe.remove(); }, 2000);
      };
      document.body.appendChild(iframe);
    }
  };

  if (!open) return null;

  return (
    <div className="modal show" aria-modal="true" role="dialog" aria-label={title} onMouseDown={onClose} tabIndex={-1}>
      <div className="box action-modal-box max-w-1100 w-95p" onMouseDown={e => e.stopPropagation()}>
        <div className="action-modal-header">
          <h3>{title}</h3>
          <button type="button" className="btn" onClick={onClose}>Close</button>
        </div>

        <div className="flex-row gap-12 mb-12 wrap items-center">
          <input type="text" className="control flex-1 min-w-240" placeholder="Search..." value={filter} onChange={e => setFilter(e.target.value)} />
          {extraToolbar}
          <div className="dropdown" ref={exportBtnRef}>
            <button type="button" className="btn" onClick={() => setShowExportMenu(s => !s)}>
              Export
              <svg width="14" height="14" viewBox="0 0 24 24" className="ml-6"><path d="M6 9l6 6 6-6" fill="none" stroke="currentColor" strokeWidth="2" /></svg>
            </button>
            {showExportMenu && (
              <div className="menu">
                <button type="button" className="item" onClick={() => doExport('csv')}>Export to CSV</button>
                <button type="button" className="item" onClick={() => doExport('pdf')}>Export to PDF</button>
                <button type="button" className="item" onClick={() => doExport('html')}>Export to HTML</button>
              </div>
            )}
          </div>
        </div>

        <div className="tableWrap action-modal-body">
          {(() => {
            if (loading) return <div className="action-modal-loading muted-text text-center">Loading...</div>;
            if (error) return <div className="action-modal-loading text-danger text-center">{error}</div>;
            return (
              <table className="action-modal-table">
                {renderRows(paginated, handleSort, sortConfig)}
              </table>
            );
          })()}
        </div>

        <div className="action-modal-footer">
          <div className="muted-text text-13">Showing {sorted.length === 0 ? 0 : (page - 1) * pageSize + 1} to {Math.min(page * pageSize, sorted.length)} of {sorted.length} entries</div>
          <div className="action-modal-nav">
            <div className="dropdown mr-10" ref={pageBtnRef}>
               <button type="button" className="btn h-32 px-10 text-13 min-w-90 justify-between" onClick={() => setShowPageMenu(!showPageMenu)}>
                 <span>{pageSize} / page</span>
                 <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" style={{transform: showPageMenu ? 'rotate(180deg)' : 'none', transition: '0.2s'}}><path d="M6 9l6 6 6-6"/></svg>
               </button>
               {showPageMenu && (
                 <div className="menu page-menu-up">
                    {[10, 25, 50, 100].map(opt => (
                       <button type="button" key={opt} className="item" onClick={() => { setPageSize(opt); setShowPageMenu(false); }}>{opt} / page</button>
                    ))}
                 </div>
               )}
            </div>
            <button type="button" className="btn h-32 px-10" disabled={page === 1} onClick={() => setPage(p => p - 1)}>Prev</button>
            <span className="fw-600">Page {page} of {totalPages || 1}</span>
            <button type="button" className="btn h-32 px-10" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>Next</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// S6774 Fix: Props Validation
EnhancedModal.propTypes = {
  open: PropTypes.bool,
  onClose: PropTypes.func,
  title: PropTypes.string,
  rows: PropTypes.array,
  loading: PropTypes.bool,
  error: PropTypes.string,
  renderRows: PropTypes.func,
  csvFilter: PropTypes.func,
  extraToolbar: PropTypes.node
};

function MetricTile({ label, value, tone, delay = 0, onClick }) {
  const Tag = onClick ? "button" : "div";
  const extraProps = onClick
    ? { type: "button", onClick }
    : {};
  return (
    <Tag
      className={`kpi kpi-metric-tile ${onClick ? "clickable" : ""}`}
      style={{ animationDelay: `${delay}ms` }}
      {...extraProps}
    >
      <span className="label fw-800">{label}</span>
      <span className="value">
        <span className={`pill click ${tone} fw-900`}>{value}</span>
      </span>
    </Tag>
  );
}

// S6774 Fix: Props Validation
MetricTile.propTypes = {
  label: PropTypes.string,
  value: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
  tone: PropTypes.string,
  delay: PropTypes.number,
  onClick: PropTypes.func
};

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

function getKpiType(key) {
  if (key === 'Success') return 'success';
  if (key === 'Health Failures') return 'health';
  return 'reboot';
}

function DonutChart({ donut, center, hoverKey, setHoverKey, onClickMap }) {
  const handleSliceClick = (e, key) => {
      e.stopPropagation();
      const lowerKey = String(key).toLowerCase();
      if (lowerKey === 'success' && onClickMap.success) onClickMap.success();
      else if (lowerKey === 'health failures' && onClickMap.health) onClickMap.health();
      else if (lowerKey === 'reboot pending' && onClickMap.reboot) onClickMap.reboot();
  };

  const getVal = (key) => donut.find(d => d.key === key)?.val || 0;

  return (
    <div className="chart">
      <svg viewBox="0 0 120 64" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
        <g transform="translate(0,0)">
          {donut.length === 0 ? (
            fullRingPaths(30, 32, 26, 16).map((path, idx) => (
                <path key={`empty-half-${idx === 0 ? 'top' : 'bottom'}`} d={path} fill="var(--panel-2)" stroke="var(--border)" strokeWidth="1" />
            ))
          ) : (
            donut.map((s) => {
              const mid = (s.start + s.end) / 2;
              const rad = ((mid - 90) * Math.PI) / 180;
              const explode = hoverKey === s.key ? 3 : 0;
              const dx = explode * Math.cos(rad);
              const dy = explode * Math.sin(rad);
              const d = arcPath(30, 32, 26, s.start, s.end, 16);
              const isFull = d === null;
              const kpiType = getKpiType(s.key);
              
              const activeStyle = { transition: "transform 0.2s, filter 0.2s", filter: hoverKey === s.key ? "brightness(1.06)" : "none", cursor: 'pointer' };
              
              if (isFull) {
                return (
                  <g key={s.key} transform={`translate(${dx},${dy})`} style={activeStyle} onClick={() => handleKpiClick(kpiType)}>
                    {fullRingPaths(30, 32, 26, 16).map((pd, halfIdx) => (
                      <path key={`full-half-${halfIdx === 0 ? 'top' : 'bottom'}`} d={pd} fill={s.fill} stroke="var(--panel-1)" strokeWidth="0.2" />
                    ))}
                  </g>
                );
              }
              return (
                <path
                  key={s.key}
                  d={d}
                  fill={s.fill}
                  stroke="var(--panel-1)"
                  strokeWidth="0.2"
                  transform={`translate(${dx},${dy})`}
                  onMouseEnter={() => setHoverKey(s.key)}
                  onMouseLeave={() => setHoverKey(null)}
                  onClick={() => handleKpiClick(kpiType)}
                  style={activeStyle}
                />
              );
            })
          )}
          <text x="30" y="29" textAnchor="middle" fontSize="7" fontWeight="600" fill="var(--text)" style={{ pointerEvents: 'none' }}>{center.pct}%</text>
          <text x="30" y="38" textAnchor="middle" fontSize="5" fill="var(--muted)" style={{ pointerEvents: 'none' }}>{center.label}</text>
        </g>
        <g transform="translate(64,10)" fontSize="6">
          {[{ key: "Success", fill: "var(--success)", y: 7 }, { key: "Reboot Pending", fill: "var(--warn)", y: 18 }, { key: "Health Failures", fill: "var(--danger)", y: 30 }].map((l) => (
            <g key={l.key} transform={`translate(6,${l.y})`} onClick={(e) => handleSliceClick(e, l.key)} onMouseEnter={() => setHoverKey(l.key)} onMouseLeave={() => setHoverKey(null)} style={{ opacity: hoverKey && hoverKey !== l.key ? 0.7 : 1, transition: "opacity 160ms ease", cursor: "pointer" }}>
              <circle cx="4" cy="4" r="3" fill={l.fill} />
              <text x="12" y="6">{l.key} ({getVal(l.key)})</text> 
            </g>
          ))}
        </g>
      </svg>
    </div>
  );
}

// S6774 Fix: Props Validation
DonutChart.propTypes = {
  donut: PropTypes.array,
  center: PropTypes.shape({
    pct: PropTypes.number,
    label: PropTypes.string
  }),
  hoverKey: PropTypes.string,
  setHoverKey: PropTypes.func,
  onClickMap: PropTypes.shape({
    success: PropTypes.func,
    health: PropTypes.func,
    reboot: PropTypes.func
  })
};

function ConfirmationModal({ open, title, children, onClose, onConfirm, busy = false }) {
  if (!open) return null;
  return (
    <div className="modal show" aria-modal="true" role="dialog" aria-label={title || "Confirm Action"} onMouseDown={onClose} tabIndex={-1}>
      <div className="box max-w-520" onMouseDown={(e) => e.stopPropagation()}>
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

// S6774 Fix: Props Validation
ConfirmationModal.propTypes = {
  open: PropTypes.bool,
  title: PropTypes.string,
  children: PropTypes.node,
  onClose: PropTypes.func,
  onConfirm: PropTypes.func,
  busy: PropTypes.bool
};

// S2004 Fix: Extracted deep nested promises into standalone helpers
const fetchGroupHealth = async (groups, signal) => {
    if (groups.length === 0) return { count: 0, rows: [] };
    const results = await Promise.all(groups.map(async (g) => {
        return await getJson(`${API_BASE}/api/health/critical?group=${encodeURIComponent(g)}`, signal).catch((e) => { if (e?.name !== "AbortError") console.warn(e); return null; });
    }));
    const allRows = [];
    results.forEach(res => { if (Array.isArray(res?.rows)) allRows.push(...res.rows); });
    const map = new Map();
    allRows.forEach(r => { if (r.server && !map.has(r.server)) map.set(r.server, r); });
    const uRows = Array.from(map.values());
    return { count: uRows.length, rows: uRows };
};

// S2004 Fix: Extracted deep nested promises into standalone helpers
const fetchGroupReboot = async (groups, signal) => {
    if (groups.length === 0) return { count: 0, rows: [] };
    const results = await Promise.all(groups.map(async (g) => {
        return await getJson(`${API_BASE}/api/health/reboot-pending?group=${encodeURIComponent(g)}`, signal).catch((e) => { if (e?.name !== "AbortError") console.warn(e); return null; });
    }));
    const allRows = [];
    results.forEach(res => { if (Array.isArray(res?.rows)) allRows.push(...res.rows); });
    const map = new Map();
    allRows.forEach(r => { if (r.server && !map.has(r.server)) map.set(r.server, r); });
    const uRows = Array.from(map.values());
    return { count: uRows.length, rows: uRows };
};

// S2004 Fix: Extracted deep nested promises into standalone helpers
const fetchActionSuccess = async (actionsArray, signal, actionDeadRef, setIsActionStopped) => {
    if (actionsArray.length === 0) return { rate: 0, success: 0, total: 0 };
    if (actionDeadRef.current) return null;

    let globalSuccess = 0;
    let globalTotal = 0;
    let allStopped = true;

    await Promise.all(actionsArray.map(async (act) => {
        const idToUse = act.actionId;
        if (!idToUse) return;

        try {
            const statusRes = await getJson(`${API_BASE}/api/actions/${idToUse}/status`, signal).catch((e)=>{ if (e?.name !== "AbortError") console.warn(e); return {}; });
            const st = String(statusRes?.state || "").toLowerCase();
            const isDone = st === 'stopped' || st === 'expired';
            if (!isDone) allStopped = false;

            const res = await getJson(`${API_BASE}/api/actions/${idToUse}/results`, signal).catch((e)=>{ if (e?.name !== "AbortError") console.warn(e); return null; });
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

            globalSuccess += success;
            globalTotal += total;
        } catch (e) {
            console.warn(e);
        }
    }));

    const rate = globalTotal > 0 ? Math.round((globalSuccess / globalTotal) * 100) : 0;

    if (allStopped) {
        actionDeadRef.current = true;
        setIsActionStopped(true);
    }

    return { rate, success: globalSuccess, total: globalTotal };
};

export default function PilotKPI({ title = "Pilot KPI", lastActions = {}, onKpiClick }) {
  const mode = /production/i.test(title) ? "production" : "pilot";
  const { env } = useEnvironment();
  
  const getPinnedActionId = useCallback(() => {
    try {
      const la = lastActions || {};
      const stageData = mode === "production" ? la?.PILOT : la?.SANDBOX;
      
      if (stageData?.actions && Array.isArray(stageData.actions)) {
          return stageData.actions.map(a => a.actionId).join(",");
      }
      return stageData?.id ?? null;
    } catch {
      return null;
    }
  }, [lastActions, mode]);

  const scopeGroup = useMemo(() => {
    try {

      const deps = mode === "production" ? env?.prodDeployments : env?.pilotDeployments;
      if (Array.isArray(deps)) {
          const selected = [...new Set(deps.map(d => d?.group).filter(Boolean))].join(", ");
          if (selected) return selected;
      }

      const prevStageEnabled = mode === "production"
        ? (env?.enablePilot !== false && String(env?.enablePilot) !== "false")
        : (env?.enableSandbox !== false && String(env?.enableSandbox) !== "false");
      if (prevStageEnabled) {
        const la = lastActions || {};
        const stageData = mode === "production" ? la?.PILOT : la?.SANDBOX;
        if (stageData?.actions && Array.isArray(stageData.actions)) {
            const g = [...new Set(stageData.actions.map(a => a.group).filter(Boolean))].join(", ");
            if (g) return g;
        } else if (stageData?.group) {
            return stageData.group;
        }
      }

      return null;
    } catch {
      return null;
    }
  }, [lastActions, mode, env?.pilotDeployments, env?.prodDeployments, env?.enableSandbox, env?.enablePilot]);

  const [activeActionId, setActiveActionId] = useState(null);
  const [isActionStopped, setIsActionStopped] = useState(false);
  const actionDeadRef = useRef(false);


  const lastActionsRef = useRef(lastActions);
  useEffect(() => { lastActionsRef.current = lastActions; }, [lastActions]);

  const [kpi, setKpi] = useState({ rebootPending: 0, critHealthFails: 0, successRate: 0, successCount: 0, totalCount: 0 });
  
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

  useEffect(() => {
    const id = getPinnedActionId();
    if (id) {
       setActiveActionId(id);
       setIsActionStopped(false); 
       actionDeadRef.current = false;
    }
  }, [getPinnedActionId()]);

  const rootRef = useRef(null);
  useInView(rootRef);

  const donut = useMemo(() => {
    const R = kpi.rebootPending || 0;
    const H = kpi.critHealthFails || 0;
    const S_action = kpi.successCount || 0;

    const partsCombined = [
      { key: "Success", val: S_action, fill: "var(--success)" },
      { key: "Reboot Pending", val: R, fill: "var(--warn)" },
      { key: "Health Failures", val: H, fill: "var(--danger)" },
    ];
    const total = partsCombined.reduce((a, b) => a + b.val, 0) || 1;
    let acc = 0;
    return partsCombined.map((p) => {
      const start = (acc / total) * 360;
      const end = ((acc + p.val) / total) * 360;
      acc += p.val;
      return { ...p, start, end, pct: Math.round((p.val / total) * 100) };
    });
  }, [kpi.rebootPending, kpi.critHealthFails, kpi.successCount]);

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
          onKpiClick({ type, group: scopeGroup, id: activeActionId, fromKpi: true });
      } else if (type === 'success') {
          openSuccessModal();
      } else if (type === 'health') {
          openHealthModal();
      } else if (type === 'reboot') {
          openRebootModal();
      }
  };

  async function openSuccessModal() {
    setOpenSuccess(true);
    const id = activeActionId;
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
      const groupNamesArray = scopeGroup ? scopeGroup.split(",").map(g => g.trim()).filter(Boolean) : [];
      const ch = await fetchGroupHealth(groupNamesArray, null);
      setHealthRows(ch.rows);
    } catch { setHealthRows([]); } finally { setHealthLoading(false); }
  }

  async function openRebootModal() {
    setOpenReboot(true); setGlobalError(""); setSelectedReboots(new Set()); 
    try {
      setRebootLoading(true);
      const groupNamesArray = scopeGroup ? scopeGroup.split(",").map(g => g.trim()).filter(Boolean) : [];
      const rp = await fetchGroupReboot(groupNamesArray, null);
      setRebootRows(rp.rows);
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

  useEffect(() => {
    let timer; const ab = new AbortController();
    let running = false; // prevents overlapping polls when a cycle runs long

    async function tick() {
      if (running) return; // a previous cycle is still in flight; skip this beat
      running = true;
      try {
        const groupNamesArray = scopeGroup ? [...new Set(scopeGroup.split(",").map(g => g.trim()).filter(Boolean))] : [];

        const pHealth = fetchGroupHealth(groupNamesArray, ab.signal);
        const pReboot = fetchGroupReboot(groupNamesArray, ab.signal);

        let actionsArray = [];
        try {
            const la = lastActionsRef.current || {};
            const stageData = mode === "production" ? la?.PILOT : la?.SANDBOX;
            if (stageData?.actions && Array.isArray(stageData.actions)) {
                actionsArray = stageData.actions;
            } else if (activeActionId) {
                actionsArray = [{ actionId: activeActionId }];
            }
        } catch(e) { console.warn(e); }

        const pSuccess = fetchActionSuccess(actionsArray, ab.signal, actionDeadRef, setIsActionStopped);

        const [ch, rp, successData] = await Promise.all([pHealth, pReboot, pSuccess]);

        // Update UI
        setKpi((p) => {
          const nextKpi = { ...p };
          
          if (ch !== null) nextKpi.critHealthFails = Number(ch?.count || 0);
          if (rp !== null) {
              nextKpi.rebootPending = Number(rp?.count || 0);
              setRebootRows(rp.rows); 
          }
          if (successData !== null) {
              nextKpi.successRate = successData.rate;
              nextKpi.successCount = successData.success;
              nextKpi.totalCount = successData.total;
          }
          
          return nextKpi;
        });

      } catch (err) {
        if (err.name !== "AbortError") console.warn("PilotKPI refresh failed:", err?.message || err);
      } finally {
        running = false;
      }
    }
    
    tick(); 
    timer = setInterval(tick, 15000); 
    return () => { clearInterval(timer); ab.abort(); };
  }, [mode, scopeGroup, activeActionId, isActionStopped]);

  const getSortArrow = (config, key) => {
    if (config.key !== key) return '';
    return config.dir === 'asc' ? '↑' : '↓';
  };

  return (
    <section ref={rootRef} className="card reveal" data-reveal>
      <h2>{title}</h2>
      <div className="kpi-row-wrap" style={{ marginBottom: 0 }}>
        <div className="flex-1 min-w-220">
          <div className="kpis kpi-row-wrap">
            {!isEUC && (
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
          
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%', gap: '32px', marginTop: '16px' }}>
  <div style={{ width: '160px', flexShrink: 0, display: 'flex', justifyContent: 'center', marginLeft: '50px' }}>
    <svg viewBox="0 0 120 120" aria-hidden="true" className="donut-svg" style={{ cursor: 'pointer', width: '100%', height: 'auto' }}>
      <g transform="translate(60,60)">
        {donut.length === 0 ? (
          fullRingPaths(0, 0, 48, 30).map((pd, idx) => (
            <path key={`empty-half-${idx === 0 ? 'top' : 'bottom'}`} d={pd} fill="var(--panel-2)" stroke="var(--border)" strokeWidth="1" />
          ))
        ) : (
          donut.map((s) => {
            const mid = (s.start + s.end) / 2;
            const rad = ((mid - 90) * Math.PI) / 180;
            const explode = hoverKey === s.key ? 3 : 0;
            const dx = explode * Math.cos(rad);
            const dy = explode * Math.sin(rad);
            const d = arcPath(0, 0, 48, s.start, s.end, 30);
            const isFull = d === null;
            const kpiType = getKpiType(s.key);
            
            const activeStyle = { transition: "transform 0.2s, filter 0.2s", filter: hoverKey === s.key ? "brightness(1.06)" : "none", cursor: 'pointer' };
            
            if (isFull) {
              return (
                <g key={s.key} transform={`translate(${dx},${dy})`} style={activeStyle} onClick={(e) => { e.stopPropagation(); handleKpiClick(kpiType); }}>
                  {fullRingPaths(0, 0, 48, 30).map((pd, halfIdx) => (
                    <path key={`full-half-${halfIdx === 0 ? 'top' : 'bottom'}`} d={pd} fill={s.fill} stroke="var(--panel-1)" strokeWidth="0.2" />
                  ))}
                </g>
              );
            }
            return (
              <path
                key={s.key}
                d={d}
                fill={s.fill}
                stroke="var(--panel-1)"
                strokeWidth="0.2"
                transform={`translate(${dx},${dy})`}
                onMouseEnter={() => setHoverKey(s.key)}
                onMouseLeave={() => setHoverKey(null)}
                onClick={(e) => { e.stopPropagation(); handleKpiClick(kpiType); }}
                style={activeStyle}
              />
            );
          })
        )}
        <text x="0" y="-2" textAnchor="middle" fontSize="14" fontWeight="800" fill="var(--text)" style={{ pointerEvents: 'none' }}>
          {center.pct}%
        </text>
        <text x="0" y="12" textAnchor="middle" fontSize="7" fill="var(--muted)" style={{ pointerEvents: 'none' }}>
          {center.label}
        </text>
      </g>
    </svg>
  </div>

  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '130px', overflowY: 'auto', paddingRight: '8px' }} className="custom-scrollbar">
    {donut.length === 0 && <div className="muted-text text-12">No Data</div>}
    {donut.map(l => {
      const kpiType = getKpiType(l.key);
      const legendTitleMap = {
        'Success': 'Action executed successfully',
        'Reboot Pending': 'Computers waiting for reboot',
        'Health Failures': 'Critical health failures',
      };
      const legendTitle = legendTitleMap[l.key] || l.key;
      return (
        <button
          key={l.key}
          type="button"
          onClick={() => handleKpiClick(kpiType)}
          onMouseEnter={() => setHoverKey(l.key)}
          onMouseLeave={() => setHoverKey(null)}
          style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', opacity: hoverKey && hoverKey !== l.key ? 0.4 : 1, transition: '0.2s', background: 'none', border: 'none', padding: 0 }}
          title={legendTitle}
        >
          <span style={{ width: '10px', height: '10px', borderRadius: '50%', backgroundColor: l.fill, flexShrink: 0 }}></span>
          <span style={{ fontSize: '12px', color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {l.key} ({l.val})
          </span>
        </button>
      );
    })}
  </div>
</div>
        </div>
      </div>

      <EnhancedModal 
        open={openSuccess} onClose={() => setOpenSuccess(false)} title={`${title.replace("KPI", "Success Details")}`} 
        rows={successRows} loading={successLoading} 
        renderRows={(rows, handleSort, sortConfig) => (
          <>
            <thead className="kpi-th-sticky">
              <tr>
                <th className="cursor-pointer" onClick={() => handleSort('server')} onKeyDown={(e) => { if(e.key === 'Enter') handleSort('server'); }} tabIndex={0}>Server {getSortArrow(sortConfig, 'server')}</th>
                <th className="cursor-pointer" onClick={() => handleSort('patch')} onKeyDown={(e) => { if(e.key === 'Enter') handleSort('patch'); }} tabIndex={0}>Patch Name {getSortArrow(sortConfig, 'patch')}</th>
                <th className="cursor-pointer" onClick={() => handleSort('status')} onKeyDown={(e) => { if(e.key === 'Enter') handleSort('status'); }} tabIndex={0}>Status {getSortArrow(sortConfig, 'status')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (<tr><td colSpan={3} className="sub">No success rows.</td></tr>) : (rows.map((r, i) => (
                  <tr key={r.server || `fallback-${i}`}>
                      <td>{r.server || "—"}</td>
                      <td>{r.patch || "—"}</td>
                      <td><span className="pill green">Success</span></td>
                  </tr>
              )))}
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
                  <th className="cursor-pointer" onClick={() => handleSort('server')} onKeyDown={(e) => { if(e.key === 'Enter') handleSort('server'); }} tabIndex={0}>Server {getSortArrow(sortConfig, 'server')}</th>
                  <th className="cursor-pointer" onClick={() => handleSort('issues')} onKeyDown={(e) => { if(e.key === 'Enter') handleSort('issues'); }} tabIndex={0}>Issue {getSortArrow(sortConfig, 'issues')}</th>
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
                      <tr key={r.server || `fallback-${i}`}>
                        <td>{r.server || "N/A"}</td>
                        <td>{(r.issues || []).map((issue) => (<span key={issue} className="pill red mr-10 text-11">{issue}</span>))}</td>
                        {showService && <td>{isWindows ? "Window Update" : "—"}</td>}
                        {showService && <td>{isWindows ? (r.serviceStatus || "N/A") : "—"}</td>}
                        <td>{r.lastReportTime}</td>
                        {showService && (
                          <td className="kpi-td-center">
                            {canRestart && (
                              <button type="button" className="btn pri h-32 px-10 text-11" onClick={() => setConfirmService(r.server)} disabled={!!status}>
                                {(() => {
                                  if (status === "loading") return "...";
                                  if (status === "success") return "Sent";
                                  return "Restart";
                                })()}
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
                  <button type="button" className="btn pri h-32 px-12 text-12" onClick={() => setConfirmBulkReboot(true)}>Restart Selected</button>
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
                <th className="cursor-pointer" onClick={() => handleSort('server')} onKeyDown={(e) => { if(e.key === 'Enter') handleSort('server'); }} tabIndex={0}>Server {getSortArrow(sortConfig, 'server')}</th>
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
                    <tr key={r.server || `fallback-${i}`} onClick={() => toggleRebootSelection(r.server)} className={`cursor-pointer ${selectedReboots.has(r.server) ? 'selected-row' : ''}`}>
                      <td className="kpi-td-center"><input type="checkbox" className="custom-checkbox" checked={selectedReboots.has(r.server)} readOnly /></td>
                      <td>{r.server || "N/A"}</td>
                      <td>{String(r.pendingRestart ?? r.pending ?? r.restart ?? "N/A")}</td>
                      <td>{r.ip || "N/A"}</td>
                      <td>{r.uptime || "N/A"}</td>
                      <td>{r.besRelay || "N/A"}</td>
                      <td className="kpi-td-center" onClick={e => e.stopPropagation()}>
                        <button type="button" className="btn pri h-32 px-10 text-11" onClick={() => setConfirmRestart(r.server)} disabled={!!status}>
                          {(() => {
                            if (status === "loading") return "...";
                            if (status === "success") return "Sent";
                            return "Restart";
                          })()}
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

PilotKPI.propTypes = {
  title: PropTypes.string,
  lastActions: PropTypes.object,
  onKpiClick: PropTypes.func
};