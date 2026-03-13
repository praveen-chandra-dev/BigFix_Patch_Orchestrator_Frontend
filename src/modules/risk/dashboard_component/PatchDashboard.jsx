// src/modules/risk/dashboard_component/PatchDashboard.jsx
import { useEffect, useState, useMemo, useRef } from "react";
import api from "../../../api/api";

const getSeverityFromScore = (score) => {
  if (score >= 90) return "CRITICAL";
  if (score >= 75) return "HIGH";
  if (score >= 60) return "IMPORTANT";
  if (score >= 40) return "MODERATE";
  return "LOW";
};

const getScoreColorClass = (score) => {
  if (score >= 90) return "score-critical";
  if (score >= 75) return "score-high";
  if (score >= 60) return "score-important";
  if (score >= 40) return "score-moderate";
  return "score-low";
};

export default function PatchDashboard({ patches = [], cves = [], parentFilters = [], parentLogic = "AND", onDataLoaded }) {
  const [modalData, setModalData] = useState(null);

  const [currentPage, setCurrentPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(20);

  const [showColDrop, setShowColDrop] = useState(false);
  const [showExpDrop, setShowExpDrop] = useState(false);
  const colRef = useRef(null);
  const expRef = useRef(null);

  const [cols, setCols] = useState([
    { id: 'patch_id', label: 'Patch ID', show: true },
    { id: 'patch_name', label: 'Name', show: true },
    { id: 'final_score', label: 'Score', show: true },
    { id: 'severity', label: 'Severity', show: true },
    { id: 'cve_count', label: 'CVEs', show: true },
    { id: 'device_count', label: 'Devices', show: true }
  ]);

  useEffect(() => {
    const handleOutside = (e) => {
      if (colRef.current && !colRef.current.contains(e.target)) setShowColDrop(false);
      if (expRef.current && !expRef.current.contains(e.target)) setShowExpDrop(false);
    };
    document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, []);

  useEffect(() => { onDataLoaded?.(); }, []);

  const patchCveMap = useMemo(() => {
    const map = {};
    cves.forEach((c) => { if (!map[c.patch_id]) map[c.patch_id] = []; map[c.patch_id].push(c.cve_id); });
    return map;
  }, [cves]);

  const patchExposure = useMemo(() => {
    return patches.map((patch) => {
      const cvesForPatch = patchCveMap[patch.patch_id] || [];
      const devices = patch.applicable_computers || [];
      const score = Number(patch.final_score || 0);
      return {
        patch_id: patch.patch_id ? patch.patch_id.replace(/^BIGFIX-/i, "") : "",
        patch_name: patch.patch_name || "Unknown",
        vendor: patch.vendor || "Unknown",
        final_score: score,
        severity: getSeverityFromScore(score),
        cve_count: cvesForPatch.length,
        device_count: devices.length,
        cves: cvesForPatch,
        devices,
      };
    });
  }, [patches, patchCveMap]);

  const applyFilters = (patch) => {
    if (!parentFilters.length) return true;
    let globalMatch = parentLogic === "OR" ? false : true;
    for (let b of parentFilters) {
      let blockMatch = true; let validConds = 0;
      for (let c of b.conds) {
        if (!c.value) continue;
        validConds++; let condition = true;
        const search = String(c.value).toLowerCase();

        if (c.column === "cve_id") { condition = (patch.cves || []).some(x => x.toLowerCase().includes(search)); }
        else if (c.column === "device") { condition = (patch.devices || []).some(x => x.toLowerCase().includes(search)); }
        else if (c.column === "final_score") {
          const field = Number(patch.final_score); const val = Number(c.value);
          if (!isNaN(val)) {
            if (c.operator === ">") condition = field > val;
            else if (c.operator === "<") condition = field < val;
            else if (c.operator === "=") condition = field === val;
            else if (c.operator === ">=") condition = field >= val;
            else if (c.operator === "<=") condition = field <= val;
          }
        } else {
          let field = String(patch[c.column] || "").toLowerCase();
          if (c.operator === "contains") condition = field.includes(search);
          else if (c.operator === "=") condition = field === search;
          else if (c.operator === "!=") condition = field !== search;
        }
        blockMatch = blockMatch && condition;
      }
      if (validConds > 0) globalMatch = parentLogic === "OR" ? (globalMatch || blockMatch) : (globalMatch && blockMatch);
    }
    return globalMatch;
  };

  const filteredPatches = patchExposure.filter(applyFilters);
  const totalPages = Math.ceil(filteredPatches.length / rowsPerPage);
  const paginatedPatches = filteredPatches.slice((currentPage - 1) * rowsPerPage, currentPage * rowsPerPage);

  const exportCSV = () => { setShowExpDrop(false); };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>

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
              <div className="dropdown-menu show" style={{ width: "300px", padding: "16px", right: 0 }}>
                <div className="drop-header" style={{fontSize:11, fontWeight:600, color:'var(--muted)', textTransform:'uppercase', marginBottom:8}}>Format</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "8px", marginBottom: "20px" }}>
                  <button className="btn outline small" style={{fontSize:11, padding:0, height:32}} onClick={exportCSV}>CSV</button>
                  <button className="btn outline small" style={{fontSize:11, padding:0, height:32}} onClick={exportCSV}>PDF</button>
                  <button className="btn outline small" style={{fontSize:11, padding:0, height:32}} onClick={exportCSV}>HTML</button>
                </div>
                <div className="drop-header" style={{ borderTop: "1px solid var(--border)", paddingTop: "16px", fontSize:11, fontWeight:600, color:'var(--muted)', textTransform:'uppercase', marginBottom:8 }}>Scope</div>
                <button className="item" onClick={exportCSV}>Filtered Data</button>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="tableWrap border-top" style={{ flex: 1, overflow: 'auto', margin: '0 -32px', width: 'calc(100% + 64px)', borderLeft: 'none', borderRight: 'none', borderRadius: 0 }}>
        <table>
          <thead className="kpi-th-sticky">
            <tr>
              {cols.find(c=>c.id==='patch_id')?.show && <th>Patch ID</th>}
              {cols.find(c=>c.id==='patch_name')?.show && <th>Name</th>}
              {cols.find(c=>c.id==='final_score')?.show && <th style={{ textAlign: "center" }}>Score</th>}
              {cols.find(c=>c.id==='severity')?.show && <th style={{ textAlign: "center" }}>Severity</th>}
              {cols.find(c=>c.id==='cve_count')?.show && <th style={{ textAlign: "center" }}>CVEs</th>}
              {cols.find(c=>c.id==='device_count')?.show && <th style={{ textAlign: "center" }}>Devices</th>}
            </tr>
          </thead>
          <tbody>
            {paginatedPatches.length === 0 ? <tr><td colSpan="6" style={{ textAlign: "center", padding: "40px", color: "var(--muted)" }}>No patches found.</td></tr> : paginatedPatches.map((p) => (
              <tr key={p.patch_id}>
                {cols.find(c=>c.id==='patch_id')?.show && <td>{p.patch_id}</td>}
                {cols.find(c=>c.id==='patch_name')?.show && <td style={{ maxWidth: '300px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={p.patch_name}>{p.patch_name}</td>}
                {cols.find(c=>c.id==='final_score')?.show && <td style={{ textAlign: "center" }}><span className={`score-badge ${getScoreColorClass(p.final_score)}`}>{p.final_score.toFixed(2)}</span></td>}
                {cols.find(c=>c.id==='severity')?.show && <td style={{ textAlign: "center" }}><span className={`severity-badge severity-${p.severity.toLowerCase()}`}>{p.severity}</span></td>}
                {cols.find(c=>c.id==='cve_count')?.show && <td style={{ textAlign: "center" }}><span className="cell-link" onClick={() => setModalData({ title: "CVEs", items: p.cves })}>{p.cve_count}</span></td>}
                {cols.find(c=>c.id==='device_count')?.show && <td style={{ textAlign: "center" }}><span className="cell-link" onClick={() => setModalData({ title: "Devices", items: p.devices })}>{p.device_count}</span></td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="pagination" style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", padding: "16px 32px", gap: "24px", margin: "0 -32px", width: "calc(100% + 64px)", borderBottom: '1px solid var(--border)' }}>
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <span className="pager-info">Rows per page:</span>
            <select className="control" style={{ width: "70px", height: "32px", padding: '0 8px' }} value={rowsPerPage} onChange={(e) => { setRowsPerPage(Number(e.target.value)); setCurrentPage(1); }}>
                <option value={10}>10</option><option value={20}>20</option><option value={50}>50</option>
            </select>
        </div>
        <span className="pager-info" style={{ fontSize: "13px", color: "var(--muted)" }}>
            {filteredPatches.length > 0 ? (currentPage - 1) * rowsPerPage + 1 : 0}-{Math.min(currentPage * rowsPerPage, filteredPatches.length)} of {filteredPatches.length}
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

      {modalData && (
        <div className="risk-modal-overlay" onClick={() => setModalData(null)}>
          <div className="risk-modal" onClick={(e) => e.stopPropagation()}>
            <div className="risk-modal-header"><h3 style={{ margin: 0, fontSize: "16px", fontWeight: 600 }}>{modalData.title} ({modalData.items.length})</h3><button className="risk-modal-close" onClick={() => setModalData(null)}>✕</button></div>
            <div className="risk-modal-body"><ul>{modalData.items.map((item, i) => <li key={i}>{item}</li>)}</ul></div>
          </div>
        </div>
      )}
    </div>
  );
}