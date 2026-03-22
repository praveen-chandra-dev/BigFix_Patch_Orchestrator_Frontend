// src/modules/risk/PatchTab.jsx
import { useState, useMemo, useRef, useEffect } from "react";
import api from "../../api/api";
import { performExport } from "../../utils/exportUtils";
import Paginator from "../../components/common/Paginator";

const getPatchKey = (p) => `${p.patch_id}-${p.site_name}`;

export default function PatchTab({
  patches = [],
  patchLoading,
  addBaseline,
  selectedMap,
  setSelectedMap,
  parentFilters = [],
  parentLogic = "AND",
  isEditingBaseline,
  navigate,
}) {
  const [cves, setCves] = useState([]);
  const [modalData, setModalData] = useState(null);
  
  const [cveLoading, setCveLoading] = useState(false);

  const [sortConfig, setSortConfig] = useState({ key: null, direction: "asc" });

  const [currentPage, setCurrentPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(10);

  const [showColDrop, setShowColDrop] = useState(false);
  const [showExpDrop, setShowExpDrop] = useState(false);
  const [exportFormat, setExportFormat] = useState("CSV");
  const colRef = useRef(null);
  const expRef = useRef(null);
  const headerCheckboxRef = useRef(null);
  const [isMaster, setIsMaster] = useState(false);
  const [toast, setToast] = useState(null);

  const [cols, setCols] = useState([
    { id: "patch_id", label: "Patch ID", show: true, width: "140px" },
    { id: "patch_name", label: "Name", show: true, width: "auto" },
    { id: "applicable_count", label: "Applicable", show: true, width: "100px" },
    { id: "cve_count", label: "CVEs", show: true, width: "70px" },
    { id: "severity", label: "Severity", show: true, width: "120px" },
    { id: "final_score", label: "Score", show: true, width: "80px" },
    { id: "status", label: "Status", show: true, width: "110px" },
  ]);

  useEffect(() => {
    const handleOutside = (e) => {
      if (colRef.current && !colRef.current.contains(e.target)) setShowColDrop(false);
      if (expRef.current && !expRef.current.contains(e.target)) setShowExpDrop(false);
    };
    document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, []);

  const showToast = (message, type = "info") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 5000);
  };

  const patchCveMap = useMemo(() => {
    const map = {};
    cves.forEach((c) => {
      const key = `${c.patch_id}-${c.site_name}`;
      if (!map[key]) map[key] = [];
      map[key].push(c.cve_id);
    });
    return map;
  }, [cves]);

  useEffect(() => {
    async function checkRole() {
      try {
        const res = await api.get("/sites"); 
        if (res.data?.isMaster) setIsMaster(true);
        else setIsMaster(false);
      } catch (e) { setIsMaster(false); }
    }
    checkRole();
  }, []);

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
      if (updated[key]) delete updated[key];
      else updated[key] = patch;
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
          let field;
          if (c.column === "status") field = patch.status === 1 ? "approved" : "not approved";
          else field = String(patch[c.column] || "").toLowerCase();

          if (c.column === "patch_id") field = field.replace(/^bigfix-/, "");

          if (c.operator === "contains") condition = field.includes(search);
          else if (c.operator === "=") condition = field === search;
          else if (c.operator === "!=") condition = field !== search;
        }
        blockMatch = blockMatch && condition;
      }
      if (validConds > 0) globalMatch = parentLogic === "OR" ? globalMatch || blockMatch : globalMatch && blockMatch;
    }
    return globalMatch;
  };

  const handleSort = (key) => setSortConfig((prev) => ({ key, direction: prev.key === key && prev.direction === "asc" ? "desc" : "asc" }));

  const getSortIcon = (key) => {
    if (sortConfig.key !== key) return <span className="muted-text ml-6">↕</span>;
    return <span className="ml-6">{sortConfig.direction === "asc" ? "↑" : "↓"}</span>;
  };

  const filteredPatches = [...(patches || [])].filter(applyFilters).sort((a, b) => {
    if (!sortConfig.key) return 0;
    let aVal, bVal;
    if (sortConfig.key === "patch_id") {
      aVal = String(a.patch_id || "").replace(/^BIGFIX-/, "").toLowerCase();
      bVal = String(b.patch_id || "").replace(/^BIGFIX-/, "").toLowerCase();
    } else if (sortConfig.key === "final_score") {
      aVal = Number(a.final_score || 0);
      bVal = Number(b.final_score || 0);
    } else if (sortConfig.key === "applicable_count") {
      aVal = Number(a.applicable_count || 0);
      bVal = Number(b.applicable_count || 0);
    } else if (sortConfig.key === "cve_count") {
      const keyA = getPatchKey(a); const keyB = getPatchKey(b);
      aVal = a.cve_count ?? (patchCveMap[keyA]?.length || 0);
      bVal = b.cve_count ?? (patchCveMap[keyB]?.length || 0);
    } else if (sortConfig.key === "status") {
      aVal = Number(a.status || 0); bVal = Number(b.status || 0);
    } else {
      aVal = String(a[sortConfig.key] || "").toLowerCase();
      bVal = String(b[sortConfig.key] || "").toLowerCase();
    }
    if (aVal < bVal) return sortConfig.direction === "asc" ? -1 : 1;
    if (aVal > bVal) return sortConfig.direction === "asc" ? 1 : -1;
    return 0;
  });

  const allSelected = filteredPatches.length > 0 && filteredPatches.every((p) => selectedMap[getPatchKey(p)]);
  const someSelected = filteredPatches.some((p) => selectedMap[getPatchKey(p)]) && !allSelected;

  const paginatedPatches = filteredPatches.slice((currentPage - 1) * rowsPerPage, currentPage * rowsPerPage);
  const selectedCount = Object.keys(selectedMap).length;

  const hasApprovable = Object.values(selectedMap).some((p) => p.status !== 1);
  const hasUnapprovable = Object.values(selectedMap).some((p) => p.status !== 0);

  useEffect(() => {
    if (headerCheckboxRef.current) headerCheckboxRef.current.indeterminate = someSelected;
  }, [someSelected]);

  const handleExport = (scope) => {
    setShowExpDrop(false);
    let dataToExport = [];
    if (scope === "page") dataToExport = paginatedPatches;
    else if (scope === "filtered") dataToExport = filteredPatches;
    else dataToExport = patches;

    performExport(dataToExport, cols, exportFormat, "patches_export", (p, cId) => {
        if (cId === "severity") {
            const sevRaw = String(p.severity || p.source_severity || "").toUpperCase().trim();
            if (["CRITICAL", "HIGH", "IMPORTANT", "MODERATE", "LOW", "UNSPECIFIED"].includes(sevRaw)) return sevRaw;
            const score = Number(p.final_score || 0);
            if (score >= 90) return "CRITICAL";
            if (score >= 75) return "HIGH";
            if (score >= 60) return "IMPORTANT";
            if (score >= 40) return "MODERATE";
            if (score > 0) return "LOW";
            return "UNSPECIFIED";
        }
        if (cId === "cve_count") return patchCveMap[getPatchKey(p)]?.length || 0;
        if (cId === "status") return p.status === 1 ? "Approved" : "Not Approved";
        return p[cId];
      },
    );
  };

  const approvePatches = () => {
    if (selectedCount === 0) return;
    const hasUnapproved = Object.values(selectedMap).some((p) => p.status !== 1);
    if (hasUnapproved) {
      showToast("Only approved patches can be used to create baseline", "error");
      return;
    }
    addBaseline({ patches: Object.values(selectedMap) });
    setSelectedMap({});
  };

  const handleApprovePatches = async (approve = true) => {
    if (selectedCount === 0) return;
    const filtered = Object.values(selectedMap).filter((p) => approve ? p.status !== 1 : p.status !== 0);
    if (filtered.length === 0) return;
    try {
      const payload = filtered.map((p) => ({ patch_id: p.patch_id, site_name: p.site_name }));
      await api.post("/patches/approve", { patches: payload, approve });
      filtered.forEach((p) => { p.status = approve ? 1 : 0; });
      setSelectedMap({});
    } catch (err) { console.error("Approve patches failed:", err); }
  };

  if (patchLoading) return <div className="app-loading-content">Loading patches...</div>;

  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, minWidth: 0 }}>
      {toast && (
        <div className={`custom-toast show ${toast.type}`}>
          <div className="toast-content">
            <span>{toast.message}</span>
            <button className="toast-close" onClick={() => setToast(null)}>✕</button>
          </div>
        </div>
      )}
      
      {/* TOOLBAR */}
      <div className="grid-toolbar" style={{ margin: "0 0 16px 0", padding: 0 }}>
        <div className="grid-toolbar-right" style={{ display: "flex", gap: "12px", marginLeft: "auto" }}>
          <button className="btn outline sec small" disabled={!isMaster || !hasApprovable} onClick={() => handleApprovePatches(true)} style={{ color: selectedCount === 0 ? "var(--muted)" : "var(--text)", borderColor: "var(--border)" }}>
            Approve Patches
          </button>
          <button className="btn outline sec small" disabled={!isMaster || !hasUnapprovable} onClick={() => handleApprovePatches(false)}>
            Unapprove
          </button>
          <button className="btn outline sec small" disabled={selectedCount === 0} onClick={approvePatches} style={{ color: selectedCount === 0 ? "var(--muted)" : "var(--text)", borderColor: "var(--border)" }}>
            {isEditingBaseline ? "Add Patches" : "Create Baseline"}
          </button>

          {/* Columns Dropdown */}
          <div className="dropdown" ref={colRef}>
            <button className="btn outline sec small" onClick={(e) => { e.stopPropagation(); setShowColDrop(!showColDrop); setShowExpDrop(false); }} title="Columns">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16"><line x1="8" y1="6" x2="21" y2="6"></line><line x1="8" y1="12" x2="21" y2="12"></line><line x1="8" y1="18" x2="21" y2="18"></line><line x1="3" y1="6" x2="3.01" y2="6"></line><line x1="3" y1="12" x2="3.01" y2="12"></line><line x1="3" y1="18" x2="3.01" y2="18"></line></svg>
              &nbsp; Columns
            </button>
            {showColDrop && (
              <div className="dropdown-menu show" style={{ minWidth: "220px", padding: "12px", right: 0, zIndex: 10 }}>
                <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                  {cols.map((col, i) => (
                    <label key={col.id} style={{ display: "flex", alignItems: "center", gap: "10px", cursor: "pointer", padding: "6px 12px", borderRadius: "4px", transition: "0.2s" }} onMouseOver={(e) => (e.currentTarget.style.background = "#f8fafc")} onMouseOut={(e) => (e.currentTarget.style.background = "transparent")} onClick={(e) => e.stopPropagation()}>
                      <input type="checkbox" className="custom-checkbox" checked={col.show} onChange={(e) => { const newCols = [...cols]; newCols[i].show = e.target.checked; setCols(newCols); }} />
                      <span style={{ fontSize: "13px", color: "var(--text)", fontWeight: 500 }}>{col.label}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Export Dropdown */}
          <div className="dropdown" ref={expRef}>
            <button className="btn outline small" onClick={(e) => { e.stopPropagation(); setShowExpDrop(!showExpDrop); setShowColDrop(false); }} title="Export">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"></path></svg>
              &nbsp; Export
            </button>
            {showExpDrop && (
              <div className="dropdown-menu show" style={{ width: "280px", padding: "16px", right: 0, zIndex: 10 }}>
                <div style={{ fontSize: "11px", fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", marginBottom: "12px", letterSpacing: "0.05em" }}>Format</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "8px", marginBottom: "20px" }}>
                  {["CSV", "PDF", "HTML", "TXT", "JSON", "XML"].map((fmt) => (
                    <button key={fmt} className={`btn small ${exportFormat === fmt ? "pri" : "outline"}`} style={{ fontSize: "11px", height: "32px", padding: 0 }} onClick={(e) => { e.stopPropagation(); setExportFormat(fmt); }}>{fmt}</button>
                  ))}
                </div>
                <div style={{ height: "1px", background: "var(--border)", marginBottom: "16px" }}></div>
                <div style={{ fontSize: "11px", fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", marginBottom: "12px", letterSpacing: "0.05em" }}>Scope</div>
                <button className="item" onClick={() => handleExport("page")}>Current Page</button>
                <button className="item" onClick={() => handleExport("filtered")}>Filtered Data</button>
                <button className="item" onClick={() => handleExport("all")}>All Data</button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* FIXED TABLE LAYOUT */}
      <div className="tableWrap border-top" style={{ flex: 1, overflowY: "auto", overflowX: "hidden", margin: "0 -32px", width: "calc(100% + 64px)", borderLeft: "none", borderRight: "none", borderRadius: 0 }}>
        <table style={{ tableLayout: 'fixed', width: '100%', minWidth: '800px' }}>
          <thead className="kpi-th-sticky">
            <tr>
              <th style={{ width: "40px", textAlign: "center" }}>
                <input ref={headerCheckboxRef} type="checkbox" className="custom-checkbox" checked={allSelected} onChange={() => toggleSelectAll(filteredPatches)} />
              </th>
              {cols.find((c) => c.id === "patch_id")?.show && (
                <th style={{ width: cols.find((c) => c.id === "patch_id").width }} onClick={() => handleSort("patch_id")} className="cursor-pointer">Patch ID{getSortIcon("patch_id")}</th>
              )}
              {cols.find((c) => c.id === "patch_name")?.show && (
                <th style={{ width: cols.find((c) => c.id === "patch_name").width }} onClick={() => handleSort("patch_name")} className="cursor-pointer">Name{getSortIcon("patch_name")}</th>
              )}
              {cols.find((c) => c.id === "applicable_count")?.show && (
                <th style={{ width: cols.find((c) => c.id === "applicable_count").width, textAlign: "center" }} onClick={() => handleSort("applicable_count")} className="cursor-pointer">Applicable{getSortIcon("applicable_count")}</th>
              )}
              {cols.find((c) => c.id === "cve_count")?.show && (
                <th style={{ width: cols.find((c) => c.id === "cve_count").width, textAlign: "center" }} onClick={() => handleSort("cve_count")} className="cursor-pointer">CVEs{getSortIcon("cve_count")}</th>
              )}
              {cols.find((c) => c.id === "severity")?.show && (
                <th style={{ width: cols.find((c) => c.id === "severity").width }}>Severity</th>
              )}
              {cols.find((c) => c.id === "final_score")?.show && (
                <th style={{ width: cols.find((c) => c.id === "final_score").width, textAlign: "center" }} onClick={() => handleSort("final_score")} className="cursor-pointer">Score{getSortIcon("final_score")}</th>
              )}
              {cols.find((c) => c.id === "status")?.show && (
                <th style={{ width: cols.find((c) => c.id === "status").width }} onClick={() => handleSort("status")} className="cursor-pointer">Status{getSortIcon("status")}</th>
              )}
            </tr>
          </thead>
          <tbody>
            {paginatedPatches.length === 0 ? (
              <tr>
                <td colSpan={cols.filter(c => c.show).length + 1} style={{ textAlign: "center", padding: "40px", color: "var(--muted)" }}>No patches found.</td>
              </tr>
            ) : (
              paginatedPatches.map((p) => {
                const isSelected = !!selectedMap[getPatchKey(p)];
                const score = Number(p.final_score || 0);
                
                const sevRaw = String(p.severity || p.source_severity || "").toUpperCase().trim();
                let derivedSeverity = "UNSPECIFIED";
                if (["CRITICAL", "HIGH", "IMPORTANT", "MODERATE", "LOW", "UNSPECIFIED"].includes(sevRaw)) {
                    derivedSeverity = sevRaw;
                } else if (score > 0) {
                    if (score >= 90) derivedSeverity = "CRITICAL";
                    else if (score >= 75) derivedSeverity = "HIGH";
                    else if (score >= 60) derivedSeverity = "IMPORTANT";
                    else if (score >= 40) derivedSeverity = "MODERATE";
                    else derivedSeverity = "LOW";
                }

                return (
                  <tr key={getPatchKey(p)} className={isSelected ? "selected-row" : ""} onClick={(e) => { if (e.target.type === "checkbox") return; toggleSelect(p); }}>
                    <td style={{ textAlign: "center" }}>
                      <input type="checkbox" className="custom-checkbox" checked={isSelected} onChange={() => toggleSelect(p)} onClick={(e) => e.stopPropagation()} />
                    </td>
                    {cols.find((c) => c.id === "patch_id")?.show && (
                      <td>{p.patch_id?.replace(/^BIGFIX-/, "")} {p.has_kev && <span className="kev-badge">KEV</span>}</td>
                    )}
                    {cols.find((c) => c.id === "patch_name")?.show && (
                      <td style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }} title={p.patch_name}>{p.patch_name}</td>
                    )}
                    {cols.find((c) => c.id === "applicable_count")?.show && (
                      <td style={{ textAlign: "center" }}>
                        <span className="cell-link" onClick={(e) => { e.stopPropagation(); navigate("computer", [{ conds: [{ column: "patch_id", operator: "=", value: String(p.patch_id).replace(/^BIGFIX-/, "") }] }], "AND"); }}>
                          {p.applicable_count || 0}
                        </span>
                      </td>
                    )}
                    {cols.find((c) => c.id === "cve_count")?.show && (
                      <td style={{ textAlign: "center" }}>
                        <span className="cell-link" onClick={(e) => { e.stopPropagation(); navigate("cve", [{ conds: [{ column: "patch_id", operator: "=", value: String(p.patch_id).replace(/^BIGFIX-/, "") }] }], "AND"); }}>
                          {p.cve_count || 0}
                        </span>
                      </td>
                    )}
                    {cols.find((c) => c.id === "severity")?.show && (
                      <td><span className={`severity-badge severity-${derivedSeverity.toLowerCase()}`}>{derivedSeverity}</span></td>
                    )}
                    {cols.find((c) => c.id === "final_score")?.show && (
                      <td style={{ textAlign: "center" }}><span className={`score-badge ${getScoreColorClass(score)}`}>{score.toFixed(2)}</span></td>
                    )}
                    {cols.find((c) => c.id === "status")?.show && (
                      <td>{p.status === 1 ? <span className="status-approved">Approved</span> : <span className="status-pending">Not Approved</span>}</td>
                    )}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <Paginator total={filteredPatches.length} rpp={rowsPerPage} setRpp={setRowsPerPage} page={currentPage} setPage={setCurrentPage} edgeToEdge={true} />
    </div>
  );
}