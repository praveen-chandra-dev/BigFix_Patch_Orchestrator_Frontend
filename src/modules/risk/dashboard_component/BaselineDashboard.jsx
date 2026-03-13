// src/modules/risk/dashboard_component/BaselineDashboard.jsx
import { useEffect, useState, useMemo, useRef } from "react";
import api from "../../../api/api";

export default function BaselineDashboard({ parentFilters = [], parentLogic = "AND" }) {
  const [baselines, setBaselines] = useState([]);
  const [patches, setPatches] = useState([]);
  const [cves, setCves] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalData, setModalData] = useState(null);

  const [currentPage, setCurrentPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(20);

  const [showColDrop, setShowColDrop] = useState(false);
  const [showExpDrop, setShowExpDrop] = useState(false);
  const colRef = useRef(null);
  const expRef = useRef(null);

  const [cols, setCols] = useState([
    { id: 'baseline_name', label: 'Baseline', show: true },
    { id: 'patch_count', label: 'Patches', show: true },
    { id: 'cve_count', label: 'CVEs', show: true }
  ]);

  useEffect(() => {
    const handleOutside = (e) => {
      if (colRef.current && !colRef.current.contains(e.target)) setShowColDrop(false);
      if (expRef.current && !expRef.current.contains(e.target)) setShowExpDrop(false);
    };
    document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, []);

  const load = async () => {
    setLoading(true);
    try {
      const baselineRes = await api.get("/baselines");
      const baselineData = Array.isArray(baselineRes.data) ? baselineRes.data : baselineRes.data?.data || [];
      setBaselines(baselineData);
      
      const patchRes = await api.get("/patches");
      const patchData = Array.isArray(patchRes.data) ? patchRes.data : patchRes.data?.data || [];
      setPatches(patchData);
      
      const payload = patchData.map((p) => ({ patch_id: p.patch_id, site_name: p.site_name }));
      const cveRes = await api.post("/cves/by-patches", { patches: payload });
      setCves(cveRes.data?.data || []);
    } catch (err) { console.error(err); } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const patchCveMap = useMemo(() => {
    const map = {};
    cves.forEach((c) => { if (!map[c.patch_id]) map[c.patch_id] = []; map[c.patch_id].push(c.cve_id); });
    return map;
  }, [cves]);

  const baselineExposure = useMemo(() => {
    return baselines.map((b) => {
      const patchIds = b.patch_ids || [];
      const cveSet = new Set();
      patchIds.forEach((patchId) => {
        const patchKey = `BIGFIX-${patchId}`;
        const cvesForPatch = patchCveMap[patchKey] || [];
        cvesForPatch.forEach((c) => cveSet.add(c));
      });
      return {
        baseline_name: b.baseline_name, patch_count: patchIds.length, cve_count: cveSet.size,
        patches: patchIds.map((id) => `BIGFIX-${id}`), cves: Array.from(cveSet)
      };
    });
  }, [baselines, patchCveMap]);

  const applyFilters = (baseline) => {
    if (!parentFilters.length) return true;
    let globalMatch = parentLogic === "OR" ? false : true;
    for (let b of parentFilters) {
      let blockMatch = true; let validConds = 0;
      for (let c of b.conds) {
        if (!c.value) continue;
        validConds++; let condition = true;
        const search = String(c.value).toLowerCase();
        if (c.column === "baseline_name" || c.column === "patch_name") {
          const field = baseline.baseline_name.toLowerCase();
          if (c.operator === "contains") condition = field.includes(search);
          else if (c.operator === "=") condition = field === search;
          else if (c.operator === "!=") condition = field !== search;
        } else if (c.column === "patch_id") { condition = (baseline.patches || []).some(x => x.toLowerCase().includes(search)); }
        else if (c.column === "cve_id") { condition = (baseline.cves || []).some(x => x.toLowerCase().includes(search)); }
        blockMatch = blockMatch && condition;
      }
      if (validConds > 0) globalMatch = parentLogic === "OR" ? (globalMatch || blockMatch) : (globalMatch && blockMatch);
    }
    return globalMatch;
  };

  const filteredBaselines = baselineExposure.filter(applyFilters);
  const totalPages = Math.ceil(filteredBaselines.length / rowsPerPage);
  const paginatedBaselines = filteredBaselines.slice((currentPage - 1) * rowsPerPage, currentPage * rowsPerPage);

  const handleExport = () => { setShowExpDrop(false); }

  if (loading) return <div className="app-loading-content">Loading baselines...</div>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div className="grid-toolbar" style={{ margin: '0 0 16px 0', padding: 0 }}>
        
        <div className="grid-toolbar-right" style={{ display: 'flex', gap: '12px' }}>
          <div className="dropdown" ref={colRef}>
            <button className="btn outline sec small" onClick={() => { setShowColDrop(!showColDrop); setShowExpDrop(false); }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16"><line x1="8" y1="6" x2="21" y2="6"></line><line x1="8" y1="12" x2="21" y2="12"></line><line x1="8" y1="18" x2="21" y2="18"></line><line x1="3" y1="6" x2="3.01" y2="6"></line><line x1="3" y1="12" x2="3.01" y2="12"></line><line x1="3" y1="18" x2="3.01" y2="18"></line></svg>
              &nbsp; Columns
            </button>
            {showColDrop && (
              <div className="dropdown-menu show" style={{ minWidth: "220px", padding: "12px", right: 0 }}>
                {cols.map((col, i) => (
                  <label key={col.id} style={{ display: "flex", alignItems: "center", gap: "10px", cursor: "pointer", padding: "6px 12px", borderRadius: "4px" }}>
                    <input type="checkbox" className="custom-checkbox" checked={col.show} onChange={(e) => { const next = [...cols]; next[i].show = e.target.checked; setCols(next); }} />
                    <span style={{ fontSize: "13px", fontWeight: 500 }}>{col.label}</span>
                  </label>
                ))}
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
                       <button key={fmt} className="btn outline small" style={{ fontSize: '11px', height: '32px' }} onClick={() => handleExport()}>{fmt}</button>
                     ))}
                  </div>
                  <div style={{ height: '1px', background: 'var(--border)', marginBottom: '16px' }}></div>
                  <div style={{ fontSize: "11px", fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", marginBottom: "12px" }}>Scope</div>
                  <button className="item" onClick={() => handleExport()}>Current Page</button>
                  <button className="item" onClick={() => handleExport()}>Filtered Data</button>
                  <button className="item" onClick={() => handleExport()}>All Data</button>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="tableWrap border-top" style={{ flex: 1 }}>
        <table>
          <thead className="kpi-th-sticky">
            <tr>
              {cols.find(c=>c.id==='baseline_name')?.show && <th>Baseline</th>}
              {cols.find(c=>c.id==='patch_count')?.show && <th style={{ textAlign: "center" }}>Patches</th>}
              {cols.find(c=>c.id==='cve_count')?.show && <th style={{ textAlign: "center" }}>CVEs</th>}
            </tr>
          </thead>
          <tbody>
            {paginatedBaselines.length === 0 ? <tr><td colSpan="3" style={{ textAlign: "center", padding: "40px", color: "var(--muted)" }}>No baselines found.</td></tr> : paginatedBaselines.map((b) => (
              <tr key={b.baseline_name}>
                {cols.find(c=>c.id==='baseline_name')?.show && <td style={{ fontWeight: 600 }}>{b.baseline_name}</td>}
                {cols.find(c=>c.id==='patch_count')?.show && <td style={{ textAlign: "center" }}><span className="cell-link" onClick={() => setModalData({ title: "Patches", items: b.patches })}>{b.patch_count}</span></td>}
                {cols.find(c=>c.id==='cve_count')?.show && <td style={{ textAlign: "center" }}><span className="cell-link" onClick={() => setModalData({ title: "CVEs", items: b.cves })}>{b.cve_count}</span></td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      
      <div className="pagination" style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", padding: "16px 0", gap: "24px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <span className="pager-info">Rows per page:</span>
            <select className="control" style={{ width: "70px", height: "32px", padding: '0 8px' }} value={rowsPerPage} onChange={(e) => { setRowsPerPage(Number(e.target.value)); setCurrentPage(1); }}>
                <option value={10}>10</option><option value={20}>20</option><option value={50}>50</option>
            </select>
        </div>
        <span className="pager-info" style={{ fontSize: "13px", color: "var(--muted)" }}>
            {filteredBaselines.length > 0 ? (currentPage - 1) * rowsPerPage + 1 : 0}-{Math.min(currentPage * rowsPerPage, filteredBaselines.length)} of {filteredBaselines.length}
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
  );
}