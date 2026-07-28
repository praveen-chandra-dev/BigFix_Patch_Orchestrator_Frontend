// src/modules/risk/dashboard_component/ComputerDashboard.jsx
import { useEffect, useState, useMemo, useRef } from "react";
import PropTypes from "prop-types";
import api from "../../../api/api";
import { performExport } from "../../../utils/exportUtils";
import Paginator from "../../../components/common/Paginator";

// --- Extracted Helper to drastically reduce Cognitive Complexity (S3776, S2004) ---
const evaluateDeviceCondition = (device, c, baselines) => {
  const search = String(c.value).toLowerCase();

  if (c.column === "device_name") {
    const field = device.device_name.toLowerCase();
    if (c.operator === "contains") return field.includes(search);
    if (c.operator === "=") return field === search;
    if (c.operator === "!=") return field !== search;
    return true;
  }

  if (c.column === "patch_id") {
    const siteCondition = c.__site_name;

    return (device.patches || []).some((x) => {
      if (typeof x === "string") {
        return String(x).toLowerCase().includes(search);
      }

      const patchIdMatch =
        String(x.patch_id || "")
          .replace(/^BIGFIX-/i, "")
          .trim()
          .toLowerCase() === search;

      if (!patchIdMatch) {
        return false;
      }

      if (!siteCondition) {
        return true;
      }

      return (
        String(x.site_name || "")
          .trim()
          .toLowerCase() === String(siteCondition).trim().toLowerCase()
      );
    });
  }

  if (c.column === "cve_id") {
    return (device.cves || []).some(
      (x) => String(x).trim().toLowerCase() === search,
    );
  }

  if (c.column === "baseline_name") {
    const matchedBls = baselines.filter((x) => {
      const name = String(x.baseline_name || x.name || "").toLowerCase();
      if (c.operator === "=") return name === search;
      if (c.operator === "contains") return name.includes(search);
      return false;
    });

    if (c.operator === "!=") {
      const exactMatch = baselines.filter(
        (x) => String(x.baseline_name || x.name || "").toLowerCase() === search,
      );
      const allBlPatches = new Set();
      exactMatch.forEach((mb) => {
        let rP = Array.isArray(mb.patches) ? mb.patches : [];
        if (typeof mb.patches === "string") {
          try {
            rP = JSON.parse(mb.patches);
          } catch (e) {
            console.warn("Failed to parse baseline patches", e); // S2486 Fix
          }
        }
        rP.forEach((p) =>
          allBlPatches.add(
            String(p.patch_id || p.id || p)
              .replace(/^BIGFIX-/i, "")
              .trim(),
          ),
        );
      });
      return !Array.from(allBlPatches).some((pid) =>
        device.patches.includes(pid),
      );
    }

    if (matchedBls.length > 0) {
      const allBlPatches = new Set();
      matchedBls.forEach((mb) => {
        let rP = Array.isArray(mb.patches) ? mb.patches : [];
        if (typeof mb.patches === "string") {
          try {
            rP = JSON.parse(mb.patches);
          } catch (e) {
            console.warn("Failed to parse baseline patches", e); // S2486 Fix
          }
        }
        rP.forEach((p) =>
          allBlPatches.add(
            String(p.patch_id || p.id || p)
              .replace(/^BIGFIX-/i, "")
              .trim(),
          ),
        );
      });
      // A device is applicable if it is missing AT LEAST ONE patch from the baseline
      return Array.from(allBlPatches).some((pid) =>
        device.patches.includes(pid),
      );
    }

    return false; // Baseline not found
  }

  return true;
};
// --- End Extracted Helper ---

export default function ComputerDashboard({
  patches = [],
  cves = [],
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
  const [exportFormat, setExportFormat] = useState("CSV");
  const colRef = useRef(null);
  const expRef = useRef(null);

  const [baselines, setBaselines] = useState([]);

  const [cols, setCols] = useState([
    { id: "device_name", label: "Device Name", show: true },
    { id: "patch_count", label: "Missing Patches", show: true },
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
    api
      .get("/baselines")
      .then((res) => {
        const data = Array.isArray(res.data) ? res.data : res.data?.data || [];
        setBaselines(data);
      })
      .catch((err) => console.error(err))
      .finally(() => {
        onDataLoaded?.();
      });
  }, []);

  const patchCveMap = useMemo(() => {
    const map = {};

    cves.forEach((cve) => {
      (cve.patchObjects || []).forEach((patch) => {
        const patchId = String(patch.patch_id || "").trim();

        const siteName = String(patch.site_name || "").trim();

        const key = `${patchId}|${siteName}`;

        if (!map[key]) {
          map[key] = [];
        }

        map[key].push(cve.cve_id);
      });
    });

    return map;
  }, [cves]);

  const deviceExposure = useMemo(() => {
    const map = {};
    patches.forEach((patch) => {
      const devices = Array.isArray(patch.applicable_computers)
        ? patch.applicable_computers
        : [];
      const patchKey = `${String(patch.patch_id || "").trim()}|${String(
        patch.site_name || "",
      ).trim()}`;

      const cvesForPatch = patchCveMap[patchKey] || [];
      devices.forEach((device) => {
        const normalizedDevice = String(device).trim();

        if (!normalizedDevice) return;

        if (!map[normalizedDevice]) {
          map[normalizedDevice] = {
            device_name: normalizedDevice,
            patches: new Set(),
            cves: new Set(),
          };
        }

        map[normalizedDevice].patches.add({
          patch_id: String(patch.patch_id || "")
            .replace(/^BIGFIX-/i, "")
            .trim(),

          site_name: String(patch.site_name || "").trim(),
        });

        cvesForPatch.forEach((cve) => {
          map[normalizedDevice].cves.add(cve);
        });
      });
    });
    return Object.values(map).map((d) => ({
      device_name: d.device_name,
      patch_count: d.patches.size,
      cve_count: d.cves.size,
      patches: Array.from(d.patches),
      cves: Array.from(d.cves),
    }));
  }, [patches, patchCveMap]);

  const applyFilters = (device) => {
    if (!parentFilters.length) return true;
    let globalMatch = parentLogic !== "OR"; // S6644 Fix
    for (const b of parentFilters) {
      let blockMatch = true;
      let validConds = 0;
      for (const c of b.conds) {
        if (!c.value) continue;
        validConds++;
        const condition = evaluateDeviceCondition(device, c, baselines);
        blockMatch = blockMatch && condition;
      }
      if (validConds > 0) {
        globalMatch =
          parentLogic === "OR"
            ? globalMatch || blockMatch
            : globalMatch && blockMatch;
      }
    }
    return globalMatch;
  };

  const filteredDevices = deviceExposure.filter(applyFilters);

  const sortedDevices = useMemo(() => {
    let sortable = [...filteredDevices];
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
  }, [filteredDevices, sortConfig]);

  const paginatedDevices = sortedDevices.slice(
    (currentPage - 1) * rowsPerPage,
    currentPage * rowsPerPage,
  );

  const handleSort = (key) =>
    setSortConfig((prev) => ({
      key,
      direction: prev.key === key && prev.direction === "asc" ? "desc" : "asc",
    }));

  const getSortIcon = (key) => {
    if (sortConfig.key !== key)
      return <span className="muted-text ml-6">↕</span>;
    return (
      <span className="ml-6">{sortConfig.direction === "asc" ? "↑" : "↓"}</span>
    );
  };

  const handleExport = (scope) => {
    setShowExpDrop(false);
    let dataToExport = [];
    if (scope === "page") dataToExport = paginatedDevices;
    else if (scope === "filtered") dataToExport = sortedDevices;
    else dataToExport = deviceExposure;

    performExport(
      dataToExport,
      cols,
      exportFormat,
      "computer_exposure",
      (d, c) => {
        if (c === "patch_count") return d.patches.join(",");
        if (c === "cve_count") return d.cves.join(",");
        return d[c];
      },
    );
  };

  const visibleColCount = cols.filter((c) => c.show).length;
  const colWidth = visibleColCount > 0 ? `${100 / visibleColCount}%` : "auto";

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
              type="button"
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
              type="button"
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
                    letterSpacing: "0.05em",
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
                      type="button"
                      className={`btn small ${
                        exportFormat === fmt ? "pri" : "outline"
                      }`}
                      style={{ fontSize: "11px", height: "32px", padding: 0 }}
                      onClick={(e) => {
                        e.stopPropagation();
                        setExportFormat(fmt);
                      }}
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
                    letterSpacing: "0.05em",
                  }}
                >
                  Scope
                </div>
                <button
                  type="button"
                  className="item"
                  onClick={() => handleExport("page")}
                >
                  Current Page
                </button>
                <button
                  type="button"
                  className="item"
                  onClick={() => handleExport("filtered")}
                >
                  Filtered Data
                </button>
                <button
                  type="button"
                  className="item"
                  onClick={() => handleExport("all")}
                >
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
              {cols.find((c) => c.id === "device_name")?.show && (
                <th
                  className="cursor-pointer"
                  style={{ width: colWidth }}
                  onClick={() => handleSort("device_name")}
                >
                  Device Name{getSortIcon("device_name")}
                </th>
              )}
              {cols.find((c) => c.id === "patch_count")?.show && (
                <th
                  className="cursor-pointer"
                  style={{ textAlign: "center", width: colWidth }}
                  onClick={() => handleSort("patch_count")}
                >
                  Missing Patches{getSortIcon("patch_count")}
                </th>
              )}
              {cols.find((c) => c.id === "cve_count")?.show && (
                <th
                  className="cursor-pointer"
                  style={{ textAlign: "center", width: colWidth }}
                  onClick={() => handleSort("cve_count")}
                >
                  CVEs{getSortIcon("cve_count")}
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {paginatedDevices.length === 0 ? (
              <tr>
                <td
                  colSpan="3"
                  style={{
                    textAlign: "center",
                    padding: "40px",
                    color: "var(--muted)",
                  }}
                >
                  No devices found.
                </td>
              </tr>
            ) : (
              paginatedDevices.map((d) => (
                <tr key={d.device_name}>
                  {cols.find((c) => c.id === "device_name")?.show && (
                    <td style={{ wordBreak: "break-word" }}>{d.device_name}</td>
                  )}
                  {cols.find((c) => c.id === "patch_count")?.show && (
                    <td
                      style={{ textAlign: "center", wordBreak: "break-word" }}
                    >
                      {/* S6848 & S1082 Fix: Native interactive button element */}
                      <button
                        type="button"
                        className="cell-link"
                        style={{
                          background: "none",
                          border: "none",
                          padding: 0,
                          font: "inherit",
                          cursor: "pointer",
                        }}
                        onClick={() =>
                          navigate(
                            "patch",
                            [
                              {
                                conds: [
                                  {
                                    column: "device_name",
                                    operator: "=",
                                    value: d.device_name,
                                  },
                                ],
                              },
                            ],
                            "AND",
                          )
                        }
                      >
                        {d.patch_count}
                      </button>
                    </td>
                  )}
                  {cols.find((c) => c.id === "cve_count")?.show && (
                    <td
                      style={{ textAlign: "center", wordBreak: "break-word" }}
                    >
                      {/* S6848 & S1082 Fix: Native interactive button element */}
                      <button
                        type="button"
                        className="cell-link"
                        style={{
                          background: "none",
                          border: "none",
                          padding: 0,
                          font: "inherit",
                          cursor: "pointer",
                        }}
                        onClick={() =>
                          navigate(
                            "cve",
                            [
                              {
                                conds: [
                                  {
                                    column: "device_name",
                                    operator: "=",
                                    value: d.device_name,
                                  },
                                ],
                              },
                            ],
                            "AND",
                          )
                        }
                      >
                        {d.cve_count}
                      </button>
                    </td>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <Paginator
        total={sortedDevices.length}
        rpp={rowsPerPage}
        setRpp={setRowsPerPage}
        page={currentPage}
        setPage={setCurrentPage}
        edgeToEdge={true}
      />
    </div>
  );
}

// S6774 Fix: Added Props validation
ComputerDashboard.propTypes = {
  patches: PropTypes.array,
  cves: PropTypes.array,
  parentFilters: PropTypes.array,
  parentLogic: PropTypes.string,
  onDataLoaded: PropTypes.func,
  navigate: PropTypes.func.isRequired,
};
