// src/modules/risk/dashboard_component/CVEDashboard.jsx
import { useEffect, useState, useMemo, useRef } from "react";
import api from "../../../api/api";
import { performExport } from "../../../utils/exportUtils";
import Paginator from "../../../components/common/Paginator";

export default function CVEDashboard({
  patches = [],
  cves = [],
  baselines = [],
  parentFilters = [],
  parentLogic = "AND",
  onDataLoaded,
  navigate,
}) {
  const [modalData, setModalData] = useState(null);

  const [currentPage, setCurrentPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [sortConfig, setSortConfig] = useState({ key: null, direction: "asc" });

  const [showColDrop, setShowColDrop] = useState(false);
  const [showExpDrop, setShowExpDrop] = useState(false);
  const [exportFormat, setExportFormat] = useState('CSV');
  const colRef = useRef(null);
  const expRef = useRef(null);

  const [cols, setCols] = useState([
    { id: "cve_id", label: "CVE ID", show: true },
    { id: "severity", label: "Severity", show: true },
    { id: "kev", label: "KEV", show: true },
    { id: "patch_count", label: "Patches", show: true },
    { id: "device_count", label: "Devices", show: true },
  ]);

  // Store baseline patch IDs for filtering
  const [baselinePatchMap, setBaselinePatchMap] = useState(() => {
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

  const patchDeviceMap = useMemo(() => {
    const map = {};
    patches.forEach((p) => {
      const patchId = p.patch_id ? p.patch_id.replace(/^BIGFIX-/i, "") : "";
      map[patchId] = p.applicable_computers || [];
    });
    return map;
  }, [patches]);

  const baselinePatchMapMemo = baselinePatchMap; // use the state directly

  const cveExposure = useMemo(() => {
    const map = {};
    cves.forEach((c) => {
      if (!map[c.cve_id]) {
        map[c.cve_id] = {
          cve_id: c.cve_id,
          patches: new Set(),
          devices: new Set(),
          severity: (c.cvss_severity || "UNKNOWN").toUpperCase(),
          kev: c.is_kev ? "YES" : "NO",
        };
      }
      const patchId = c.patch_id ? c.patch_id.replace(/^BIGFIX-/i, "") : "";

      map[c.cve_id].patches.add(patchId);

      const devices = patchDeviceMap[patchId] || [];
      devices.forEach((d) => {
        map[c.cve_id].devices.add(d);
      });
    });
    return Object.values(map).map((c) => ({
      cve_id: c.cve_id,
      severity: c.severity,
      kev: c.kev,
      patch_count: c.patches.size,
      device_count: c.devices.size,
      patches: Array.from(c.patches),
      devices: Array.from(c.devices),
    }));
  }, [cves, patchDeviceMap]);

  const applyFilters = (cve) => {
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
          const field = (cve.cve_id || "").toLowerCase().trim();
          if (c.operator === "contains") condition = field.includes(search);
          else if (c.operator === "=") condition = field === search;
          else if (c.operator === "!=") condition = field !== search;
        } else if (c.column === "patch_id") {
          condition = (cve.patches || []).some((x) =>
            x.toLowerCase().includes(search),
          );
        } else if (c.column === "baseline_name") {
          const baselineName = search;
          const baselinePatchSet = baselinePatchMap[baselineName];
          if (!baselinePatchSet) {
            condition = false;
          } else {
            // Check if any of the CVE's patches are in the baseline
            condition = (cve.patches || []).some(patchId =>
              baselinePatchSet.has(patchId)
            );
          }
        } else if (c.column === "device_name") {
          if (c.operator === "=") {
            condition = (cve.devices || []).some(
              (x) => String(x).toLowerCase() === search,
            );
          } else {
            condition = (cve.devices || []).some((x) =>
              String(x).toLowerCase().includes(search),
            );
          }
        } else if (c.column === "kev") {
          condition = cve.kev.toLowerCase() === search;
        } else if (c.column === "severity") {
          const field = (cve.severity || "").toLowerCase();

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

  const filteredCVEs = cveExposure.filter(applyFilters);

  const sortedCVEs = useMemo(() => {
    let sortable = [...filteredCVEs];
    if (sortConfig.key) {
      sortable.sort((a, b) => {
        let aVal = a[sortConfig.key];
        let bVal = b[sortConfig.key];
        if (["patch_count", "device_count"].includes(sortConfig.key)) {
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
  }, [filteredCVEs, sortConfig]);

  const paginatedCVEs = sortedCVEs.slice((currentPage - 1) * rowsPerPage, currentPage * rowsPerPage);

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
    if (scope === 'page') dataToExport = paginatedCVEs;
    else if (scope === 'filtered') dataToExport = sortedCVEs;
    else dataToExport = cveExposure;

    performExport(dataToExport, cols, exportFormat, "cve_exposure", (cve, c) => {
      if (c === "patch_count") return cve.patches.join(",");
      if (c === "device_count") return cve.devices.join(",");
      return cve[c];
    });
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
        <table style={{ width: "100%" }}>
          <thead className="kpi-th-sticky">
            <tr>
              {cols.find((c) => c.id === "cve_id")?.show && (
                <th
                  className="cursor-pointer"
                  onClick={() => handleSort("cve_id")}
                >
                  CVE{getSortIcon("cve_id")}
                </th>
              )}

              {cols.find((c) => c.id === "severity")?.show && (
                <th
                  className="cursor-pointer"
                  onClick={() => handleSort("severity")}
                >
                  Severity{getSortIcon("severity")}
                </th>
              )}

              {cols.find((c) => c.id === "kev")?.show && (
                <th
                  className="cursor-pointer"
                  style={{ textAlign: "center" }}
                  onClick={() => handleSort("kev")}
                >
                  KEV{getSortIcon("kev")}
                </th>
              )}
              {cols.find((c) => c.id === "patch_count")?.show && (
                <th
                  className="cursor-pointer"
                  style={{ textAlign: "center" }}
                  onClick={() => handleSort("patch_count")}
                >
                  Patches{getSortIcon("patch_count")}
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
            {paginatedCVEs.length === 0 ? (
              <tr>
                <td
                  colSpan="5"
                  style={{
                    textAlign: "center",
                    padding: "40px",
                    color: "var(--muted)",
                  }}
                >
                  No CVEs found.
                </td>
              </tr>
            ) : (
              paginatedCVEs.map((c) => (
                <tr key={c.cve_id}>
                  {cols.find((c) => c.id === "cve_id")?.show && (
                    <td className="cve-id-cell">{c.cve_id}</td>
                  )}

                  {cols.find((c) => c.id === "severity")?.show && (
                    <td style={{ textAlign: "left" }}>
                      <span
                        className={`severity-badge severity-${c.severity.toLowerCase()}`}
                      >
                        {c.severity}
                      </span>
                    </td>
                  )}

                  {cols.find((c) => c.id === "kev")?.show && (
                    <td style={{ textAlign: "center" }}>
                      {c.kev === "YES" ? (
                        <span className="kev-yes-badge">YES</span>
                      ) : (
                        <span className="kev-no-badge">NO</span>
                      )}
                    </td>
                  )}
                  {cols.find((c) => c.id === "patch_count")?.show && (
                    <td style={{ textAlign: "center" }}>
                      <span
                        className="cell-link"
                        onClick={() =>
                          navigate(
                            "patch",
                            [
                              {
                                conds: [
                                  {
                                    column: "cve_id",
                                    operator: "contains",
                                    value: c.cve_id,
                                  },
                                ],
                              },
                            ],
                            "AND",
                          )
                        }
                      >
                        {c.patch_count}
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
                                    column: "cve_id",
                                    operator: "contains",
                                    value: c.cve_id,
                                  },
                                ],
                              },
                            ],
                            "AND",
                          )
                        }
                      >
                        {c.device_count}
                      </span>
                    </td>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <Paginator total={sortedCVEs.length} rpp={rowsPerPage} setRpp={setRowsPerPage} page={currentPage} setPage={setCurrentPage} edgeToEdge={true} />
    </div>
  );
}