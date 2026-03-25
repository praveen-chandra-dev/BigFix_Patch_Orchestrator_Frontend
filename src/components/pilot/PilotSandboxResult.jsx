// src/components/pilot/PilotSandboxResult.jsx
import { useEffect, useMemo, useState, useRef, useCallback } from "react";
import FilterDrawer from "../FilterDrawer";

const API_BASE = window.env.VITE_API_BASE;

/* ------------------------------- helpers ------------------------------- */
async function getJson(url, signal) {
  const r = await fetch(url, { headers: { Accept: "application/json" }, cache: "no-store", signal });
  const t = await r.text();
  if (!r.ok) throw new Error(`HTTP ${r.status}: ${t.slice(0, 400)}`);
  return JSON.parse(t);
}

const fmtTime = (s) => {
  if (!s || s === "N/A") return "—";
  const m = s.match(/\b(\d{2}:\d{2}:\d{2})\b/);
  return m ? m[1] : s;
};

const escapeHtml = (str) =>
  String(str ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

const BUCKETS = [
  "Fixed", "Completed", "Running", "Evaluating", "Waiting", "Pending Downloads", 
  "Pending Restart", "Pending Client Restart", "Pending Message", "Pending Login", 
  "Pending Offer Acceptance", "Failed", "error", "Download Failed", "Cancelled", 
  "Locked", "Constrained", "Postponed", "Invalid Signature", "Offers Disabled", 
  "Disk Limited", "Disk Free Limited", "Hash Mismatch", "Transcoding Error", 
  "Not Relevant", "Not Reported"
];

const ORDER = [
  "Fixed", "Completed", "Running", "Evaluating", "Pending Restart", "Pending Client Restart",
  "Pending Message", "Pending Login", "Waiting", "Pending Downloads", "Pending Offer Acceptance",
  "Failed", "error", "Download Failed", "Cancelled", "Locked", "Constrained", "Postponed",
  "Invalid Signature", "Offers Disabled", "Disk Limited", "Disk Free Limited", "Hash Mismatch",
  "Transcoding Error", "Not Relevant", "Not Reported"
];

const DESCRIPTIONS = {
  "Not Reported": "No report on this action yet. We cannot confirm if the action has been propagated, mirrored, gathered, processed, or reported until this status changes.",
  "Fixed": "The action executed successfully. The BigFix Client has run the action and the relevance is now false (meaning that the action ran and fixed the issue).",
  "Running": "The action is currently running.",
  "Evaluating": "Evaluating relevance and action constraints. The BigFix Client has received the action targeted at it and will evaluate it.",
  "Completed": "The action has completed and no other actions are required.",
  "Failed": "The action failed. The BigFix Client has run the action and the issue is still relevant.",
  "Cancelled": "The action was canceled by the user.",
  "Download Failed": "A required download failed.",
  "Locked": "This computer is locked. The BigFix Client is in the 'Locked' state that prevents it from running actions.",
  "Waiting": "The BigFix Client is waiting for some condition to be able to run the action (e.g., dependencies, time range, user input).",
  "Pending Downloads": "Waiting for downloads to be mirrored. The BigFix Client is waiting to receive the complete file.",
  "Pending Restart": "Waiting for restart to complete action. The status cannot be assessed until the computer is restarted.",
  "Pending Message": "Waiting for user to respond to message.",
  "Pending Login": "Waiting for user to log in.",
  "Constrained": "The computer doesn't meet the specified retrieved property constraint.",
  "Postponed": "The user postponed execution of this action.",
  "Invalid Signature": "The client was unable to verify the signature on this action.",
  "Not Relevant": "The Fixlet that this action addresses is not relevant on this machine.",
  "Pending Offer Acceptance": "Waiting for user to accept this offer.",
  "Offers Disabled": "No user is able to accept this offer.",
  "Disk Limited": "The download size exceeds the maximum value set in the client setting.",
  "Disk Free Limited": "The remaining disk space is smaller than the required value.",
  "Hash Mismatch": "The download completed, but the file failed a hash comparison.",
  "Transcoding Error": "The action failed transcoding from the deployment codepage.",
  "Pending Client Restart": "Waiting for client restart to complete action.",
  "error": "An unknown error occurred (e.g., missing context, invalid content, download syntax error, UI translation error)."
};

const COLOR = {
  Fixed: "#10b981", Completed: "#059669", 
  Failed: "#ef4444", error: "#b91c1c", "Download Failed": "#dc2626", 
  Running: "#2563eb", Evaluating: "#0ea5e9", Waiting: "#8b5cf6", 
  "Pending Restart": "#f59e0b", "Pending Client Restart": "#d97706",
  "Pending Message": "#ea580c", "Pending Login": "#f97316", 
  "Pending Downloads": "#eab308", "Pending Offer Acceptance": "#fb923c", 
  Cancelled: "#6b7280", Locked: "#4b5563", Constrained: "#71717a",
  Postponed: "#a1a1aa", "Invalid Signature": "#52525b", "Offers Disabled": "#3f3f46", 
  "Disk Limited": "#fb7185", "Disk Free Limited": "#c2410c", "Hash Mismatch": "#d946ef", 
  "Transcoding Error": "#9a3412", "Not Relevant": "#94a3b8", "Not Reported": "#cbd5e1"
};

const EXTRA = ["#10b981", "#f97316", "#e11d48", "#84cc16", "#14b8a6", "#8b5cf6", "#f43f5e"];
function pickColor(label) {
  if (COLOR[label]) return COLOR[label];
  let h = 0;
  for (let i = 0; i < label.length; i++) h = (h * 31 + label.charCodeAt(i)) >>> 0;
  return EXTRA[h % EXTRA.length];
}

function classify(raw) {
  const s = String(raw || "").trim();
  if (!s) return "Not Reported";
  const L = s.toLowerCase();
  
  const exactBucket = BUCKETS.find(b => b.toLowerCase() === L);
  if (exactBucket) return exactBucket;

  if (/^fixed$/i.test(s) || /executed successfully/i.test(L) || /success/i.test(L)) return "Fixed";
  if (/^completed$/i.test(s)) return "Completed";
  if (/^running$/i.test(s) || /is currently running/i.test(L) || /evaluating/i.test(L)) return "Running";
  if (/^not reported$/i.test(s)) return "Not Reported";
  
  if (/waiting for restart/i.test(L) || /pending restart/i.test(L)) return "Pending Restart";
  if (/pending downloads/i.test(L) || /waiting for downloads/i.test(L)) return "Pending Downloads";
  if (/pending message/i.test(L) || /waiting for user to respond/i.test(L)) return "Pending Message";
  if (/pending login/i.test(L) || /waiting for user to log in/i.test(L)) return "Pending Login";
  if (/pending offer/i.test(L) || /waiting for user to accept/i.test(L)) return "Pending Offer Acceptance";
  if (/pending client restart/i.test(L) || /waiting for client restart/i.test(L)) return "Pending Client Restart";

  if (/constrained/i.test(L) || /constraint/i.test(L)) return "Constrained";
  if (/postponed/i.test(L)) return "Postponed";
  if (/invalid signature/i.test(L)) return "Invalid Signature";
  if (/not relevant/i.test(L)) return "Not Relevant";
  if (/offers disabled/i.test(L)) return "Offers Disabled";
  if (/disk limited/i.test(L)) return "Disk Limited";
  if (/disk free limited/i.test(L)) return "Disk Free Limited";
  if (/hash mismatch/i.test(L)) return "Hash Mismatch";
  if (/transcoding error/i.test(L) || /failed transcoding/i.test(L)) return "Transcoding Error";
  if (/unknown error|missing or invalid|invalid site|invalid action|invalid download|configuration error|unknown reasons|translation error|management extender/i.test(L)) return "error";

  if (/fail|error/i.test(L)) return "Failed";
  if (/wait|pending/i.test(L)) return "Waiting";
  
  return s; 
}

function countsFromRows(rows) {
  const map = new Map();
  for (const r of rows || []) {
    const raw = r?.status ?? r?.Status ?? r?.clientState ?? r?.result;
    const bucket = classify(raw);
    map.set(bucket, (map.get(bucket) || 0) + 1);
  }
  return map;
}

function countsFromObj(obj) {
  const sc = obj?.statusCounts || obj?.StatusCounts;
  if (sc && typeof sc === "object") {
    const m = new Map();
    for (const [raw, v] of Object.entries(sc)) {
      const bucket = classify(raw);
      m.set(bucket, (m.get(bucket) || 0) + Number(v || 0));
    }
    return m;
  }
  return new Map();
}

function arcPath(cx, cy, r, startDeg, endDeg, innerR = 0) {
  const sweep = endDeg - startDeg;
  const toRad = (d) => (d - 90) * (Math.PI / 180);
  if (sweep >= 359.999) return null;
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
  const header = ["Server Name", "Patch Name", "Start Time", "End Time", "Status", "Issuer"];
  const escape = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const lines = [header.join(",")];
  for (const r of rows) {
    const rawStatus = r.status || "Not Reported";
    lines.push([r.server, r.patch, fmtTime(r.start), fmtTime(r.end), rawStatus, r.issuer].map(escape).join(","));
  }
  return lines.join("\n");
}

function rowsToHTML(rows, title = "Results") {
  const safeTitle = escapeHtml(title);
  const head = `<meta charset="utf-8"/><title>${safeTitle}</title><style>body{font-family:system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;padding:16px;color:#111827}h1{font-size:18px;margin:0 0 12px}table{border-collapse:collapse;width:100%}th,td{border:1px solid #e5e7eb;padding:8px 10px;font-size:14px}thead th{background:#f8fafc;text-align:left}.status-pill { padding: 4px 8px; border-radius: 99px; font-size: 12px; font-weight: 600; display: inline-block; }.status-green { background: #dcfce7; color: #166534; }.status-red { background: #fee2e2; color: #991b1b; }.status-blue { background: #dbeafe; color: #1e40af; }.status-amber { background: #fef3c7; color: #92400e; }</style>`;
  const rowsHtml = (rows || []).map(r => {
    const s = classify(r.status);
    let displayStatus = s;
    if ((s === 'Waiting' || s === 'error' || s === 'Failed') && r.status && r.status.toLowerCase() !== s.toLowerCase()) {
        displayStatus = `${s} (${r.status})`;
    }
    const cls = (s === 'Fixed' || s === 'Completed') ? 'status-green' : (s === 'Failed' || s === 'error' || s === 'Download Failed') ? 'status-red' : (s === 'Running' || s === 'Evaluating') ? 'status-blue' : 'status-amber';
    return `<tr><td>${escapeHtml(r.server ?? "—")}</td><td>${escapeHtml(r.patch ?? "—")}</td><td>${escapeHtml(fmtTime(r.start))}</td><td>${escapeHtml(fmtTime(r.end))}</td><td><span class="status-pill ${cls}">${escapeHtml(displayStatus)}</span></td><td>${escapeHtml(r.issuer ?? "—")}</td></tr>`;
  }).join("");
  return `<!doctype html><html><head>${head}</head><body><h1>${safeTitle}</h1><table><thead><tr><th>Server Name</th><th>Patch Name</th><th>Start Time</th><th>End Time</th><th>Status</th><th>Issuer</th></tr></thead><tbody>${rowsHtml || `<tr><td colspan="6">No rows.</td></tr>`}</tbody></table></body></html>`;
}

export default function PilotSandboxResult({ title = "Sandbox Result", detailTitle, actionId, onViewDetails }) {
  const [lockedId, setLockedId] = useState(null);
  const [summary, setSummary] = useState({ success: 0, total: 0 });
  const [counts, setCounts] = useState(new Map());
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [statusBanner, setStatusBanner] = useState(null);
  const [hoverKey, setHoverKey] = useState(null);
  
  const [rows, setRows] = useState([]); 
  const [uniqueRows, setUniqueRows] = useState([]); 
  
  const [open, setOpen] = useState(false);
  const [donutFilter, setDonutFilter] = useState(null);
  const refreshAbortRef = useRef(null);

  const [isActionStopped, setIsActionStopped] = useState(false);

  useEffect(() => {
    if (actionId != null && actionId !== "") {
        setLockedId(String(actionId));
        setIsActionStopped(false); // Reset stop state for new ID
    }
  }, [actionId]);

  const refresh = useCallback(async (abortSignal) => {
    setErr("");
    try {
      let idToUse = lockedId;

      // 🚀 ALWAYS poll for a newer action if we don't have a hardcoded actionId prop.
      // This synchronizes users on other machines.
      if (!actionId) {
        const last = await getJson(`${API_BASE}/api/actions/last`, abortSignal).catch(()=>null);
        const fetchedLastId = last?.actionId ? String(last.actionId) : null;
        if (fetchedLastId && fetchedLastId !== lockedId) {
          idToUse = fetchedLastId;
          setLockedId(idToUse);
          setIsActionStopped(false); // Unfreeze! A new action was found globally
        }
      }

      if (!idToUse) {
        setSummary({ success: 0, total: 0 });
        setCounts(new Map());
        setStatusBanner(null);
        setLoading(false);
        return;
      }
      
      // 🚀 Only skip fetching results if THIS SPECIFIC action is already done.
      // The block above still allowed us to detect if a *new* one arrived.
      if (isActionStopped && idToUse === lockedId) {
          setLoading(false);
          return;
      }

      setLoading(true);
      const res = await getJson(`${API_BASE}/api/actions/${idToUse}/results`, abortSignal);
      
      const allRows = Array.isArray(res?.rows) ? res.rows : [];
      setRows(allRows);

      let uRows = [];
      const map = new Map();
      for (const r of allRows) {
          if (r.server && !map.has(r.server)) {
              map.set(r.server, r);
          }
      }
      uRows = Array.from(map.values());
      setUniqueRows(uRows);

      const cm = uRows.length ? countsFromRows(uRows) : countsFromObj(res);
      const total = uRows.length > 0 ? uRows.length : Number(res?.total ?? 0);
      const success = uRows.length > 0 
          ? uRows.filter(r => { const s = classify(r.status); return s === 'Fixed' || s === 'Completed'; }).length 
          : Number(res?.success ?? res?.Fixed ?? ((cm.has("Fixed") ? cm.get("Fixed") : 0) + (cm.has("Completed") ? cm.get("Completed") : 0))) || 0;
      
      setCounts(cm);
      setSummary({ success, total });
      
      try {
        const statusRes = await getJson(`${API_BASE}/api/actions/${idToUse}/status`, abortSignal);
        const s = String(statusRes?.state || "").toLowerCase();
        if (s === 'open' || s === 'running') {
            setStatusBanner({ msg: "Action is running", type: 'running' });
        }
        else if (s === 'expired' || s === 'stopped') {
            setStatusBanner({ msg: "Action Stopped", type: 'completed' });
            setIsActionStopped(true); // Freeze heavy polling for this specific action
        }
        else setStatusBanner({ msg: `Status: ${s}`, type: 'info' });
      } catch { setStatusBanner({ msg: "Status Unknown", type: 'info' }); }
    } catch (e) {
      if (e.name !== "AbortError") setErr(e.message);
    } finally {
      if (!abortSignal || !abortSignal.aborted) setLoading(false);
    }
  }, [lockedId, isActionStopped, actionId]); 

  useEffect(() => {
    refreshAbortRef.current?.abort();
    const ab = new AbortController();
    refreshAbortRef.current = ab;
    
    refresh(ab.signal);

    const interval = setInterval(() => { 
        if (!loading) refresh(ab.signal); 
    }, 15000); 

    return () => { ab.abort(); clearInterval(interval); };
  }, [lockedId, refresh, loading, isActionStopped]);

  const handleContainerClick = (e, statusFilter = null) => {
    e.stopPropagation();
    if (onViewDetails) {
      if (statusFilter) {
          const payload = [{ logic: "Single", conds: [{ column: "status", operator: "contains", value: statusFilter }] }];
          sessionStorage.setItem("kpi_pending_filter", JSON.stringify(payload));
          onViewDetails(lockedId, payload);
      } else {
          sessionStorage.removeItem("kpi_pending_filter");
          onViewDetails(lockedId, []);
      }
    } else {
      setDonutFilter(statusFilter);
      setOpen(true);
    }
  };

  const donut = useMemo(() => {
    const entries = BUCKETS.map((b) => [b, counts.get(b) || 0]).filter(([, v]) => v > 0);
    const ordered = [
      ...entries.filter(([k]) => ORDER.includes(k)).sort((a, b) => ORDER.indexOf(a[0]) - ORDER.indexOf(b[0])),
      ...entries.filter(([k]) => !ORDER.includes(k)).sort((a, b) => a[0].localeCompare(b[0])),
    ];
    const total = Math.max(1, ordered.reduce((a, [, v]) => a + v, 0));
    let acc = 0;
    return ordered.map(([key, val]) => {
      const start = (acc / total) * 360;
      const end = ((acc + val) / total) * 360;
      acc += val;
      return { key, start, end, fill: pickColor(key), val, pct: Math.round((val / total) * 100) };
    });
  }, [counts]);

  const center = useMemo(() => {
    let lbl = "Success";
    let pt = summary.total > 0 ? Math.round((summary.success / summary.total) * 100) : 0;
    
    if (hoverKey && counts.has(hoverKey)) {
      lbl = hoverKey;
      pt = Math.round(((counts.get(hoverKey) || 0) / Math.max(1, summary.total)) * 100);
    }

    const shortLabel = lbl.length > 10 ? lbl.substring(0, 8) + '..' : lbl;
    return { pct: pt, label: shortLabel, fullLabel: lbl };
  }, [hoverKey, counts, summary]);

  return (
    <>
      <section className="card reveal" data-reveal>
        <div className="flex-row items-center justify-between mb-16">
          <h2>{title}</h2>
          <button className="btn outline small" onClick={() => refresh(null)} disabled={loading}>{loading ? "" : ""}
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16"><path d="M23 4v6h-6"></path><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path></svg>          
          </button>
        </div>
        {err ? <div className="sub error">{err}</div> : !lockedId ? <div className="sub">No data</div> : (
          <>
            <div className="flex-row items-center justify-between w-full mb-16 wrap gap-12">
              <div className="flex-row items-center gap-12">
                <span className="pill green fw-600">{`Success: ${summary.success}/${summary.total}`}</span>
                <span className="muted-text fw-600 text-13">ID: {lockedId}</span>
              </div>
              <button className="btn outline small" onClick={(e) => handleContainerClick(e, null)}>View Details</button>
            </div>
            
            {statusBanner && (<div className={`status-banner ${statusBanner.type}`}>{statusBanner.type === 'running' && <span className="pulse-dot"></span>}{statusBanner.msg}</div>)}
            
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%', gap: '32px', marginTop: '16px' }}>
              
              <div style={{ width: '160px', height: '200px', flexShrink: 0, display: 'flex', justifyContent: 'center' }}>
                <svg viewBox="0 0 120 120" role="img" className="donut-svg" onClick={(e) => handleContainerClick(e, null)} style={{ cursor: 'pointer', width: '100%', height: '100%' }}>
                  <g transform="translate(60,60)">
                    {donut.length === 0 ? (
                      fullRingPaths(0, 0, 48, 30).map((pd, idx) => ( <path key={idx} d={pd} fill="var(--panel-2)" stroke="var(--border)" strokeWidth="1" /> ))
                    ) : (
                      donut.map((s, i) => {
                        const mid = (s.start + s.end) / 2;
                        const rad = ((mid - 90) * Math.PI) / 180;
                        const explode = hoverKey === s.key ? 3 : 0;
                        const dx = explode * Math.cos(rad);
                        const dy = explode * Math.sin(rad);
                        const d = arcPath(0, 0, 48, s.start, s.end, 30);
                        const isFull = d === null;
                        
                        const activeStyle = { transition: "transform 0.2s, filter 0.2s", filter: hoverKey === s.key ? "brightness(1.06)" : "none", cursor: 'pointer' };
                        
                        if (isFull) { return ( <g key={i} transform={`translate(${dx},${dy})`} style={activeStyle} onClick={(e) => handleContainerClick(e, s.key)}> {fullRingPaths(0, 0, 48, 30).map((pd, idx) => ( <path key={idx} d={pd} fill={s.fill} stroke="var(--panel-1)" strokeWidth="0.2" /> ))} </g> ); }
                        return ( <path key={i} d={d} fill={s.fill} stroke="var(--panel-1)" strokeWidth="0.2" transform={`translate(${dx},${dy})`} onMouseEnter={() => setHoverKey(s.key)} onMouseLeave={() => setHoverKey(null)} onClick={(e) => handleContainerClick(e, s.key)} style={activeStyle} /> );
                      })
                    )}
                    <text x="0" y="-2" textAnchor="middle" fontSize="14" fontWeight="800" fill="var(--text)" style={{ pointerEvents: 'none' }}>{center.pct}%</text>
                    <text x="0" y="12" textAnchor="middle" fontSize="7" fill="var(--muted)" style={{ pointerEvents: 'none' }}>{center.label}</text>
                  </g>
                </svg>
              </div>

              <div style={{display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '130px', overflowY: 'auto', paddingRight: '8px' }} className="custom-scrollbar" onMouseLeave={() => setHoverKey(null)}>
                {donut.length === 0 && <div className="muted-text text-12">No Data</div>}
                {donut.map(l => (
                   <div 
                     key={l.key} 
                     onClick={(e) => handleContainerClick(e, l.key)} 
                     onMouseEnter={() => setHoverKey(l.key)} 
                     style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', opacity: hoverKey && hoverKey !== l.key ? 0.4 : 1, transition: '0.2s' }}
                     title={DESCRIPTIONS[l.key] || l.key}
                   >
                      <span style={{ width: '10px', height: '10px', borderRadius: '50%', backgroundColor: l.fill, flexShrink: 0 }}></span>
                      <span style={{ fontSize: '12px', color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                         {l.key} ({l.val})
                      </span>
                   </div>
                ))}
              </div>

            </div>
          </>
        )}
      </section>
      
      <DetailsModal 
        open={open} 
        onClose={() => { setOpen(false); setDonutFilter(null); }} 
        title={detailTitle || `${title} Details`} 
        rows={rows} 
        initialStatus={donutFilter} 
      />
    </>
  );
}

function DetailsModal({ open, onClose, title, rows, initialStatus }) {
  const [sortConfig, setSortConfig] = useState({ key: "status", dir: "asc" });
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [showMenu, setShowMenu] = useState(false);
  const btnRef = useRef(null);

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [globalLogic, setGlobalLogic] = useState("AND");
  const [filters, setFilters] = useState([]);
  const propertyOptions = [
    { value: "server", label: "Server Name" },
    { value: "patch", label: "Patch Name" },
    { value: "status", label: "Status" }
  ];

  useEffect(() => {
    if (initialStatus && open) {
        setFilters([{ logic: "Single", conds: [{ column: "status", operator: "contains", value: initialStatus }] }]);
    } else if (open) setFilters([]);
  }, [open, initialStatus]);

  useEffect(() => setPage(1), [filters, pageSize]);
  
  useEffect(() => {
    function onDocClick(e) { if (!showMenu) return; if (btnRef.current && !btnRef.current.contains(e.target)) setShowMenu(false); }
    document.addEventListener("mousedown", onDocClick); return () => document.removeEventListener("mousedown", onDocClick);
  }, [showMenu]);

  const applyFilters = (row) => {
    if (!filters.length) return true;
    let globalMatch = globalLogic === "OR" ? false : true;
    let validBlocks = 0;

    for (let b of filters) {
      let blockMatch = true;
      let validConds = 0;

      for (let c of b?.conds || []) {
        if (!c.value) continue;
        validConds++;
        let condition = true;
        const search = String(c.value).toLowerCase();
        
        let field = "";
        if (c.column === "status") {
            const shortStatus = classify(row.status);
            field = shortStatus.toLowerCase();
            if (c.operator === "contains" && !field.includes(search)) field = String(row.status || "").toLowerCase();
        } else {
            field = String(row[c.column] || "").toLowerCase();
        }

        if (c.operator === "contains") condition = field.includes(search);
        else if (c.operator === "=") condition = field === search;
        else if (c.operator === "!=") condition = field !== search;
        
        blockMatch = blockMatch && condition;
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
        if (valA < valB) return sortConfig.dir === "asc" ? -1 : 1; 
        if (valA > valB) return sortConfig.dir === "asc" ? 1 : -1; 
        return 0; 
    }); 
  }, [filtered, sortConfig]);

  const totalPages = Math.ceil(sorted.length / pageSize);
  const paginated = useMemo(() => { const start = (page - 1) * pageSize; return sorted.slice(start, start + pageSize); }, [sorted, page, pageSize]);
  const handleSort = (key) => { setSortConfig(current => ({ key, dir: current.key === key && current.dir === "asc" ? "desc" : "asc" })); };
  const getSortIcon = (key) => { if (sortConfig.key !== key) return <span className="muted-text ml-6">↕</span>; return <span className="ml-6">{sortConfig.dir === "asc" ? "↑" : "↓"}</span>; };
  
  const doExport = (type) => { setShowMenu(false); const safeTitle = (title || "Report").replace(/[^\w.-]+/g, "_"); if (type === 'csv') { const csv = rowsToCSV(sorted); downloadBlob(new Blob([csv], { type: "text/csv" }), `${safeTitle}.csv`); } else if (type === 'html') { const html = rowsToHTML(sorted, title); downloadBlob(new Blob([html], { type: "text/html" }), `${safeTitle}.html`); } else if (type === 'pdf') { const html = rowsToHTML(sorted, title); const blob = new Blob([html], { type: "text/html" }); const url = URL.createObjectURL(blob); const iframe = document.createElement("iframe"); iframe.className = "d-none"; iframe.src = url; iframe.onload = () => { try { iframe.contentWindow?.focus(); iframe.contentWindow?.print(); } catch {} setTimeout(() => { URL.revokeObjectURL(url); iframe.remove(); }, 2000); }; document.body.appendChild(iframe); } };

  if (!open) return null;
  const activeFilterCount = filters.reduce((acc, b) => acc + (b?.conds ? b.conds.filter(c => c.value).length : 0), 0);

  return (
    <div className="modal show" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="box action-modal-box" style={{ padding: 0 }} onClick={e => e.stopPropagation()}>
        
        <div className="action-modal-header" style={{ padding: '20px 24px', borderBottom: '1px solid var(--border)', marginBottom: 0 }}>
            <h3 className="modal-title" style={{ margin: 0, fontSize: "18px", color: "var(--text)" }}>{title}</h3>
            <button className="btn btn-outline" style={{ height: '32px' }} onClick={onClose}>Close</button>
        </div>
        
        <div style={{ padding: '20px 24px', flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          
          <div className="grid-toolbar" style={{ margin: '0 0 16px 0', padding: 0 }}>
            <div className="grid-toolbar-left" style={{ fontWeight: 600, color: 'var(--text)' }}>
              Showing {filtered.length} Entries {activeFilterCount > 0 && <span className="pill blue ml-10">Filtered</span>}
            </div>
            <div className="grid-toolbar-right" style={{ display: 'flex', gap: '12px' }}>
              <button className="btn pri" onClick={() => setDrawerOpen(true)}>
                 <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16"><line x1="4" y1="21" x2="4" y2="14"></line><line x1="4" y1="10" x2="4" y2="3"></line><line x1="12" y1="21" x2="12" y2="12"></line><line x1="12" y1="8" x2="12" y2="3"></line><line x1="20" y1="21" x2="20" y2="16"></line><line x1="20" y1="12" x2="20" y2="3"></line><line x1="1" y1="14" x2="7" y2="14"></line><line x1="9" y1="8" x2="15" y2="8"></line><line x1="17" y1="16" x2="23" y2="16"></line></svg>
              </button>
              <div className="dropdown" ref={btnRef}>
                 <button className="btn pri" onClick={() => setShowMenu(s => !s)}>Export<svg width="14" height="14" viewBox="0 0 24 24" className="ml-6"><path d="M6 9l6 6 6-6" fill="none" stroke="currentColor" strokeWidth="2" /></svg></button>
                 {showMenu && (
                   <div className="menu">
                     <button className="item" onClick={() => doExport('csv')}>Export to CSV</button>
                     <button className="item" onClick={() => doExport('pdf')}>Export to PDF</button>
                     <button className="item" onClick={() => doExport('html')}>Export to HTML</button>
                   </div>
                 )}
              </div>
            </div>
          </div>

          <div className="tableWrap action-modal-body">
              <table className="action-modal-table">
                <thead className="kpi-th-sticky">
                  <tr><th onClick={() => handleSort('server')} className="w-20p cursor-pointer">Server {getSortIcon('server')}</th><th onClick={() => handleSort('patch')} className="cursor-pointer">Patch {getSortIcon('patch')}</th><th onClick={() => handleSort('start')} className="w-10p cursor-pointer">Start {getSortIcon('start')}</th><th onClick={() => handleSort('end')} className="w-10p cursor-pointer">End {getSortIcon('end')}</th><th onClick={() => handleSort('status')} className="w-15p cursor-pointer">Status {getSortIcon('status')}</th><th className="w-15p">Issuer</th></tr>
                </thead>
                <tbody>
                  {paginated.length === 0 ? (<tr><td colSpan={6} className="text-center p-20">No results found.</td></tr>) : (paginated.map((r, i) => { 
                      const shortStatus = classify(r.status); 
                      
                      let displayStatus = shortStatus;
                      if ((shortStatus === 'Waiting' || shortStatus === 'error' || shortStatus === 'Failed') && r.status && r.status.toLowerCase() !== shortStatus.toLowerCase()) {
                          displayStatus = `${shortStatus} (${r.status})`;
                      }

                      const isSuccess = shortStatus === 'Fixed' || shortStatus === 'Completed'; 
                      const isFail = shortStatus === 'Failed' || shortStatus === 'Download Failed' || shortStatus === 'error'; 
                      const isRunning = shortStatus === 'Running' || shortStatus === 'Evaluating'; 
                      
                      return (
                          <tr key={i}>
                              <td>{r.server}</td>
                              <td>{r.patch}</td>
                              <td className="whitespace-nowrap">{fmtTime(r.start)}</td>
                              <td className="whitespace-nowrap">{fmtTime(r.end)}</td>
                              <td>
                                  <span className={`status-pill ${isSuccess ? 'pill green' : isFail ? 'pill red' : isRunning ? 'pill blue' : 'pill amber'}`} title={DESCRIPTIONS[shortStatus] || r.status}>
                                      {displayStatus}
                                  </span>
                              </td>
                              <td>{r.issuer}</td>
                          </tr>
                      ); 
                  }))}
                </tbody>
              </table>
          </div>
        </div>

        <div className="pagination">
            <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
                <span className="pager-info">Rows per page:</span>
                <select className="control" style={{ width: "75px", padding: "6px 10px", height: "32px", minWidth: 0 }} value={pageSize} onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1); }}>
                    <option value={10}>10</option><option value={20}>20</option><option value={50}>50</option><option value={100}>100</option>
                </select>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "20px" }}>
                <div className="pager-info">
                  {sorted.length > 0 ? (page - 1) * pageSize + 1 : 0}-{Math.min(page * pageSize, sorted.length)} of {sorted.length}
                </div>
                <div className="pager-btns">
                    <button className="pager-btn" disabled={page === 1} onClick={() => setPage(p => p - 1)}>&lt; Prev</button>
                    <button className="pager-btn" disabled={page >= totalPages || totalPages === 0} onClick={() => setPage(p => p + 1)}>Next &gt;</button>
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
      </div>
    </div>
  );
}