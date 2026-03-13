// src/components/KpiDetails.jsx
import React, { useState, useEffect, useMemo, useRef } from "react";
import FilterDrawer from "./FilterDrawer";

const API_BASE = window.env?.VITE_API_BASE || "http://localhost:5174";

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
  try { return JSON.parse(t); } catch { throw new Error(`Unexpected: ${t.slice(0, 400)}`); }
}

const fmtTime = (s) => {
  if (!s || s === "N/A") return "—";
  const m = s.match(/\b(\d{2}:\d{2}:\d{2})\b/);
  return m ? m[1] : s;
};

function classify(raw) {
  const s = String(raw || "").trim();
  if (!s) return "Not Reported";
  const L = s.toLowerCase();
  if (/^fixed$/i.test(s) || /^completed$/i.test(s) || /executed successfully/i.test(L)) return "Success";
  if (/^pending restart$/i.test(s) || /waiting for restart/i.test(L)) return "Pending Restart";
  if (/^running$/i.test(s) || /is currently running/i.test(L)) return "Running";
  if (/^failed$/i.test(s) || /\baction failed\b/i.test(L)) return "Failed";
  if (/^not reported$/i.test(s)) return "Not Reported";
  if (/success/i.test(L)) return "Success";
  if (/fail|error/i.test(L)) return "Failed";
  if (/wait|pending/i.test(L)) return "Waiting";
  return s; 
}

const NoDataSVG = () => (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', width: '100%', padding: '60px 0' }}>
      <svg width="240" height="173" viewBox="0 0 240 173" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ marginBottom: '24px', opacity: 0.8 }}>
        <mask id="mask0_317_10062" style={{ maskType: 'luminance' }} maskUnits="userSpaceOnUse" x="0" y="0" width="240" height="173">
          <path d="M240 0.5H0V172.5H240V0.5Z" fill="white"/>
        </mask>
        <g mask="url(#mask0_317_10062)">
          <path d="M181.099 121.15C174.059 121.15 168.359 126.83 168.359 133.84C168.359 140.85 174.059 146.53 181.099 146.53C188.139 146.53 193.839 140.85 193.839 133.84C193.839 126.83 188.139 121.15 181.099 121.15ZM181.099 145.39C174.689 145.39 169.499 140.22 169.499 133.84C169.499 127.46 174.689 122.29 181.099 122.29C187.509 122.29 192.699 127.46 192.699 133.84C192.699 140.22 187.509 145.39 181.099 145.39Z" fill="#0057C7"/>
          <path d="M181.09 118.79C172.75 118.79 165.98 125.53 165.98 133.84C165.98 142.15 172.75 148.89 181.09 148.89C189.43 148.89 196.2 142.15 196.2 133.84C196.2 125.53 189.43 118.79 181.09 118.79ZM181.09 147.71C173.4 147.71 167.16 141.5 167.16 133.84C167.16 126.18 173.4 119.97 181.09 119.97C188.78 119.97 195.02 126.18 195.02 133.84C195.02 141.5 188.78 147.71 181.09 147.71Z" fill="#3C91FF"/>
          <path d="M231.271 122.99L231.651 118.01L232.031 122.99C232.131 124.36 233.221 125.44 234.591 125.54L239.591 125.92L234.591 126.3C233.211 126.4 232.131 127.49 232.031 128.85L231.651 133.83L231.271 128.85C231.171 127.48 230.081 126.4 228.711 126.3L223.711 125.92L228.711 125.54C230.091 125.44 231.171 124.35 231.271 122.99Z" fill="#0057C7"/>
          <path d="M37.0295 84.3701C32.7495 84.0501 29.3495 80.6601 29.0195 76.3901L27.8395 60.8301L26.6595 76.3901C26.3395 80.6501 22.9295 84.0401 18.6495 84.3701L3.01953 85.5501L18.6495 86.7301C22.9295 87.0501 26.3295 90.4401 26.6595 94.7101L27.8395 110.27L29.0195 94.7101C29.3395 90.4501 32.7495 87.0601 37.0295 86.7301L52.6595 85.5501L37.0295 84.3701ZM30.5595 86.5301C29.7695 86.8401 29.1295 87.4701 28.8195 88.2601L27.8395 90.7501L26.8595 88.2601C26.5495 87.4701 25.9195 86.8401 25.1195 86.5301L22.6195 85.5501L25.1195 84.5701C25.9095 84.2601 26.5495 83.6301 26.8595 82.8401L27.8395 80.3501L28.8195 82.8401C29.1295 83.6301 29.7595 84.2601 30.5595 84.5701L33.0595 85.5501L30.5595 86.5301Z" fill="#3C91FF"/>
          <path d="M143.289 129.08C146.149 129.08 148.469 131.39 148.469 134.24C148.469 137.09 146.149 139.4 143.289 139.4C140.429 139.4 138.109 137.09 138.109 134.24C138.109 131.39 140.429 129.08 143.289 129.08Z" fill="#CDE1F4"/>
          <path d="M138.4 85.4297C139.77 85.4297 140.87 86.5297 140.87 87.8897C140.87 89.2497 139.77 90.3497 138.4 90.3497C137.03 90.3497 135.93 89.2497 135.93 87.8897C135.93 86.5297 137.03 85.4297 138.4 85.4297Z" fill="#3C91FF"/>
          <path d="M50.1887 167.58C51.5587 167.58 52.6587 168.68 52.6587 170.04C52.6587 171.4 51.5587 172.5 50.1887 172.5C48.8187 172.5 47.7188 171.4 47.7188 170.04C47.7188 168.68 48.8187 167.58 50.1887 167.58Z" fill="#3C91FF"/>
          <path d="M112.759 141.87C114.109 141.87 115.209 142.96 115.209 144.31C115.209 145.66 114.109 146.75 112.759 146.75C111.409 146.75 110.309 145.66 110.309 144.31C110.309 142.96 111.399 141.87 112.759 141.87Z" fill="#3C91FF"/>
          <path d="M43.0084 112.49C43.7584 112.49 44.3684 111.89 44.3684 111.14C44.3684 110.39 43.7584 109.79 43.0084 109.79C42.2584 109.79 41.6484 110.39 41.6484 111.14C41.6484 111.89 42.2584 112.49 43.0084 112.49Z" fill="#3C91FF"/>
          <path d="M64.6878 60.1398C65.7478 60.1398 66.6178 59.2798 66.6178 58.2198C66.6178 57.1598 65.7578 56.2998 64.6878 56.2998C63.6178 56.2998 62.7578 57.1598 62.7578 58.2198C62.7578 59.2798 63.6178 60.1398 64.6878 60.1398Z" fill="#3C91FF"/>
          <path d="M94.7313 100.45C94.7313 101.33 94.0212 102.04 93.1312 102.04C92.2412 102.04 91.5312 101.33 91.5312 100.45C91.5312 99.5703 92.2412 98.8604 93.1312 98.8604C94.0212 98.8604 94.7313 99.5703 94.7313 100.45Z" fill="#3C91FF"/>
          <path d="M141.29 99.4698C141.29 100.23 140.67 100.85 139.9 100.85C139.13 100.85 138.52 100.23 138.52 99.4698C138.52 98.7098 139.14 98.0898 139.9 98.0898C140.66 98.0898 141.29 98.7098 141.29 99.4698Z" fill="#3C91FF"/>
          <path d="M167.691 70.3C168.591 70.3 169.331 69.57 169.331 68.67C169.331 67.77 168.601 67.04 167.691 67.04C166.781 67.04 166.051 67.77 166.051 68.67C166.051 69.57 166.781 70.3 167.691 70.3Z" fill="#CDE1F4"/>
          <path d="M209.91 81.6702C210.95 81.6702 211.8 80.8302 211.8 79.7902C211.8 78.7502 210.95 77.9102 209.91 77.9102C208.87 77.9102 208.02 78.7502 208.02 79.7902C208.02 80.8302 208.87 81.6702 209.91 81.6702Z" fill="#3C91FF"/>
          <path d="M77.6595 8.17016C78.6995 8.17016 79.5495 7.33016 79.5495 6.29016C79.5495 5.25016 78.6995 4.41016 77.6595 4.41016C76.6195 4.41016 75.7695 5.25016 75.7695 6.29016C75.7695 7.33016 76.6195 8.17016 77.6595 8.17016Z" fill="#CDE1F4"/>
          <path d="M237.829 84.4398C237.829 85.3698 237.079 86.1198 236.139 86.1198C235.199 86.1198 234.449 85.3698 234.449 84.4398C234.449 83.5098 235.199 82.7598 236.139 82.7598C237.079 82.7598 237.829 83.5098 237.829 84.4398Z" fill="#3C91FF"/>
          <path d="M233.568 31.7505C233.568 32.6805 232.808 33.4405 231.868 33.4405C230.928 33.4405 230.168 32.6805 230.168 31.7505C230.168 30.8205 230.928 30.0605 231.868 30.0605C232.808 30.0605 233.568 30.8205 233.568 31.7505Z" fill="#3C91FF"/>
        </g>
        <path d="M125.16 20.6802C108.56 32.6102 97.3496 45.3702 100.12 49.2102C102.89 53.0402 118.6 46.4702 135.21 34.5502C151.81 22.6302 163.03 9.86018 160.25 6.03018C157.48 2.20018 141.77 8.77018 125.17 20.6902L125.16 20.6802ZM133.92 32.7802C118.6 43.7802 104.28 50.0802 101.95 46.8502C99.6096 43.6202 110.13 32.0802 125.45 21.0802C140.77 10.0802 155.09 3.78018 157.42 7.01018C159.76 10.2402 149.24 21.7802 133.92 32.7802Z" fill="#0057C7"/>
        <path d="M132.78 31.2096C138.12 27.3796 143.02 23.3596 146.97 19.6096C146.5 18.6396 145.94 17.6796 145.29 16.7796C139.27 8.4696 127.63 6.5996 119.29 12.5896C110.95 18.5796 109.06 30.1696 115.08 38.4796C115.73 39.3896 116.47 40.2196 117.25 40.9696C122.07 38.4196 127.45 35.0496 132.79 31.2196L132.78 31.2096Z" fill="#3C91FF"/>
        <path d="M136.35 36.1204C132.74 38.7104 127.94 41.8704 122.93 44.7004C128.72 47.1304 135.62 46.5904 141.08 42.6604C146.56 38.7304 149.25 32.3904 148.75 26.1504C144.48 29.9804 139.94 33.5304 136.33 36.1204H136.35Z" fill="#3C91FF"/>
      </svg>
      <div style={{ fontSize: '18px', fontWeight: 600, color: 'var(--text)', fontFamily: '"HCL BOOMER", sans-serif' }}>No Data Available</div>
    </div>
);

export default function KpiDetails({ context, onBack }) {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [sortConfig, setSortConfig] = useState({ key: null, dir: "asc" });

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [globalLogic, setGlobalLogic] = useState("AND");
  const [filters, setFilters] = useState([]);

  // Resolve type and params SAFELY checking for null context
  const type = typeof context === 'string' ? context : (context?.type || 'health');
  const actionId = context && typeof context === 'object' ? context.id : null;

  const titleMap = {
    'success': 'Success Rate Details',
    'health': 'Critical Health Failures',
    'reboot': 'Reboot Pending Servers',
    'sandbox': `Action Results ${actionId ? `(#${actionId})` : ''}`
  };

  const propertyOptionsMap = {
    'health': [
      { value: "server", label: "Server Name" },
      { value: "os", label: "OS" },
      { value: "serviceStatus", label: "Service Status" }
    ],
    'reboot': [
      { value: "server", label: "Server Name" },
      { value: "ip", label: "IP Address" },
      { value: "besRelay", label: "BES Relay" }
    ],
    'success': [
      { value: "server", label: "Server Name" },
      { value: "status", label: "Status" }
    ],
    'sandbox': [
      { value: "server", label: "Server Name" },
      { value: "patch", label: "Patch Name" },
      { value: "status", label: "Status" },
      { value: "issuer", label: "Issuer" }
    ]
  };

  const propertyOptions = propertyOptionsMap[type] || propertyOptionsMap['health'];

  useEffect(() => {
    const ab = new AbortController();
    setLoading(true);
    setError("");
    setData([]);
    setFilters([]);

    async function fetchData() {
      try {
        if (!context) {
           setData([]);
           return;
        }

        if (type === 'health') {
          const res = await getJson(`${API_BASE}/api/health/critical`, ab.signal);
          setData(Array.isArray(res?.rows) ? res.rows : []);
        } else if (type === 'reboot') {
          const res = await getJson(`${API_BASE}/api/health/reboot-pending`, ab.signal);
          setData(Array.isArray(res?.rows) ? res.rows : []);
        } else if (type === 'success' || type === 'sandbox') {
          let targetId = actionId;
          if (!targetId) {
            const last = await getJson(`${API_BASE}/api/actions/last`, ab.signal);
            targetId = last?.actionId;
          }
          if (!targetId) {
            setData([]);
            return;
          }
          const res = await getJson(`${API_BASE}/api/actions/${targetId}/results`, ab.signal);
          let rows = Array.isArray(res?.rows) ? res.rows : [];
          if (type === 'success') rows = rows.filter((r) => /success/i.test(r?.status || ""));
          setData(rows);
        }
      } catch (err) {
        if (err.name !== "AbortError") setError(err.message);
      } finally {
        if (!ab.signal.aborted) setLoading(false);
      }
    }
    
    fetchData();
    return () => ab.abort();
  }, [type, actionId, context]);

  useEffect(() => setPage(1), [filters, pageSize, data]);

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
        let field = String(row[c.column] || "").toLowerCase();
        if (c.column === "status") field = classify(field).toLowerCase();

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

  const filtered = useMemo(() => data.filter(applyFilters), [data, filters, globalLogic]);

  const sorted = useMemo(() => {
    if (!sortConfig.key) return filtered;
    return [...filtered].sort((a, b) => {
      let valA = String(a[sortConfig.key] || "").toLowerCase();
      let valB = String(b[sortConfig.key] || "").toLowerCase();
      if (sortConfig.key === 'status') {
          valA = classify(valA); valB = classify(valB);
      }
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
  const getSortIcon = (key) => { if (sortConfig.key !== key) return <span className="muted-text ml-6">↕</span>; return <span className="ml-6">{sortConfig.dir === "asc" ? "↑" : "↓"}</span>; };
  
  const activeFilterCount = filters.reduce((acc, b) => acc + b.conds.filter(c => c.value).length, 0);
  const role = sessionStorage.getItem("user_role") || "Admin";
  const showService = role !== "Linux";

  return (
    <div className="card reveal" style={{ minHeight: '100%', display: 'flex', flexDirection: 'column', padding: 0 }}>
      
      <div style={{ padding: '24px', borderBottom: '1px solid var(--border)' }}>
        <div className="flex-row justify-between items-center">
            <div>
            <h2 style={{ margin: 0, fontSize: "24px", color: "var(--text)" }}>{titleMap[type] || 'KPI Details Dashboard'}</h2>
            <div className="sub mt-4" style={{ fontSize: "13px" }}>Detailed tabular data for the selected metric.</div>
            </div>
            <button className="btn outline" onClick={onBack}>Back to Flow</button>
        </div>
      </div>

      <div style={{ padding: '24px', flex: 1, display: 'flex', flexDirection: 'column' }}>
          
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

        <div className="grid-toolbar" style={{ margin: '0 0 16px 0', padding: 0 }}>
            <div className="grid-toolbar-left" style={{ fontWeight: 600, color: 'var(--text)' }}>
              Showing {filtered.length} Servers
            </div>
            <div className="grid-toolbar-right">
              <button className="btn outline" onClick={() => setDrawerOpen(true)}>
                 <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16"><line x1="4" y1="21" x2="4" y2="14"></line><line x1="4" y1="10" x2="4" y2="3"></line><line x1="12" y1="21" x2="12" y2="12"></line><line x1="12" y1="8" x2="12" y2="3"></line><line x1="20" y1="21" x2="20" y2="16"></line><line x1="20" y1="12" x2="20" y2="3"></line><line x1="1" y1="14" x2="7" y2="14"></line><line x1="9" y1="8" x2="15" y2="8"></line><line x1="17" y1="16" x2="23" y2="16"></line></svg>
              </button>
            </div>
        </div>

        <div className="tableWrap border-top" style={{ flex: 1 }}>
            {loading ? (
                <div style={{ padding: "40px", textAlign: "center", color: "var(--muted)" }}>Loading records...</div>
            ) : error ? (
                <div style={{ padding: "40px", textAlign: "center", color: "var(--danger)" }}>{error}</div>
            ) : !context || data.length === 0 ? (
                <NoDataSVG />
            ) : (
                <table>
                    <thead className="kpi-th-sticky">
                        <tr>
                            {type === 'health' && (
                                <>
                                    <th className="cursor-pointer" onClick={() => handleSort('server')}>Server {getSortIcon('server')}</th>
                                    <th className="cursor-pointer" onClick={() => handleSort('issues')}>Issue</th>
                                    {showService && <th>Service Name</th>}
                                    {showService && <th>Service Status</th>}
                                    <th>Last Report</th>
                                </>
                            )}
                            {type === 'reboot' && (
                                <>
                                    <th className="cursor-pointer" onClick={() => handleSort('server')}>Server {getSortIcon('server')}</th>
                                    <th>Pending Restart</th>
                                    <th>IP Address</th>
                                    <th>UpTime</th>
                                    <th>BES Relay</th>
                                </>
                            )}
                            {type === 'success' && (
                                <>
                                    <th className="cursor-pointer" onClick={() => handleSort('server')}>Server {getSortIcon('server')}</th>
                                    <th className="cursor-pointer" onClick={() => handleSort('status')}>Status {getSortIcon('status')}</th>
                                </>
                            )}
                            {type === 'sandbox' && (
                                <>
                                    <th className="cursor-pointer" onClick={() => handleSort('server')}>Server {getSortIcon('server')}</th>
                                    <th className="cursor-pointer" onClick={() => handleSort('patch')}>Patch {getSortIcon('patch')}</th>
                                    <th className="cursor-pointer" onClick={() => handleSort('start')}>Start {getSortIcon('start')}</th>
                                    <th className="cursor-pointer" onClick={() => handleSort('end')}>End {getSortIcon('end')}</th>
                                    <th className="cursor-pointer" onClick={() => handleSort('status')}>Status {getSortIcon('status')}</th>
                                    <th>Issuer</th>
                                </>
                            )}
                        </tr>
                    </thead>
                    <tbody>
                        {paginated.length === 0 ? (
                            <tr><td colSpan={6} style={{ padding: 0 }}><NoDataSVG /></td></tr>
                        ) : (
                            paginated.map((r, i) => {
                                const isWindows = String(r.os || "").toLowerCase().includes("win");
                                const shortStatus = classify(r.status); 
                                const isSuccess = shortStatus === 'Success'; 
                                const isFail = shortStatus === 'Failed' || shortStatus === 'Download Failed' || shortStatus === 'Error'; 
                                const isRunning = shortStatus === 'Running'; 

                                return (
                                    <tr key={i}>
                                        {type === 'health' && (
                                            <>
                                                <td>{r.server || "N/A"}</td>
                                                <td>{(r.issues || []).map((issue, idx) => (<span key={idx} className="pill red mr-10 text-11">{issue}</span>))}</td>
                                                {showService && <td>{isWindows ? "Window Update" : "—"}</td>}
                                                {showService && <td>{isWindows ? (r.serviceStatus || "N/A") : "—"}</td>}
                                                <td>{r.lastReportTime}</td>
                                            </>
                                        )}
                                        {type === 'reboot' && (
                                            <>
                                                <td>{r.server || "N/A"}</td>
                                                <td>{String(r.pendingRestart ?? r.pending ?? r.restart ?? "N/A")}</td>
                                                <td>{r.ip || "N/A"}</td>
                                                <td>{r.uptime || "N/A"}</td>
                                                <td>{r.besRelay || "N/A"}</td>
                                            </>
                                        )}
                                        {type === 'success' && (
                                            <>
                                                <td className="fw-600">{r.server || "—"}</td>
                                                <td><span className="pill green">Success</span></td>
                                            </>
                                        )}
                                        {type === 'sandbox' && (
                                            <>
                                                <td className="fw-600">{r.server}</td>
                                                <td>{r.patch}</td>
                                                <td className="whitespace-nowrap">{fmtTime(r.start)}</td>
                                                <td className="whitespace-nowrap">{fmtTime(r.end)}</td>
                                                <td><span className={`status-pill ${isSuccess ? 'pill green' : isFail ? 'pill red' : isRunning ? 'pill blue' : 'pill amber'}`} title={r.status}>{shortStatus}</span></td>
                                                <td>{r.issuer}</td>
                                            </>
                                        )}
                                    </tr>
                                );
                            })
                        )}
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
                    <option value={100}>100</option>
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
  );
}