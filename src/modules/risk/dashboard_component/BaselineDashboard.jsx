// src/modules/risk/dashboard_component/BaselineDashboard.jsx
import { useEffect, useState, useMemo, useRef } from "react";
import api from "../../../api/api";
import { performExport } from "../../../utils/exportUtils";
import Paginator from "../../../components/common/Paginator";

export default function BaselineDashboard({
  parentFilters = [],
  parentLogic = "AND",
  onDataLoaded,
  navigate,
}) {
  const [baselines, setBaselines] = useState([]);
  const [patches, setPatches] = useState([]);
  const [cves, setCves] = useState([]);
  const [loading, setLoading] = useState(true);

  const [currentPage, setCurrentPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [sortConfig, setSortConfig] = useState({ key: null, direction: "asc" });

  const [showColDrop, setShowColDrop] = useState(false);
  const [showExpDrop, setShowExpDrop] = useState(false);
  const [exportFormat, setExportFormat] = useState('CSV');
  const colRef = useRef(null);
  const expRef = useRef(null);

  const [cols, setCols] = useState([
    { id: "baseline_name", label: "Baseline", show: true },
    { id: "patch_count", label: "Patches", show: true },
    { id: "cve_count", label: "CVEs", show: true },
  ]);

  useEffect(() => {
    const handleOutside = (e) => {
      if (colRef.current && !colRef.current.contains(e.target))
        setShowColDrop(false);
      if (expRef.current && !expRef.current.contains(e.target))
        setShowExpDrop(false);
    };
    document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, []);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const baselineRes = await api.get("/baselines");
        const baselineData = Array.isArray(baselineRes.data)
          ? baselineRes.data
          : baselineRes.data?.data || [];
        setBaselines(baselineData);

        const patchRes = await api.get("/patches");
        const patchData = Array.isArray(patchRes.data)
          ? patchRes.data
          : patchRes.data?.data || [];
        setPatches(patchData);

        const payload = patchData.map((p) => ({
          patch_id: p.patch_id,
          site_name: p.site_name,
        }));
        
        if (payload.length > 0) {
            const cveRes = await api.post("/cves/by-patches", { patches: payload });
            setCves(cveRes.data?.data || []);
        } else {
            setCves([]);
        }
        
        onDataLoaded?.();
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const patchCveMap = useMemo(() => {
    const map = {};
    cves.forEach((c) => {
      const key = `${c.patch_id}`;
      if (!map[key]) map[key] = [];
      map[key].push(c.cve_id);
    });
    return map;
  }, [cves]);

  const baselineExposure = useMemo(() => {
    return baselines.map((b) => {
      // FIX: Robust Patch ID Extraction
      // If backend sends an array of objects, array of strings, or a stringified JSON
      let rawPatches = [];
      if (Array.isArray(b.patches)) {
          rawPatches = b.patches;
      } else if (typeof b.patches === 'string') {
          try {
              rawPatches = JSON.parse(b.patches);
              if (!Array.isArray(rawPatches)) rawPatches = [];
          } catch(e) {
              rawPatches = [];
          }
      }

      // Ensure we just have simple string IDs like "260865901" without prefixes
      const patchIds = rawPatches.map(p => {
          let id = "";
          if (typeof p === 'object' && p !== null) id = String(p.patch_id || p.id || "");
          else id = String(p);
          return id.replace(/^BIGFIX-/i, "").trim();
      }).filter(Boolean);
      
      const cveSet = new Set();
      patchIds.forEach((cleanId) => {
        // Match both plain ID and BIGFIX- prefixed ID from CVE cache
        const cvesForPatch = patchCveMap[cleanId] || patchCveMap[`BIGFIX-${cleanId}`] || [];
        cvesForPatch.forEach((c) => cveSet.add(c));
      });
      
      return {
        baseline_name: b.baseline_name || b.name || "Unknown Baseline",
        patch_count: patchIds.length,
        cve_count: cveSet.size,
        patches: patchIds,
        cves: Array.from(cveSet),
      };
    });
  }, [baselines, patchCveMap]);

  const applyFilters = (baseline) => {
    if (!parentFilters.length) return true;
    let globalMatch = parentLogic === "OR" ? false : true;
    for (let b of parentFilters) {
      let blockMatch = true;
      let validConds = 0;
      for (let c of b.conds) {
        if (!c.value) continue;
        validConds++;
        let condition = true;
        const search = String(c.value).toLowerCase();
        if (c.column === "baseline_name" || c.column === "patch_name") {
          const field = String(baseline.baseline_name || "").toLowerCase();
          if (c.operator === "contains") condition = field.includes(search);
          else if (c.operator === "=") condition = field === search;
          else if (c.operator === "!=") condition = field !== search;
        } else if (c.column === "patch_id") {
          condition = (baseline.patches || []).some((x) => String(x).toLowerCase().includes(search));
        } else if (c.column === "cve_id") {
          condition = (baseline.cves || []).some((x) => String(x).toLowerCase().includes(search));
        }
        blockMatch = blockMatch && condition;
      }
      if (validConds > 0) {
        globalMatch = parentLogic === "OR" ? globalMatch || blockMatch : globalMatch && blockMatch;
      }
    }
    return globalMatch;
  };

  const filteredBaselines = baselineExposure.filter(applyFilters);

  const sortedBaselines = useMemo(() => {
    let sortable = [...filteredBaselines];
    if (sortConfig.key) {
      sortable.sort((a, b) => {
        let aVal = a[sortConfig.key];
        let bVal = b[sortConfig.key];
        if (["patch_count", "cve_count"].includes(sortConfig.key)) {
          aVal = Number(aVal || 0);
          bVal = Number(bVal || 0);
        } else {
          aVal = String(aVal || "").toLowerCase();
          bVal = String(bVal || "").toLowerCase();
        }
        if (aVal < bVal) return sortConfig.direction === "asc" ? -1 : 1;
        if (aVal > bVal) return sortConfig.direction === "asc" ? 1 : -1;
        return 0;
      });
    }
    return sortable;
  }, [filteredBaselines, sortConfig]);

  const paginatedBaselines = sortedBaselines.slice(
    (currentPage - 1) * rowsPerPage,
    currentPage * rowsPerPage,
  );

  const handleSort = (key) =>
    setSortConfig((prev) => ({
      key,
      direction: prev.key === key && prev.direction === "asc" ? "desc" : "asc",
    }));

  const getSortIcon = (key) => {
    if (sortConfig.key !== key) return <span className="muted-text ml-6">↕</span>;
    return <span className="ml-6">{sortConfig.direction === "asc" ? "↑" : "↓"}</span>;
  };

  const handleExport = (scope) => {
    setShowExpDrop(false);
    let dataToExport = [];
    if (scope === 'page') dataToExport = paginatedBaselines;
    else if (scope === 'filtered') dataToExport = sortedBaselines;
    else dataToExport = baselineExposure;

    performExport(dataToExport, cols, exportFormat, "baseline_exposure", (b, c) => {
      if (c === "patch_count") return b.patches.join(", ");
      if (c === "cve_count") return b.cves.join(", ");
      return b[c];
    });
  };

  if (loading) return <div className="app-loading-content">Loading baselines...</div>;

  const visibleColCount = cols.filter((c) => c.show).length;
  const colWidth = visibleColCount > 0 ? `${100 / visibleColCount}%` : "auto";

  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1 }}>
      <div className="grid-toolbar" style={{ margin: "0 0 16px 0", padding: 0 }}>
        <div className="grid-toolbar-left" style={{ fontWeight: 600, color: "var(--text)" }}></div>
        <div className="grid-toolbar-right" style={{ display: "flex", gap: "12px" }}>
          
          <div className="dropdown" ref={colRef}>
            <button className="btn outline sec small" onClick={() => { setShowColDrop(!showColDrop); setShowExpDrop(false); }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16">
                <line x1="8" y1="6" x2="21" y2="6"></line><line x1="8" y1="12" x2="21" y2="12"></line><line x1="8" y1="18" x2="21" y2="18"></line>
                <line x1="3" y1="6" x2="3.01" y2="6"></line><line x1="3" y1="12" x2="3.01" y2="12"></line><line x1="3" y1="18" x2="3.01" y2="18"></line>
              </svg>
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
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"></path>
              </svg>
              &nbsp; Export
            </button>
            {showExpDrop && (
              <div className="dropdown-menu show" style={{ width: "280px", padding: "16px", right: 0 }}>
                <div style={{ fontSize: "11px", fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", marginBottom: "12px", letterSpacing: '0.05em' }}>Format</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "8px", marginBottom: "20px" }}>
                  {["CSV", "PDF", "HTML", "TXT", "JSON", "XML"].map((fmt) => (
                    <button key={fmt} className={`btn small ${exportFormat === fmt ? 'pri' : 'outline'}`} style={{ fontSize: "11px", height: "32px", padding: 0 }} onClick={(e) => { e.stopPropagation(); setExportFormat(fmt); }}>
                      {fmt}
                    </button>
                  ))}
                </div>
                <div style={{ height: "1px", background: "var(--border)", marginBottom: "16px" }}></div>
                <div style={{ fontSize: "11px", fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", marginBottom: "12px", letterSpacing: '0.05em' }}>Scope</div>
                <button className="item" onClick={() => handleExport('page')}>Current Page</button>
                <button className="item" onClick={() => handleExport('filtered')}>Filtered Data</button>
                <button className="item" onClick={() => handleExport('all')}>All Data</button>
              </div>
            )}
          </div>

        </div>
      </div>

      <div className="tableWrap border-top" style={{ flex: 1, overflow: "auto", margin: "0 -32px", width: "calc(100% + 64px)", borderLeft: "none", borderRight: "none", borderRadius: 0 }}>
        <table style={{ tableLayout: "fixed", width: "100%" }}>
          <thead className="kpi-th-sticky">
            <tr>
              {cols.find((c) => c.id === "baseline_name")?.show && (
                <th className="cursor-pointer" style={{ width: colWidth }} onClick={() => handleSort("baseline_name")}>
                  Baseline{getSortIcon("baseline_name")}
                </th>
              )}
              {cols.find((c) => c.id === "patch_count")?.show && (
                <th className="cursor-pointer" style={{ textAlign: "center", width: colWidth }} onClick={() => handleSort("patch_count")}>
                  Patches{getSortIcon("patch_count")}
                </th>
              )}
              {cols.find((c) => c.id === "cve_count")?.show && (
                <th className="cursor-pointer" style={{ textAlign: "center", width: colWidth }} onClick={() => handleSort("cve_count")}>
                  CVEs{getSortIcon("cve_count")}
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {paginatedBaselines.length === 0 ? (
              <tr>
                <td colSpan={visibleColCount} style={{ textAlign: "center", padding: "40px", color: "var(--muted)" }}>
                  No baselines found.
                </td>
              </tr>
            ) : (
              paginatedBaselines.map((b) => (
                <tr key={b.baseline_name}>
                  {cols.find((c) => c.id === "baseline_name")?.show && (
                    <td style={{ wordBreak: "break-word" }}>{b.baseline_name}</td>
                  )}
                  {cols.find((c) => c.id === "patch_count")?.show && (
                    <td style={{ textAlign: "center" }}>
                      <span className="cell-link" onClick={() => navigate("patch", [{ conds: [{ column: "baseline_name", operator: "=", value: b.baseline_name }] }], "AND")}>
                        {b.patch_count}
                      </span>
                    </td>
                  )}
                  {cols.find((c) => c.id === "cve_count")?.show && (
                    <td style={{ textAlign: "center", wordBreak: "break-word" }}>
                      <span className="cell-link" onClick={() => navigate("cve", [{ conds: [{ column: "baseline_name", operator: "=", value: b.baseline_name }] }], "AND")}>
                        {b.cve_count}
                      </span>
                    </td>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <Paginator total={sortedBaselines.length} rpp={rowsPerPage} setRpp={setRowsPerPage} page={currentPage} setPage={setCurrentPage} edgeToEdge={true} />
    </div>
  );
}