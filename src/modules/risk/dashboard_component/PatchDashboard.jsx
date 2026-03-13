import { useEffect, useState, useMemo, useRef } from "react";
import api from "../../../api/api";
import FilterDrawer from "../../../components/FilterDrawer";

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

export default function PatchDashboard() {
  const [patches, setPatches] = useState([]);
  const [cves, setCves] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalData, setModalData] = useState(null);

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [globalLogic, setGlobalLogic] = useState("AND");
  const [filters, setFilters] = useState([]);
  const propertyOptions = [
    { value: "patch_id", label: "Patch ID" },
    { value: "patch_name", label: "Name" },
    { value: "severity", label: "Severity" },
    { value: "cve_id", label: "CVE ID" },
    { value: "device", label: "Device" },
    { value: "final_score", label: "Score" }
  ];

  const [currentPage, setCurrentPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(20);

  const [showColDrop, setShowColDrop] = useState(false);
  const [showExpDrop, setShowExpDrop] = useState(false);

  const [cols, setCols] = useState([
    { id: 'patch_id', label: 'Patch ID', show: true },
    { id: 'patch_name', label: 'Name', show: true },
    { id: 'final_score', label: 'Score', show: true },
    { id: 'severity', label: 'Severity', show: true },
    { id: 'cve_count', label: 'CVEs', show: true },
    { id: 'device_count', label: 'Devices', show: true }
  ]);

  useEffect(() => {
    const closeDrops = (e) => { if (!e.target.closest('.dropdown')) { setShowColDrop(false); setShowExpDrop(false); } };
    document.addEventListener('click', closeDrops);
    return () => document.removeEventListener('click', closeDrops);
  }, []);

  useEffect(() => {
    const load = async () => {
      try {
        const patchRes = await api.get("/patches");
        const patchData = Array.isArray(patchRes.data) ? patchRes.data : patchRes.data?.data || [];
        setPatches(patchData);
        const payload = patchData.map((p) => ({ patch_id: p.patch_id, site_name: p.site_name }));
        const cveRes = await api.post("/cves/by-patches", { patches: payload });
        setCves(cveRes.data?.data || []);
      } catch (err) { console.error(err); } finally { setLoading(false); }
    };
    load();
  }, []);

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
          condition = (patch.cves || []).some(x => x.toLowerCase().includes(search));
        } else if (c.column === "device") {
          condition = (patch.devices || []).some(x => x.toLowerCase().includes(search));
        } else if (c.column === "final_score") {
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
      if (validConds > 0) {
        validBlocks++;
        globalMatch = globalLogic === "OR" ? (globalMatch || blockMatch) : (globalMatch && blockMatch);
      }
    }
    return validBlocks === 0 ? true : globalMatch;
  };

  const filteredPatches = patchExposure.filter(applyFilters);
  const totalPages = Math.ceil(filteredPatches.length / rowsPerPage);
  const paginatedPatches = filteredPatches.slice((currentPage - 1) * rowsPerPage, currentPage * rowsPerPage);

  const exportCSV = () => {
    const header = cols.filter(c => c.show).map(c => c.label);
    const rows = filteredPatches.map(p => {
      return cols.filter(c => c.show).map(c => {
        if (c.id === 'patch_name') return `"${p.patch_name}"`;
        if (c.id === 'cve_count') return `"[${p.cves.join(",")}]"`;
        if (c.id === 'device_count') return `"[${p.devices.join(",")}]"`;
        return p[c.id] || 0;
      });
    });
    const csv = [header.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = "patch_exposure.csv"; a.click();
    setShowExpDrop(false);
  };

  const activeFilterCount = filters.reduce((acc, b) => acc + b.conds.filter(c => c.value).length, 0);
  
  const renderPageBtns = () => {
    const btns = [];
    for(let i=1; i<=totalPages; i++) {
      if(i===1 || i===totalPages || Math.abs(i-currentPage)<=1) btns.push(<button key={i} className={`pager-btn ${i===currentPage?'active':''}`} onClick={() => setCurrentPage(i)}>{i}</button>);
      else if(i===2 || i===totalPages-1) btns.push(<span key={`dots-${i}`} style={{padding:"0 4px", color:"var(--muted)"}}>..</span>);
    }
    return btns.filter((b, idx, arr) => !(b.props?.children === '..' && arr[idx-1]?.props?.children === '..'));
  };

  if (loading) return <div className="app-loading-content">Loading patches...</div>;

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

      <div className="grid-toolbar">
        <div className="grid-toolbar-left">Showing {filteredPatches.length} Patches</div>
        <div className="grid-toolbar-right">
          <button className="btn outline" onClick={() => setDrawerOpen(true)}>
             <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ margin: 0, marginRight: "6px", width: "16px", height: "16px" }}><line x1="4" y1="21" x2="4" y2="14"></line><line x1="4" y1="10" x2="4" y2="3"></line><line x1="12" y1="21" x2="12" y2="12"></line><line x1="12" y1="8" x2="12" y2="3"></line><line x1="20" y1="21" x2="20" y2="16"></line><line x1="20" y1="12" x2="20" y2="3"></line><line x1="1" y1="14" x2="7" y2="14"></line><line x1="9" y1="8" x2="15" y2="8"></line><line x1="17" y1="16" x2="23" y2="16"></line></svg>
          </button>
          <div className="dropdown">
            <button className="btn outline" onClick={(e) => { e.stopPropagation(); setShowColDrop(!showColDrop); setShowExpDrop(false); }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ margin: 0, marginRight: "6px", width: "16px", height: "16px" }}><line x1="8" y1="6" x2="21" y2="6"></line><line x1="8" y1="12" x2="21" y2="12"></line><line x1="8" y1="18" x2="21" y2="18"></line><line x1="3" y1="6" x2="3.01" y2="6"></line><line x1="3" y1="12" x2="3.01" y2="12"></line><line x1="3" y1="18" x2="3.01" y2="18"></line></svg>
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
            <button className="btn outline" onClick={(e) => { e.stopPropagation(); setShowExpDrop(!showExpDrop); setShowColDrop(false); }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight: "6px", width: "16px", height: "16px" }}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"></path></svg>
            </button>
            {showExpDrop && (
              <div className="dropdown-menu show" style={{ width: "300px", padding: "16px" }}>
                <div className="drop-header" style={{fontSize:11, fontWeight:600, color:'var(--muted)', textTransform:'uppercase', marginBottom:8}}>Format</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "8px", marginBottom: "20px" }}>
                  <button className="btn outline" style={{width:'100%', height:32, fontSize:12, padding:0}}>CSV</button>
                  <button className="btn ghost" style={{width:'100%', height:32, fontSize:12, padding:0}}>PDF</button>
                  <button className="btn ghost" style={{width:'100%', height:32, fontSize:12, padding:0}}>HTML</button>
                </div>
                <div className="drop-header" style={{ borderTop: "1px solid var(--border)", paddingTop: "16px", fontSize:11, fontWeight:600, color:'var(--muted)', textTransform:'uppercase', marginBottom:8 }}>Scope</div>
                <button className="item" onClick={exportCSV}>Filtered Data</button>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="tableWrap">
        <table>
          <thead>
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
            <div className="risk-modal-header"><h3>{modalData.title} ({modalData.items.length})</h3><button className="risk-modal-close" onClick={() => setModalData(null)}>✕</button></div>
            <div className="risk-modal-body"><ul>{modalData.items.map((item, i) => <li key={i}>{item}</li>)}</ul></div>
          </div>
        </div>
      )}
    </div>
  );
}