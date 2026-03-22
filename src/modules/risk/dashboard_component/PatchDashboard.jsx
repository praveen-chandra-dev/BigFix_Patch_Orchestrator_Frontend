// src/modules/risk/dashboard_component/PatchDashboard.jsx
import { useEffect, useState, useMemo, useRef } from "react";
import api from "../../../api/api";
import { performExport } from "../../../utils/exportUtils";
import Paginator from "../../../components/common/Paginator";

const getScoreColorClass = (score) => {
  if (score >= 90) return "score-critical";
  if (score >= 75) return "score-high";
  if (score >= 60) return "score-important";
  if (score >= 40) return "score-moderate";
  return "score-low";
};

export default function PatchDashboard({
  patches = [],
  cves = [],
  baselines = [], // from parent, may be incomplete
  parentFilters = [],
  parentLogic = "AND",
  onDataLoaded,
  navigate,
}) {
  const [currentPage, setCurrentPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [sortConfig, setSortConfig] = useState({ key: null, direction: "asc" });

  const [showColDrop, setShowColDrop] = useState(false);
  const [showExpDrop, setShowExpDrop] = useState(false);
  const [exportFormat, setExportFormat] = useState('CSV');
  const colRef = useRef(null);
  const expRef = useRef(null);

  const [cols, setCols] = useState([
    { id: "patch_id", label: "Patch ID", show: true },
    { id: "patch_name", label: "Name", show: true },
    { id: "final_score", label: "Score", show: true },
    { id: "severity", label: "Severity", show: true },
    { id: "cve_count", label: "CVEs", show: true },
    { id: "device_count", label: "Devices", show: true },
  ]);

  // Store baseline patch IDs for filtering
  const [baselinePatchMap, setBaselinePatchMap] = useState(() => {
    // Initialize from passed baselines if they already have patch_ids
    const map = {};
    baselines.forEach(b => {
      const name = (b.baseline_name || b.name || "").toLowerCase();
      const patchIds = (b.patch_ids || []).map(id => String(id).replace(/^BIGFIX-/i, "").trim());
      if (patchIds.length) map[name] = new Set(patchIds);
    });
    return map;
  });

  // Fetch full baseline list (with patch IDs) when needed
  useEffect(() => {
    const neededBaselines = new Set();
    for (const block of parentFilters) {
      for (const cond of block.conds || []) {
        if (cond.column === "baseline_name" && cond.value) {
          const name = String(cond.value).toLowerCase().trim();
          if (!baselinePatchMap[name]) {
            neededBaselines.add(name);
          }
        }
      }
    }
    if (neededBaselines.size === 0) return;

    const fetchBaselines = async () => {
      try {
        const res = await api.get("/baselines/list");
        const raw = Array.isArray(res.data?.baselines) ? res.data.baselines : [];
        const newMap = { ...baselinePatchMap };
        for (const b of raw) {
          const name = (b.baseline_name || b.name || "").toLowerCase();
          const patchIds = (b.patches || []).map(p => {
            const id = typeof p === 'object' ? p.patch_id : p;
            return String(id).replace(/^BIGFIX-/i, "").trim();
          }).filter(Boolean);
          newMap[name] = new Set(patchIds);
        }
        setBaselinePatchMap(newMap);
      } catch (err) {
        console.warn("Failed to load baselines for filtering", err);
      }
    };
    fetchBaselines();
  }, [parentFilters, baselinePatchMap]);

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
    onDataLoaded?.();
  }, []);

  const patchCveMap = useMemo(() => {
    const map = {};
    cves.forEach((c) => {
      if (!map[c.patch_id]) map[c.patch_id] = [];
      map[c.patch_id].push(c.cve_id);
    });
    return map;
  }, [cves]);

  const patchExposure = useMemo(() => {
    return patches.map((patch) => {
      const cvesForPatch = patchCveMap[patch.patch_id] || [];
      const devices = patch.applicable_computers || [];
      const score = Number(patch.final_score || 0);

      const sevRaw = String(patch.severity || patch.source_severity || "").toUpperCase().trim();
      let finalSev = "UNSPECIFIED";
      if (["CRITICAL", "HIGH", "IMPORTANT", "MODERATE", "LOW", "UNSPECIFIED"].includes(sevRaw)) {
          finalSev = sevRaw;
      } else if (score > 0) {
          if (score >= 90) finalSev = "CRITICAL";
          else if (score >= 75) finalSev = "HIGH";
          else if (score >= 60) finalSev = "IMPORTANT";
          else if (score >= 40) finalSev = "MODERATE";
          else finalSev = "LOW";
      }

      return {
        patch_id: patch.patch_id ? patch.patch_id.replace(/^BIGFIX-/i, "") : "",
        patch_name: patch.patch_name || "Unknown",
        vendor: patch.vendor || "Unknown",
        final_score: score,
        severity: finalSev,
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
      let blockMatch = true;
      let validConds = 0;
      for (let c of b.conds) {
        if (!c.value) continue;
        validConds++;
        let condition = true;
        const search = String(c.value).toLowerCase().trim();

        if (c.column === "cve_id") {
          condition = (patch.cves || []).some((x) =>
            x.toLowerCase().includes(search),
          );
        } else if (c.column === "device") {
          condition = (patch.devices || []).some((x) =>
            x.toLowerCase().includes(search),
          );
        } else if (c.column === "final_score") {
          const field = Number(patch.final_score);
          const val = Number(c.value);
          if (!isNaN(val)) {
            if (c.operator === ">") condition = field > val;
            else if (c.operator === "<") condition = field < val;
            else if (c.operator === "=") condition = field === val;
            else if (c.operator === ">=") condition = field >= val;
            else if (c.operator === "<=") condition = field <= val;
          }
        } else if (c.column === "baseline_name") {
          const baselineName = search;
          const patchId = patch.patch_id.replace(/^BIGFIX-/i, "").trim();
          const baselinePatchSet = baselinePatchMap[baselineName];
          if (!baselinePatchSet) {
            condition = false;
          } else {
            condition = baselinePatchSet.has(patchId);
          }
        } else {
          let field;
          if (c.column === "severity") {
            field = String(patch.severity || "").toLowerCase();
          } else {
            field = String(patch[c.column] || "").toLowerCase();
          }

          if (c.operator === "contains") condition = field.includes(search);
          else if (c.operator === "=") condition = field === search;
          else if (c.operator === "!=") condition = field !== search;
        }
        blockMatch = blockMatch && condition;
      }
      if (validConds > 0)
        globalMatch =
          parentLogic === "OR"
            ? globalMatch || blockMatch
            : globalMatch && blockMatch;
    }
    return globalMatch;
  };

  const normalizedFilters = useMemo(() => {
    if (!parentFilters?.length) return [];
    if (parentFilters[0]?.field) {
      return [
        {
          conds: parentFilters.map((f) => ({
            column: f.field,
            operator: "=",
            value: f.value,
          })),
        },
      ];
    }
    return parentFilters;
  }, [parentFilters]);

  const filteredPatches = patchExposure.filter((patch) => {
    if (!normalizedFilters.length) return true;
    let globalMatch = parentLogic === "OR" ? false : true;
    for (let b of normalizedFilters) {
      let blockMatch = true;
      let validConds = 0;
      for (let c of b.conds) {
        if (!c.value) continue;
        validConds++;
        let condition = true;
        const search = String(c.value).toLowerCase().trim();

        if (c.column === "severity") {
          condition = String(patch.severity || "").toLowerCase() === search;
        } else if (c.column === "patch_id") {
          condition = String(patch.patch_id || "")
            .toLowerCase()
            .includes(search);
        } else if (c.column === "patch_name") {
          condition = String(patch.patch_name || "")
            .toLowerCase()
            .includes(search);
        } else if (c.column === "baseline_name") {
          const baselineName = search;
          const patchId = patch.patch_id.replace(/^BIGFIX-/i, "").trim();
          const baselinePatchSet = baselinePatchMap[baselineName];
          condition = baselinePatchSet ? baselinePatchSet.has(patchId) : false;
        } else if (c.column === "cve_id") {
          condition = (patch.cves || []).some(
            (x) => String(x).toLowerCase() === search,
          );
        } else if (c.column === "device") {
          condition = (patch.devices || []).some(
            (x) => String(x).toLowerCase() === search,
          );
        }
        blockMatch = blockMatch && condition;
      }
      if (validConds > 0)
        globalMatch =
          parentLogic === "OR"
            ? globalMatch || blockMatch
            : globalMatch && blockMatch;
    }
    return globalMatch;
  });

  const sortedPatches = useMemo(() => {
    let sortable = [...filteredPatches];
    if (sortConfig.key) {
      sortable.sort((a, b) => {
        let aVal = a[sortConfig.key];
        let bVal = b[sortConfig.key];
        if (
          ["final_score", "cve_count", "device_count"].includes(sortConfig.key)
        ) {
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
  }, [filteredPatches, sortConfig]);

  const paginatedPatches = sortedPatches.slice((currentPage - 1) * rowsPerPage, currentPage * rowsPerPage);

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
    if (scope === 'page') dataToExport = paginatedPatches;
    else if (scope === 'filtered') dataToExport = sortedPatches;
    else dataToExport = patchExposure;

    performExport(dataToExport, cols, exportFormat, "patch_exposure", (p, c) => {
      if (c === "cve_count") return p.cves.join(",");
      if (c === "device_count") return p.devices.join(",");
      return p[c];
    });
  };

  const handleCveRedirect = (cve) => {
    navigate("cve", [{ conds: [{ column: "cve_id", operator: "=", value: cve }] }], "AND");
  };

  const handleDeviceRedirect = (device) => {
    navigate("computer", [{ conds: [{ column: "device_name", operator: "contains", value: device }] }], "AND");
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1 }}>
      <div
        className="grid-toolbar"
        style={{ margin: "0 0 16px 0", padding: 0 }}
      >
        <div
          className="grid-toolbar-left"
          style={{ fontWeight: 600, color: "var(--text)" }}
        ></div>
        <div
          className="grid-toolbar-right"
          style={{ display: "flex", gap: "12px" }}
        >
          <div className="dropdown" ref={colRef}>
            <button
              className="btn outline sec small"
              onClick={() => {
                setShowColDrop(!showColDrop);
                setShowExpDrop(false);
              }}
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                width="16"
                height="16"
              >
                <line x1="8" y1="6" x2="21" y2="6"></line>
                <line x1="8" y1="12" x2="21" y2="12"></line>
                <line x1="8" y1="18" x2="21" y2="18"></line>
                <line x1="3" y1="6" x2="3.01" y2="6"></line>
                <line x1="3" y1="12" x2="3.01" y2="12"></line>
                <line x1="3" y1="18" x2="3.01" y2="18"></line>
              </svg>
              &nbsp; Columns
            </button>
            {showColDrop && (
              <div
                className="dropdown-menu show"
                style={{ minWidth: "220px", padding: "12px", right: 0 }}
              >
                {cols.map((col, i) => (
                  <label
                    key={col.id}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "10px",
                      cursor: "pointer",
                      padding: "6px 12px",
                      borderRadius: "4px",
                    }}
                  >
                    <input
                      type="checkbox"
                      className="custom-checkbox"
                      checked={col.show}
                      onChange={(e) => {
                        const next = [...cols];
                        next[i].show = e.target.checked;
                        setCols(next);
                      }}
                    />
                    <span style={{ fontSize: "13px", fontWeight: 500 }}>
                      {col.label}
                    </span>
                  </label>
                ))}
              </div>
            )}
          </div>
          <div className="dropdown" ref={expRef}>
            <button
              className="btn outline small"
              onClick={() => {
                setShowExpDrop(!showExpDrop);
                setShowColDrop(false);
              }}
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                width="16"
                height="16"
              >
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"></path>
              </svg>
              &nbsp; Export
            </button>
            {showExpDrop && (
              <div
                className="dropdown-menu show"
                style={{ width: "280px", padding: "16px", right: 0 }}
              >
                <div
                  style={{
                    fontSize: "11px",
                    fontWeight: 700,
                    color: "var(--muted)",
                    textTransform: "uppercase",
                    marginBottom: "12px",
                    letterSpacing: '0.05em'
                  }}
                >
                  Format
                </div>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr 1fr",
                    gap: "8px",
                    marginBottom: "20px",
                  }}
                >
                  {["CSV", "PDF", "HTML", "TXT", "JSON", "XML"].map((fmt) => (
                    <button
                      key={fmt}
                      className={`btn small ${exportFormat === fmt ? 'pri' : 'outline'}`}
                      style={{ fontSize: "11px", height: "32px", padding: 0 }}
                      onClick={(e) => { e.stopPropagation(); setExportFormat(fmt); }}
                    >
                      {fmt}
                    </button>
                  ))}
                </div>
                <div
                  style={{
                    height: "1px",
                    background: "var(--border)",
                    marginBottom: "16px",
                  }}
                ></div>
                <div
                  style={{
                    fontSize: "11px",
                    fontWeight: 700,
                    color: "var(--muted)",
                    textTransform: "uppercase",
                    marginBottom: "12px",
                    letterSpacing: '0.05em'
                  }}
                >
                  Scope
                </div>
                <button className="item" onClick={() => handleExport('page')}>
                  Current Page
                </button>
                <button className="item" onClick={() => handleExport('filtered')}>
                  Filtered Data
                </button>
                <button className="item" onClick={() => handleExport('all')}>
                  All Data
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      <div
        className="tableWrap border-top"
        style={{
          flex: 1,
          overflow: "auto",
          margin: "0 -32px",
          width: "calc(100% + 64px)",
          borderLeft: "none",
          borderRight: "none",
          borderRadius: 0,
        }}
      >
        <table style={{ tableLayout: "fixed", width: "100%" }}>
          <thead className="kpi-th-sticky">
            <tr>
              {cols.find((c) => c.id === "patch_id")?.show && (
                <th
                  className="cursor-pointer"
                  onClick={() => handleSort("patch_id")}
                >
                  Patch ID{getSortIcon("patch_id")}
                </th>
              )}
              {cols.find((c) => c.id === "patch_name")?.show && (
                <th
                  className="cursor-pointer"
                  onClick={() => handleSort("patch_name")}
                >
                  Name{getSortIcon("patch_name")}
                </th>
              )}
              {cols.find((c) => c.id === "final_score")?.show && (
                <th
                  className="cursor-pointer"
                  style={{ textAlign: "center" }}
                  onClick={() => handleSort("final_score")}
                >
                  Score{getSortIcon("final_score")}
                </th>
              )}
              {cols.find((c) => c.id === "severity")?.show && (
                <th
                  className="cursor-pointer"
                  style={{ textAlign: "center" }}
                  onClick={() => handleSort("severity")}
                >
                  Severity{getSortIcon("severity")}
                </th>
              )}
              {cols.find((c) => c.id === "cve_count")?.show && (
                <th
                  className="cursor-pointer"
                  style={{ textAlign: "center" }}
                  onClick={() => handleSort("cve_count")}
                >
                  CVEs{getSortIcon("cve_count")}
                </th>
              )}
              {cols.find((c) => c.id === "device_count")?.show && (
                <th
                  className="cursor-pointer"
                  style={{ textAlign: "center" }}
                  onClick={() => handleSort("device_count")}
                >
                  Devices{getSortIcon("device_count")}
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {paginatedPatches.length === 0 ? (
              <tr>
                <td
                  colSpan="6"
                  style={{
                    textAlign: "center",
                    padding: "40px",
                    color: "var(--muted)",
                  }}
                >
                  No patches found.
                </td>
              </tr>
            ) : (
              paginatedPatches.map((p) => (
                <tr key={p.patch_id}>
                  {cols.find((c) => c.id === "patch_id")?.show && (
                    <td>{p.patch_id}</td>
                  )}
                  {cols.find((c) => c.id === "patch_name")?.show && (
                    <td
                      style={{
                        maxWidth: "300px",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                      title={p.patch_name}
                    >
                      {p.patch_name}
                    </td>
                  )}
                  {cols.find((c) => c.id === "final_score")?.show && (
                    <td style={{ textAlign: "center" }}>
                      <span
                        className={`score-badge ${getScoreColorClass(p.final_score)}`}
                      >
                        {p.final_score.toFixed(2)}
                      </span>
                    </td>
                  )}
                  {cols.find((c) => c.id === "severity")?.show && (
                    <td style={{ textAlign: "center" }}>
                      <span
                        className={`severity-badge severity-${p.severity.toLowerCase()}`}
                      >
                        {p.severity}
                      </span>
                    </td>
                  )}
                  {cols.find((c) => c.id === "cve_count")?.show && (
                    <td style={{ textAlign: "center" }}>
                      <span
                        className="cell-link"
                        onClick={() =>
                          navigate(
                            "cve",
                            [
                              {
                                conds: [
                                  {
                                    column: "patch_id",
                                    operator: "=",
                                    value: p.patch_id,
                                  },
                                ],
                              },
                            ],
                            "AND",
                          )
                        }
                      >
                        {p.cve_count}
                      </span>
                    </td>
                  )}
                  {cols.find((c) => c.id === "device_count")?.show && (
                    <td style={{ textAlign: "center" }}>
                      <span
                        className="cell-link"
                        onClick={() =>
                          navigate(
                            "computer",
                            [
                              {
                                conds: [
                                  {
                                    column: "patch_id",
                                    operator: "=",
                                    value: p.patch_id,
                                  },
                                ],
                              },
                            ],
                            "AND",
                          )
                        }
                      >
                        {p.device_count}
                      </span>
                    </td>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <Paginator total={sortedPatches.length} rpp={rowsPerPage} setRpp={setRowsPerPage} page={currentPage} setPage={setCurrentPage} edgeToEdge={true} />
    </div>
  );
}