import { useState, useMemo, useRef, useEffect } from "react";
import api from "../../api/api";
import FilterDrawer from "../../components/FilterDrawer";

const getPatchKey = (p) => `${p.patch_id}-${p.site_name}`;

export default function PatchTab({ patches, patchLoading, addBaseline }) {
  const [cves, setCves] = useState([]);
  const [modalData, setModalData] = useState(null);
  const [selectedMap, setSelectedMap] = useState({});
  const [cveLoading, setCveLoading] = useState(false);

  const [sortConfig, setSortConfig] = useState({ key: null, direction: "asc" });

  // DRAWER STATE
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [globalLogic, setGlobalLogic] = useState("AND");
  const [filters, setFilters] = useState([]);
  
  const propertyOptions = [
    { value: "patch_id", label: "Patch ID" },
    { value: "patch_name", label: "Name" },
    { value: "severity", label: "Severity" },
    { value: "cve_id", label: "CVE ID" },
    { value: "final_score", label: "Score" }
  ];

  const [currentPage, setCurrentPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(20);

  const [showColDrop, setShowColDrop] = useState(false);
  const [showExpDrop, setShowExpDrop] = useState(false);

  const [cols, setCols] = useState([
    { id: 'patch_id', label: 'Patch ID', show: true },
    { id: 'patch_name', label: 'Name', show: true },
    { id: 'applicable_count', label: 'Applicable Computers', show: true },
    { id: 'cve_count', label: 'Associated CVE IDs', show: true },
    { id: 'severity', label: 'Vulnerability Severity', show: true },
    { id: 'final_score', label: 'Score', show: true }
  ]);

  useEffect(() => {
    const closeDrops = (e) => {
      if (!e.target.closest('.dropdown')) { setShowColDrop(false); setShowExpDrop(false); }
    };
    document.addEventListener('click', closeDrops);
    return () => document.removeEventListener('click', closeDrops);
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

  if (patchLoading) return <div className="app-loading-content">Loading patches...</div>;

  const loadPatchCves = async (patch) => {
    const key = getPatchKey(patch);
    if (patchCveMap[key]) return;
    setCveLoading(true);
    try {
      const res = await api.post("/cves/by-patches", { patches: [{ patch_id: patch.patch_id, site_name: patch.site_name }] });
      setCves((prev) => [...prev, ...(res.data?.data || [])]);
    } catch (err) {
      console.error("CVE fetch failed", err);
    } finally { setCveLoading(false); }
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
      if (validConds > 0) {
        validBlocks++;
        globalMatch = globalLogic === "OR" ? (globalMatch || blockMatch) : (globalMatch && blockMatch);
      }
    }
    return validBlocks === 0 ? true : globalMatch;
  };

  const handleSort = (key) => setSortConfig((prev) => ({ key, direction: prev.key === key && prev.direction === "asc" ? "desc" : "asc" }));
  const getSortArrow = (key) => sortConfig.key !== key ? "" : sortConfig.direction === "asc" ? " ↑" : " ↓";

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
  const activeFilterCount = filters.reduce((acc, b) => acc + b.conds.filter(c => c.value).length, 0);

  const exportCSV = () => {
    const header = cols.filter(c => c.show).map(c => c.label);
    const rows = filteredPatches.map(p => {
      return cols.filter(c => c.show).map(c => {
        if (c.id === 'patch_id') return p.patch_id?.replace(/^BIGFIX-/, "");
        if (c.id === 'patch_name') return `"${p.patch_name}"`;
        if (c.id === 'severity') return getSeverityFromScore(Number(p.final_score || 0));
        return p[c.id] || 0;
      });
    });
    const csv = [header.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = "patches_export.csv"; a.click();
    setShowExpDrop(false);
  };

  const renderPageBtns = () => {
    const btns = [];
    for(let i=1; i<=totalPages; i++) {
      if(i===1 || i===totalPages || Math.abs(i-currentPage)<=1) {
        btns.push(<button key={i} className={`pager-btn ${i===currentPage?'active':''}`} onClick={() => setCurrentPage(i)}>{i}</button>);
      } else if(i===2 || i===totalPages-1) {
        btns.push(<span key={`dots-${i}`} style={{padding:"0 4px", color:"var(--muted)"}}>..</span>);
      }
    }
    return btns.filter((b, idx, arr) => !(b.props?.children === '..' && arr[idx-1]?.props?.children === '..'));
  };

  const approvePatches = () => {
    if (selectedCount === 0) return;
    addBaseline({ patches: Object.values(selectedMap) });
    setSelectedMap({});
  };

  return (
    <div>
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

      {/* EXACT TOOLBAR MATCHING IMAGE 3 with Icon-Only buttons */}
      <div className="grid-toolbar" style={{ marginTop: '16px', background: 'transparent', border: 'none', padding: 0 }}>
        <div className="grid-toolbar-left" style={{ fontWeight: 600, color: 'var(--text)' }}>
          {selectedCount} of {filteredPatches.length} Patches selected
        </div>
        
        <div className="grid-toolbar-right" style={{ display: 'flex', gap: '12px' }}>
          <button className="iconbtn" onClick={() => setDrawerOpen(true)} title="Filter Data">
             <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="18" height="18"><line x1="4" y1="21" x2="4" y2="14"></line><line x1="4" y1="10" x2="4" y2="3"></line><line x1="12" y1="21" x2="12" y2="12"></line><line x1="12" y1="8" x2="12" y2="3"></line><line x1="20" y1="21" x2="20" y2="16"></line><line x1="20" y1="12" x2="20" y2="3"></line><line x1="1" y1="14" x2="7" y2="14"></line><line x1="9" y1="8" x2="15" y2="8"></line><line x1="17" y1="16" x2="23" y2="16"></line></svg>
          </button>
          
          <button className="btn outline" disabled={selectedCount === 0} onClick={approvePatches} style={{ color: selectedCount === 0 ? 'var(--muted)' : 'var(--text)', borderColor: 'var(--border)' }}>
             Approve Patches
          </button>
          
          <div className="dropdown">
            <button className="iconbtn" onClick={(e) => { e.stopPropagation(); setShowColDrop(!showColDrop); setShowExpDrop(false); }} title="Columns">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="18" height="18"><line x1="8" y1="6" x2="21" y2="6"></line><line x1="8" y1="12" x2="21" y2="12"></line><line x1="8" y1="18" x2="21" y2="18"></line><line x1="3" y1="6" x2="3.01" y2="6"></line><line x1="3" y1="12" x2="3.01" y2="12"></line><line x1="3" y1="18" x2="3.01" y2="18"></line></svg> 
            </button>
            {showColDrop && (
              <div className="dropdown-menu show" style={{ minWidth: "220px", padding: "12px" }}>
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

          <div className="dropdown">
            <button className="iconbtn" onClick={(e) => { e.stopPropagation(); setShowExpDrop(!showExpDrop); setShowColDrop(false); }} title="Export">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="18" height="18"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"></path></svg> 
            </button>
            {showExpDrop && (
              <div className="dropdown-menu show" style={{ width: "200px", padding: "16px" }}>
                <div className="drop-header" style={{fontSize:11, fontWeight:600, color:'var(--muted)', textTransform:'uppercase', marginBottom:8}}>Format</div>
                <div style={{ display: "flex", flexDirection: "column", gap: "4px", marginBottom: "16px" }}>
                  <button className="btn outline" style={{width:'100%', height:32, fontSize:12, padding:0, background: 'var(--bg)'}}>CSV</button>
                  <button className="btn ghost" style={{width:'100%', height:32, fontSize:12, padding:0}}>PDF</button>
                  <button className="btn ghost" style={{width:'100%', height:32, fontSize:12, padding:0}}>HTML</button>
                </div>
                <div className="drop-header" style={{ borderTop: "1px solid var(--border)", paddingTop: "16px", fontSize:11, fontWeight:600, color:'var(--muted)', textTransform:'uppercase', marginBottom:8 }}>Scope</div>
                <button className="item" onClick={exportCSV} style={{ padding: "8px 12px", borderRadius: "4px" }}>Filtered Data</button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* TABLE */}
      <div className="tableWrap">
        <table>
          <thead>
            <tr>
              <th style={{ width: 48, textAlign: "center" }}><input type="checkbox" className="custom-checkbox" onChange={() => toggleSelectAll(paginatedPatches)} /></th>
              {cols.find(c=>c.id==='patch_id')?.show && <th onClick={() => handleSort("patch_id")}><span className="risk-th-content">Patch ID <span className="risk-sort-arrow">{getSortArrow("patch_id")}</span></span></th>}
              {cols.find(c=>c.id==='patch_name')?.show && <th onClick={() => handleSort("patch_name")}><span className="risk-th-content">Name <span className="risk-sort-arrow">{getSortArrow("patch_name")}</span></span></th>}
              {cols.find(c=>c.id==='applicable_count')?.show && <th onClick={() => handleSort("applicable_count")}><span className="risk-th-content">Applicable Computers <span className="risk-sort-arrow">{getSortArrow("applicable_count")}</span></span></th>}
              {cols.find(c=>c.id==='cve_count')?.show && <th onClick={() => handleSort("cve_count")}><span className="risk-th-content">Associated CVE IDs <span className="risk-sort-arrow">{getSortArrow("cve_count")}</span></span></th>}
              {cols.find(c=>c.id==='severity')?.show && <th>Vulnerability Severity</th>}
              {cols.find(c=>c.id==='final_score')?.show && <th onClick={() => handleSort("final_score")}><span className="risk-th-content">Score <span className="risk-sort-arrow">{getSortArrow("final_score")}</span></span></th>}
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

      <div className="pagination">
        <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
          <span className="pager-info">Rows per page:</span>
          <select className="control" style={{ width: "75px", padding: "6px 10px", minWidth: 0, height: "32px" }} value={rowsPerPage} onChange={(e) => { setRowsPerPage(Number(e.target.value)); setCurrentPage(1); }}>
            <option value={10}>10</option><option value={20}>20</option><option value={50}>50</option><option value={100}>100</option>
          </select>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "20px" }}>
          <div className="pager-info">{filteredPatches.length > 0 ? (currentPage - 1) * rowsPerPage + 1 : 0}-{Math.min(currentPage * rowsPerPage, filteredPatches.length)} of {filteredPatches.length}</div>
          <div className="pager-btns">{renderPageBtns()}</div>
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

      {modalData && (
        <div className="risk-modal-overlay" onClick={() => setModalData(null)}>
          <div className="risk-modal" onClick={(e) => e.stopPropagation()}>
            <div className="risk-modal-header">
              <h3>{modalData.title}</h3>
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