// src/modules/risk/PatchTab.jsx
import { useState, useMemo, useRef, useEffect } from "react";
import api from "../../api/api";

const getPatchKey = (p) => `${p.patch_id}-${p.site_name}`;

export default function PatchTab({ patches, patchLoading, addBaseline, parentFilters = [], parentLogic = "AND" }) {
  const [cves, setCves] = useState([]);
  const [modalData, setModalData] = useState(null);
  const [selectedMap, setSelectedMap] = useState({});
  const [cveLoading, setCveLoading] = useState(false);

  const [sortConfig, setSortConfig] = useState({ key: null, direction: "asc" });

  const [currentPage, setCurrentPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(20);

  const [showColDrop, setShowColDrop] = useState(false);
  const [showExpDrop, setShowExpDrop] = useState(false);
  const colRef = useRef(null);
  const expRef = useRef(null);

  const [cols, setCols] = useState([
    { id: 'patch_id', label: 'Patch ID', show: true },
    { id: 'patch_name', label: 'Name', show: true },
    { id: 'applicable_count', label: 'Applicable Computers', show: true },
    { id: 'cve_count', label: 'Associated CVE IDs', show: true },
    { id: 'severity', label: 'Vulnerability Severity', show: true },
    { id: 'final_score', label: 'Score', show: true }
  ]);

  useEffect(() => {
    const handleOutside = (e) => {
      if (colRef.current && !colRef.current.contains(e.target)) setShowColDrop(false);
      if (expRef.current && !expRef.current.contains(e.target)) setShowExpDrop(false);
    };
    document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, []);

  const patchCveMap = useMemo(() => {
    const map = {};
    cves.forEach((c) => {
      const key = `${c.patch_id}-${c.site_name}`;
      if (!map[key]) map[key] = [];
      map[key].push(c.cve_id);
    });
    return map;
  }, [cves]);

  const loadPatchCves = async (patch) => {
    const key = getPatchKey(patch);
    if (patchCveMap[key]) return;
    setCveLoading(true);
    try {
      const res = await api.post("/cves/by-patches", { patches: [{ patch_id: patch.patch_id, site_name: patch.site_name }] });
      setCves((prev) => [...prev, ...(res.data?.data || [])]);
    } catch (err) {} finally { setCveLoading(false); }
  };

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

  const toggleSelect = (patch) => {
    setSelectedMap((prev) => {
      const updated = { ...prev }, key = getPatchKey(patch);
      if (updated[key]) delete updated[key]; else updated[key] = patch;
      return updated;
    });
  };

  const toggleSelectAll = (visible) => {
    setSelectedMap((prev) => {
      const updated = { ...prev };
      const allSelected = visible.every((p) => updated[getPatchKey(p)]);
      if (allSelected) visible.forEach((p) => delete updated[getPatchKey(p)]);
      else visible.forEach((p) => (updated[getPatchKey(p)] = p));
      return updated;
    });
  };

  const applyFilters = (patch) => {
    if (!parentFilters.length) return true;
    let globalMatch = parentLogic === "OR" ? false : true;
    for (let b of parentFilters) {
      let blockMatch = true; let validConds = 0;
      for (let c of b.conds) {
        if (!c.value) continue;
        validConds++; let condition = true;
        const search = String(c.value).toLowerCase();
        if (c.column === "cve_id") {
          const list = patchCveMap[getPatchKey(patch)] || [];
          condition = list.some((cve) => cve.toLowerCase().includes(search));
        } else if (c.column === "final_score") {
          const field = Number(patch.final_score || 0); const val = Number(c.value);
          if (!isNaN(val)) {
            if (c.operator === ">") condition = field > val;
            else if (c.operator === "<") condition = field < val;
            else if (c.operator === "=") condition = field === val;
            else if (c.operator === ">=") condition = field >= val;
            else if (c.operator === "<=") condition = field <= val;
            else if (c.operator === "!=") condition = field !== val;
          }
        } else {
          let field = String(patch[c.column] || "").toLowerCase(); 
          if (c.column === "patch_id") field = field.replace(/^bigfix-/, "");
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

  const handleSort = (key) => setSortConfig((prev) => ({ key, direction: prev.key === key && prev.direction === "asc" ? "desc" : "asc" }));
  const getSortIcon = (key) => {
    if (sortConfig.key !== key) return <span className="muted-text ml-6">↕</span>;
    return <span className="ml-6">{sortConfig.direction === "asc" ? "↑" : "↓"}</span>;
  };

  const filteredPatches = [...patches].filter(applyFilters).sort((a, b) => {
    if (!sortConfig.key) return 0;
    let aVal, bVal;
    if (sortConfig.key === "patch_id") {
      aVal = String(a.patch_id || "").replace(/^BIGFIX-/, "").toLowerCase();
      bVal = String(b.patch_id || "").replace(/^BIGFIX-/, "").toLowerCase();
    } else if (sortConfig.key === "final_score") {
      aVal = Number(a.final_score || 0); bVal = Number(b.final_score || 0);
    } else if (sortConfig.key === "applicable_count") {
      aVal = Number(a.applicable_count || 0); bVal = Number(b.applicable_count || 0);
    } else if (sortConfig.key === "cve_count") {
      const keyA = getPatchKey(a); const keyB = getPatchKey(b);
      aVal = a.cve_count ?? (patchCveMap[keyA]?.length || 0);
      bVal = b.cve_count ?? (patchCveMap[keyB]?.length || 0);
    } else {
      aVal = String(a[sortConfig.key] || "").toLowerCase(); bVal = String(b[sortConfig.key] || "").toLowerCase();
    }
    if (aVal < bVal) return sortConfig.direction === "asc" ? -1 : 1;
    if (aVal > bVal) return sortConfig.direction === "asc" ? 1 : -1;
    return 0;
  });

  const totalPages = Math.ceil(filteredPatches.length / rowsPerPage);
  const paginatedPatches = filteredPatches.slice((currentPage - 1) * rowsPerPage, currentPage * rowsPerPage);
  const selectedCount = Object.keys(selectedMap).length;

  const exportCSV = () => { setShowExpDrop(false); };

  const approvePatches = () => {
    if (selectedCount === 0) return;
    addBaseline({ patches: Object.values(selectedMap) });
    setSelectedMap({});
  };

  if (patchLoading) return <div className="app-loading-content">Loading patches...</div>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
      
      <div className="grid-toolbar" style={{ margin: '0 0 16px 0', padding: 0 }}>
      
        
        <div className="grid-toolbar-right" style={{ display: 'flex', gap: '12px' }}>
          <button className="btn outline sec small" disabled={selectedCount === 0} onClick={approvePatches} style={{ color: selectedCount === 0 ? 'var(--muted)' : 'var(--text)', borderColor: 'var(--border)' }}>
             Approve Patches
          </button>
          
          <div className="dropdown" ref={colRef}>
            <button className="btn outline sec small" onClick={(e) => { e.stopPropagation(); setShowColDrop(!showColDrop); setShowExpDrop(false); }} title="Columns">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16"><line x1="8" y1="6" x2="21" y2="6"></line><line x1="8" y1="12" x2="21" y2="12"></line><line x1="8" y1="18" x2="21" y2="18"></line><line x1="3" y1="6" x2="3.01" y2="6"></line><line x1="3" y1="12" x2="3.01" y2="12"></line><line x1="3" y1="18" x2="3.01" y2="18"></line></svg> 
              &nbsp; Columns
            </button>
            {showColDrop && (
              <div className="dropdown-menu show" style={{ minWidth: "220px", padding: "12px", right: 0 }}>
                <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                  {cols.map((col, i) => (
                    <label key={col.id} style={{ display: "flex", alignItems: "center", gap: "10px", cursor: "pointer", padding: "6px 12px", borderRadius: "4px", transition: "0.2s" }} onMouseOver={(e) => e.currentTarget.style.background = '#f8fafc'} onMouseOut={(e) => e.currentTarget.style.background = 'transparent'} onClick={(e) => e.stopPropagation()}>
                      <input type="checkbox" className="custom-checkbox" checked={col.show} onChange={(e) => { const newCols = [...cols]; newCols[i].show = e.target.checked; setCols(newCols); }} />
                      <span style={{ fontSize: "13px", color: "var(--text)", fontWeight: 500 }}>{col.label}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="dropdown" ref={expRef}>
            <button className="btn outline small" onClick={(e) => { e.stopPropagation(); setShowExpDrop(!showExpDrop); setShowColDrop(false); }} title="Export">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"></path></svg> 
              &nbsp; Export
            </button>
            {showExpDrop && (
              <div className="dropdown-menu show" style={{ width: "280px", padding: "16px", right: 0 }}>
                  <div style={{ fontSize: "11px", fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", marginBottom: "12px", letterSpacing: '0.05em' }}>Format</div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "8px", marginBottom: "20px" }}>
                     {['CSV', 'PDF', 'HTML', 'TXT', 'JSON', 'XML'].map(fmt => (
                       <button key={fmt} className="btn outline small" style={{ fontSize: '12px', height: '32px', padding: 0 }} onClick={exportCSV}>{fmt}</button>
                     ))}
                  </div>
                  <div style={{ height: '1px', background: 'var(--border)', marginBottom: '16px' }}></div>
                  <div style={{ fontSize: "11px", fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", marginBottom: "12px", letterSpacing: '0.05em' }}>Scope</div>
                  <button className="item" onClick={exportCSV}>Current Page</button>
                  <button className="item" onClick={exportCSV}>Filtered Data</button>
                  <button className="item" onClick={exportCSV}>All Data</button>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="tableWrap border-top" style={{ flex: 1, overflow: 'auto', margin: '0 -32px', width: 'calc(100% + 64px)', borderLeft: 'none', borderRight: 'none', borderRadius: 0 }}>
        <table>
          <thead className="kpi-th-sticky">
            <tr>
              <th style={{ width: 48, textAlign: "center" }}><input type="checkbox" className="custom-checkbox" onChange={() => toggleSelectAll(paginatedPatches)} /></th>
              {cols.find(c=>c.id==='patch_id')?.show && <th onClick={() => handleSort("patch_id")} className="cursor-pointer">Patch ID {getSortIcon("patch_id")}</th>}
              {cols.find(c=>c.id==='patch_name')?.show && <th onClick={() => handleSort("patch_name")} className="cursor-pointer">Name {getSortIcon("patch_name")}</th>}
              {cols.find(c=>c.id==='applicable_count')?.show && <th onClick={() => handleSort("applicable_count")} className="cursor-pointer">Applicable Computers {getSortIcon("applicable_count")}</th>}
              {cols.find(c=>c.id==='cve_count')?.show && <th onClick={() => handleSort("cve_count")} className="cursor-pointer">Associated CVE IDs {getSortIcon("cve_count")}</th>}
              {cols.find(c=>c.id==='severity')?.show && <th>Vulnerability Severity</th>}
              {cols.find(c=>c.id==='final_score')?.show && <th onClick={() => handleSort("final_score")} className="cursor-pointer">Score {getSortIcon("final_score")}</th>}
            </tr>
          </thead>
          <tbody>
            {paginatedPatches.length === 0 ? <tr><td colSpan="7" style={{ textAlign: "center", padding: "40px", color: "var(--muted)" }}>No patches found.</td></tr> : paginatedPatches.map((p) => {
              const isSelected = !!selectedMap[getPatchKey(p)];
              const score = Number(p.final_score || 0);
              const derivedSeverity = getSeverityFromScore(score);

              return (
                <tr key={getPatchKey(p)} className={isSelected ? "selected-row" : ""} onClick={() => toggleSelect(p)}>
                  <td style={{ textAlign: "center" }}>
                    <input type="checkbox" className="custom-checkbox no-events" checked={isSelected} readOnly />
                  </td>
                  {cols.find(c=>c.id==='patch_id')?.show && <td>{p.patch_id?.replace(/^BIGFIX-/, "")} {p.has_kev && <span className="kev-badge">KEV</span>}</td>}
                  {cols.find(c=>c.id==='patch_name')?.show && <td style={{ maxWidth: '300px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={p.patch_name}>{p.patch_name}</td>}
                  {cols.find(c=>c.id==='applicable_count')?.show && <td><span className="cell-link" onClick={(e) => { e.stopPropagation(); setModalData({ title: "Applicable Computers", items: p.applicable_computers || [] }); }}>{p.applicable_count || 0}</span></td>}
                  {cols.find(c=>c.id==='cve_count')?.show && <td><span className="cell-link" onClick={(e) => { e.stopPropagation(); setCveLoading(true); setModalData({ title: "CVE IDs", key: getPatchKey(p) }); loadPatchCves(p); }}>{p.cve_count ?? patchCveMap[getPatchKey(p)]?.length ?? 0}</span></td>}
                  {cols.find(c=>c.id==='severity')?.show && <td><span className={`severity-badge severity-${derivedSeverity.toLowerCase()}`}>{derivedSeverity}</span></td>}
                  {cols.find(c=>c.id==='final_score')?.show && <td><span className={`score-badge ${getScoreColorClass(score)}`}>{score.toFixed(2)}</span></td>}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="pagination" style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", padding: "16px 32px", gap: "24px", margin: "0 -32px", width: "calc(100% + 64px)", borderBottom: '1px solid var(--border)' }}>
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
              <span className="pager-info" style={{ fontSize: "13px", color: "var(--muted)" }}>Rows per page:</span>
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
            <div className="risk-modal-header">
              <h3 style={{ margin: 0, fontSize: "16px", fontWeight: 600 }}>{modalData.title}</h3>
              <button className="risk-modal-close" onClick={() => setModalData(null)}>✕</button>
            </div>
            <div className="risk-modal-body">
              {modalData.key ? (
                (() => {
                  const cveList = patchCveMap[modalData.key] || [];
                  if (cveLoading && cveList.length === 0) return <div className="risk-spinner"></div>;
                  if (cveList.length === 0) return <div className="risk-modal-empty">No CVEs found</div>;
                  return <ul>{cveList.map((cve, i) => <li key={i}>{cve}</li>)}</ul>;
                })()
              ) : !modalData.items || modalData.items.length === 0 ? (
                <div className="risk-modal-empty">No data available</div>
              ) : (
                <ul>{modalData.items.map((item, i) => <li key={i}>{item}</li>)}</ul>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}