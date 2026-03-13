import { useEffect, useState, useMemo } from "react";
import api from "../../../api/api";
import FilterDrawer from "../../../components/FilterDrawer";

export default function ComputerDashboard() {
  const [patches, setPatches] = useState([]);
  const [cves, setCves] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalData, setModalData] = useState(null);

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [globalLogic, setGlobalLogic] = useState("AND");
  const [filters, setFilters] = useState([]);
  const propertyOptions = [
    { value: "device_name", label: "Device Name" },
    { value: "patch_id", label: "Patch ID" },
    { value: "cve_id", label: "CVE ID" }
  ];

  const [currentPage, setCurrentPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(20);

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

  const deviceExposure = useMemo(() => {
    const map = {};
    patches.forEach((patch) => {
      const devices = patch.applicable_computers || [];
      const cvesForPatch = patchCveMap[patch.patch_id] || [];
      devices.forEach((device) => {
        if (!map[device]) map[device] = { device_name: device, patches: new Set(), cves: new Set() };
        const cleanPatchId = patch.patch_id ? patch.patch_id.replace(/^BIGFIX-/i, "") : "";
        map[device].patches.add(cleanPatchId);
        cvesForPatch.forEach((cve) => { map[device].cves.add(cve); });
      });
    });
    return Object.values(map).map((d) => ({
      device_name: d.device_name, patch_count: d.patches.size, cve_count: d.cves.size,
      patches: Array.from(d.patches), cves: Array.from(d.cves),
    }));
  }, [patches, patchCveMap]);

  const applyFilters = (device) => {
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

        if (c.column === "device_name") {
          const field = device.device_name.toLowerCase();
          if (c.operator === "contains") condition = field.includes(search);
          else if (c.operator === "=") condition = field === search;
          else if (c.operator === "!=") condition = field !== search;
        } else if (c.column === "patch_id") {
          condition = (device.patches || []).some(x => x.toLowerCase().includes(search));
        } else if (c.column === "cve_id") {
          condition = (device.cves || []).some(x => x.toLowerCase().includes(search));
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

  const filteredDevices = deviceExposure.filter(applyFilters);
  const totalPages = Math.ceil(filteredDevices.length / rowsPerPage);
  const paginatedDevices = filteredDevices.slice((currentPage - 1) * rowsPerPage, currentPage * rowsPerPage);

  const activeFilterCount = filters.reduce((acc, b) => acc + b.conds.filter(c => c.value).length, 0);

  const exportCSV = () => {
    const header = ["Device", "Patch IDs", "CVE IDs"];
    const rows = filteredDevices.map((d) => [d.device_name, `"[${d.patches.join(",")}]"`, `"[${d.cves.join(",")}]"`]);
    const csv = [header.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = "device_exposure.csv"; a.click();
  };

  const renderPageBtns = () => {
    const btns = [];
    for(let i=1; i<=totalPages; i++) {
      if(i===1 || i===totalPages || Math.abs(i-currentPage)<=1) btns.push(<button key={i} className={`pager-btn ${i===currentPage?'active':''}`} onClick={() => setCurrentPage(i)}>{i}</button>);
      else if(i===2 || i===totalPages-1) btns.push(<span key={`dots-${i}`} style={{padding:"0 4px", color:"var(--muted)"}}>..</span>);
    }
    return btns.filter((b, idx, arr) => !(b.props?.children === '..' && arr[idx-1]?.props?.children === '..'));
  };

  if (loading) return <div className="app-loading-content">Loading devices...</div>;

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
        <div className="grid-toolbar-left">Showing {filteredDevices.length} Devices</div>
        <div className="grid-toolbar-right">
          <button className="btn outline" onClick={() => setDrawerOpen(true)}>
             <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ margin: 0, marginRight: "6px", width: "16px", height: "16px" }}><line x1="4" y1="21" x2="4" y2="14"></line><line x1="4" y1="10" x2="4" y2="3"></line><line x1="12" y1="21" x2="12" y2="12"></line><line x1="12" y1="8" x2="12" y2="3"></line><line x1="20" y1="21" x2="20" y2="16"></line><line x1="20" y1="12" x2="20" y2="3"></line><line x1="1" y1="14" x2="7" y2="14"></line><line x1="9" y1="8" x2="15" y2="8"></line><line x1="17" y1="16" x2="23" y2="16"></line></svg>
          </button>
          <button className="btn outline" onClick={exportCSV}>
             <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ margin: 0, marginRight: "6px", width: "16px", height: "16px" }}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"></path></svg>
          </button>
        </div>
      </div>

      <div className="tableWrap">
        <table>
          <thead>
            <tr>
              <th>Device Name</th>
              <th style={{ textAlign: "center" }}>Missing Patches</th>
              <th style={{ textAlign: "center" }}>CVEs</th>
            </tr>
          </thead>
          <tbody>
            {paginatedDevices.length === 0 ? <tr><td colSpan="3" style={{ textAlign: "center", padding: "40px", color: "var(--muted)" }}>No devices found.</td></tr> : paginatedDevices.map((d) => (
              <tr key={d.device_name}>
                <td style={{ fontWeight: 600 }}>{d.device_name}</td>
                <td style={{ textAlign: "center" }}><span className="cell-link" onClick={() => setModalData({ title: "Patches", items: d.patches })}>{d.patch_count}</span></td>
                <td style={{ textAlign: "center" }}><span className="cell-link" onClick={() => setModalData({ title: "CVEs", items: d.cves })}>{d.cve_count}</span></td>
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
            <div className="pager-info">{filteredDevices.length > 0 ? (currentPage - 1) * rowsPerPage + 1 : 0}-{Math.min(currentPage * rowsPerPage, filteredDevices.length)} of {filteredDevices.length}</div>
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