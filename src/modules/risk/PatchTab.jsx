// src/modules/risk/PatchTab.jsx
import { useState, useMemo, useRef, useEffect } from "react";
import PropTypes from "prop-types";
import api from "../../api/api";
import { performExport } from "../../utils/exportUtils";
import { useToast } from "../../components/common/CustomToast";
import Paginator from "../../components/common/Paginator";
import SidePanel from "../../components/common/SidePanel";
import { parseDescription } from "../../utils/descriptionParser";

const getPatchKey = (p) =>
  `${String(p.patch_id || "")
    .replace(/^BIGFIX-/i, "")
    .trim()}|${String(p.site_name || "").trim()}`;

const getScoreColorClass = (score) => {
  if (score >= 90) return "score-critical";
  if (score >= 75) return "score-high";
  if (score >= 60) return "score-important";
  if (score >= 40) return "score-moderate";
  return "score-low";
};

// S3776 Fix: Flattened returns
const getDerivedSeverity = (patch) => {
  const score = Number(patch.final_score || 0);
  const cveCount = Number(patch.cve_count || 0);
  const sevRaw = String(patch.severity || patch.source_severity || "")
    .toUpperCase()
    .trim();

  if (
    cveCount === 0 &&
    ["CRITICAL", "HIGH", "IMPORTANT", "MODERATE", "LOW"].includes(sevRaw)
  )
    return sevRaw;
  if (score > 0) {
    if (score >= 90) return "CRITICAL";
    if (score >= 75) return "HIGH";
    if (score >= 60) return "IMPORTANT";
    if (score >= 40) return "MODERATE";
    return "LOW";
  }
  if (["CRITICAL", "HIGH", "IMPORTANT", "MODERATE", "LOW"].includes(sevRaw))
    return sevRaw;
  return "UNSPECIFIED";
};

// S3776 Fix: Sub-helper for score
const evaluateScore = (patch, c) => {
  const field = Number(patch.final_score || 0);
  const val = Number(c.value);
  if (Number.isNaN(val)) return false;
  switch (c.operator) {
    case ">":
      return field > val;
    case "<":
      return field < val;
    case "=":
      return field === val;
    case ">=":
      return field >= val;
    case "<=":
      return field <= val;
    case "!=":
      return field !== val;
    default:
      return false;
  }
};

// S3776 Fix: Sub-helper for baseline
const evaluateBaseline = (patch, c, baselines) => {
  const search = String(c.value).toLowerCase();
  const bl = baselines.find(
    (x) => String(x.baseline_name || x.name || "").toLowerCase() === search,
  );
  if (!bl) return false;

  let rP = Array.isArray(bl.patches) ? bl.patches : [];
  if (typeof bl.patches === "string") {
    try {
      rP = JSON.parse(bl.patches);
    } catch (e) {
      console.warn("Parse error for baseline patches", e);
    }
  }
  const allBlPatches = rP.map((p) =>
    String(p.patch_id || p.id || p)
      .replace(/^BIGFIX-/i, "")
      .trim()
      .toLowerCase(),
  );
  const cleanPatchId = String(patch.patch_id)
    .replace(/^BIGFIX-/i, "")
    .trim()
    .toLowerCase();
  return allBlPatches.includes(cleanPatchId);
};

// S3776 Fix: Sub-helper for string matches
const evaluateStringMatch = (field, operator, search) => {
  if (operator === "contains") return field.includes(search);
  if (operator === "=") return field === search;
  if (operator === "!=") return field !== search;
  return true;
};

// S3776 Fix: Field resolver
const getFieldValue = (patch, column) => {
  if (column === "status")
    return patch.status === 1 ? "approved" : "not approved";
  if (column === "severity") return getDerivedSeverity(patch).toLowerCase();
  let field = String(patch[column] || "").toLowerCase();
  if (column === "patch_id") return field.replace(/^bigfix-/, "");
  return field;
};

const evaluateCondition = (patch, c, patchCveMap, baselines) => {
  const search = String(c.value || "")
    .toLowerCase()
    .trim();
  if (c.column === "cve_id") {
    const list = patchCveMap[getPatchKey(patch)] || [];

    if (c.operator === "contains") {
      return list.some((cve) =>
        String(cve || "")
          .toLowerCase()
          .trim()
          .includes(search),
      );
    }

    if (c.operator === "=") {
      return list.some(
        (cve) =>
          String(cve || "")
            .toLowerCase()
            .trim() === search,
      );
    }

    if (c.operator === "!=") {
      return !list.some(
        (cve) =>
          String(cve || "")
            .toLowerCase()
            .trim() === search,
      );
    }

    return false;
  }
  if (c.column === "final_score") return evaluateScore(patch, c);
  if (c.column === "device_name" || c.column === "device") {
    return (patch.applicable_computers || []).some((comp) =>
      String(comp).toLowerCase().includes(search),
    );
  }
  if (c.column === "baseline_name")
    return evaluateBaseline(patch, c, baselines);

  return evaluateStringMatch(
    getFieldValue(patch, c.column),
    c.operator,
    search,
  );
};

// S3776 Fix: Sorting value resolver
const getSortValue = (patch, key, patchCveMap) => {
  switch (key) {
    case "patch_id":
      return String(patch.patch_id || "")
        .replace(/^BIGFIX-/, "")
        .toLowerCase();
    case "final_score":
      return Number(patch.final_score || 0);
    case "applicable_count":
      return Number(patch.applicable_count || 0);
    case "cve_count":
      return patch.cve_count ?? (patchCveMap[getPatchKey(patch)]?.length || 0);
    case "status":
      return Number(patch.status || 0);
    default:
      return String(patch[key] || "").toLowerCase();
  }
};

const comparePatches = (a, b, sortConfig, patchCveMap) => {
  if (!sortConfig.key) return 0;
  const aVal = getSortValue(a, sortConfig.key, patchCveMap);
  const bVal = getSortValue(b, sortConfig.key, patchCveMap);

  if (aVal < bVal) return sortConfig.direction === "asc" ? -1 : 1;
  if (aVal > bVal) return sortConfig.direction === "asc" ? 1 : -1;
  return 0;
};

// S3776 Fix: Extracted block evaluation
const evaluateBlock = (patch, block, patchCveMap, baselines) => {
  let blockMatch = true;
  let validConds = 0;
  for (let c of block.conds) {
    if (!c.value) continue;
    validConds++;
    blockMatch =
      blockMatch && evaluateCondition(patch, c, patchCveMap, baselines);
  }
  return { blockMatch, validConds };
};

const filterPatchesList = (
  patches,
  parentFilters,
  parentLogic,
  patchCveMap,
  baselines,
) => {
  if (!parentFilters.length) return patches;
  return patches.filter((patch) => {
    let globalMatch = parentLogic !== "OR";
    for (let b of parentFilters) {
      const { blockMatch, validConds } = evaluateBlock(
        patch,
        b,
        patchCveMap,
        baselines,
      );
      if (validConds > 0) {
        globalMatch =
          parentLogic === "OR"
            ? globalMatch || blockMatch
            : globalMatch && blockMatch;
      }
    }
    return globalMatch;
  });
};

const renderCell = (colId, p, patchCveMap, navigate, openPatchDetails) => {
  const derivedSeverity = getDerivedSeverity(p);
  const score = Number(p.final_score || 0);
  switch (colId) {
    case "patch_id":
      return (
        <>
          {p.patch_id?.replace(/^BIGFIX-/, "")}{" "}
          {p.has_kev && <span className="kev-badge">KEV</span>}
        </>
      );
    case "patch_name":
      return (
        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
          <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>
            {p.patch_name}
          </span>
          <button
            type="button"
            style={{
              background: "none",
              border: "none",
              padding: 0,
              color: "var(--primary)",
              cursor: "pointer",
              flexShrink: 0,
            }}
            title="View Description"
            onClick={(e) => {
              e.stopPropagation();
              openPatchDetails(p);
            }}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 512 512"
              width="14"
              height="14"
              fill="currentColor"
            >
              <path d="M256 512A256 256 0 1 0 256 0a256 256 0 1 0 0 512zM216 336h24V272H216c-13.3 0-24-10.7-24-24s10.7-24 24-24h48c13.3 0 24 10.7 24 24v88h8c13.3 0 24 10.7 24 24s-10.7 24-24 24H216c-13.3 0-24-10.7-24-24s10.7-24 24-24zm40-208a32 32 0 1 1 0 64 32 32 0 1 1 0-64z" />
            </svg>
          </button>
        </div>
      );
    case "site_name":
      return <span title={p.site_name}>{p.site_name}</span>;
    case "applicable_count":
      return (
        <button
          type="button"
          className="cell-link"
          style={{
            background: "none",
            border: "none",
            padding: 0,
            font: "inherit",
            color: "var(--primary)",
            cursor: "pointer",
          }}
          onClick={(e) => {
            e.stopPropagation();

            navigate(
              "computer",
              [
                {
                  conds: [
                    {
                      column: "patch_id",
                      operator: "=",
                      value: String(p.patch_id)
                        .replace(/^BIGFIX-/, "")
                        .trim(),

                      __site_name: String(p.site_name || "").trim(),
                    },
                  ],
                },
              ],
              "AND",
            );
          }}
        >
          {p.applicable_count || 0}
        </button>
      );
    case "cve_count":
      return (
        <button
          type="button"
          className="cell-link"
          style={{
            background: "none",
            border: "none",
            padding: 0,
            font: "inherit",
            color: "var(--primary)",
            cursor: "pointer",
          }}
          onClick={(e) => {
            e.stopPropagation();
            navigate(
              "cve",
              [
                {
                  conds: [
                    {
                      column: "patch_id",
                      operator: "=",
                      value: String(p.patch_id).replace(/^BIGFIX-/, ""),
                    },
                    { column: "site_name", operator: "=", value: p.site_name },
                  ],
                },
              ],
              "AND",
            );
          }}
        >
          {p.cve_count || 0}
        </button>
      );
    case "severity":
      return (
        <span
          className={`severity-badge severity-${derivedSeverity.toLowerCase()}`}
        >
          {derivedSeverity}
        </span>
      );
    case "final_score":
      return Number(p.cve_count || 0) === 0 ||
        derivedSeverity === "UNSPECIFIED" ? (
        <span className="score-badge score-unspecified">--</span>
      ) : (
        <span className={`score-badge ${getScoreColorClass(score)}`}>
          {score.toFixed(2)}
        </span>
      );
    case "status":
      return p.status === 1 ? (
        <span className="status-approved">Approved</span>
      ) : (
        <span className="status-pending">Not Approved</span>
      );
    default:
      return null;
  }
};

function PatchDetailsPanel({ selectedPatch, showPanel, setShowPanel }) {
  if (!selectedPatch)
    return (
      <SidePanel
        open={showPanel}
        onClose={() => setShowPanel(false)}
        title="Patch Details"
      />
    );

  const { summary, packages, meta, notes, stats } = parseDescription(
    selectedPatch.description,
  );
  const isKBOnly =
    packages.length > 0 && packages.every((p) => p.startsWith("KB"));

  return (
    <SidePanel
      open={showPanel}
      onClose={() => setShowPanel(false)}
      title="Patch Details"
    >
      <div style={{ marginBottom: "12px" }}>
        <strong>ID:</strong> {selectedPatch.patch_id?.replace(/^BIGFIX-/, "")}
      </div>
      <div style={{ marginBottom: "12px" }}>
        <strong>Name:</strong> {selectedPatch.patch_name}
      </div>
      <div style={{ marginBottom: "12px" }}>
        <strong>Site:</strong> {selectedPatch.site_name}
      </div>
      <div style={{ marginBottom: "12px" }}>
        <strong>Score:</strong> {selectedPatch.final_score?.toFixed(2)}
      </div>

      <div>
        <strong>Description:</strong>
        <div style={{ fontSize: "13px", lineHeight: "1.7" }}>
          {summary && <div style={{ marginBottom: "16px" }}>{summary}</div>}
          {packages.length > 0 && !isKBOnly && (
            <div style={{ marginBottom: "20px" }}>
              <div style={{ fontWeight: 600, marginBottom: "8px" }}>
                Target Packages
              </div>
              <div
                style={{
                  maxHeight: "320px",
                  overflowY: "auto",
                  padding: "12px",
                  background: "#f8fafc",
                  borderRadius: "8px",
                  fontFamily: "monospace",
                  fontSize: "12px",
                  border: "1px solid var(--border)",
                }}
              >
                {packages.map((pkg) => (
                  <div key={pkg}>{pkg}</div>
                ))}
              </div>
            </div>
          )}
          {meta && meta.length > 0 && (
            <div style={{ marginBottom: "16px", color: "var(--muted)" }}>
              {meta.map((line) => (
                <div key={line} style={{ marginBottom: "8px" }}>
                  {line}
                </div>
              ))}
            </div>
          )}
          {stats &&
            (stats.fileCount || stats.fileSize || stats.cves.length > 0) && (
              <div
                style={{
                  marginBottom: "16px",
                  padding: "10px",
                  background: "#f1f5f9",
                  borderRadius: "6px",
                  fontSize: "12px",
                }}
              >
                {stats.fileCount && (
                  <div>
                    <strong>Target Files:</strong> {stats.fileCount}
                  </div>
                )}
                {stats.fileSize && (
                  <div>
                    <strong>Download Size:</strong> {stats.fileSize}
                  </div>
                )}
                {stats.cves.length > 0 && (
                  <div style={{ marginTop: "6px" }}>
                    <strong>CVEs:</strong>
                    <div style={{ marginTop: "4px" }}>
                      {stats.cves.map((cve) => (
                        <span
                          key={cve}
                          style={{
                            display: "inline-block",
                            padding: "2px 6px",
                            margin: "2px",
                            background: "#e2e8f0",
                            borderRadius: "4px",
                            fontSize: "11px",
                          }}
                        >
                          {cve}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          {notes.length > 0 && (
            <div
              style={{
                padding: "12px",
                background: "#fff7ed",
                border: "1px solid #fdba74",
                borderRadius: "8px",
                fontSize: "12px",
              }}
            >
              <div style={{ fontWeight: 600, marginBottom: "8px" }}>Notes</div>
              {notes.map((n) => (
                <div key={n} style={{ marginBottom: "10px" }}>
                  {n}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </SidePanel>
  );
}

PatchDetailsPanel.propTypes = {
  selectedPatch: PropTypes.object,
  showPanel: PropTypes.bool.isRequired,
  setShowPanel: PropTypes.func.isRequired,
};

export default function PatchTab({
  patches = [],
  patchLoading,
  addBaseline,
  baselines = [],
  selectedMap,
  setSelectedMap,
  parentFilters = [],
  parentLogic = "AND",
  isEditingBaseline,
  navigate,
}) {
  const [cves, setCves] = useState([]);
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
  const [selectedPatch, setSelectedPatch] = useState(null);
  const [showPanel, setShowPanel] = useState(false);

  const { showToast } = useToast();

  const [cols, setCols] = useState([
    { id: "patch_id", label: "Patch ID", show: true, width: "140px" },
    {
      id: "patch_name",
      label: "Name",
      show: true,
      width: "auto",
      truncate: true,
    },
    {
      id: "site_name",
      label: "Site",
      show: true,
      width: "160px",
      truncate: true,
    },
    {
      id: "applicable_count",
      label: "Applicable",
      show: true,
      width: "100px",
      align: "center",
    },
    {
      id: "cve_count",
      label: "CVEs",
      show: true,
      width: "70px",
      align: "center",
    },
    { id: "severity", label: "Severity", show: true, width: "120px" },
    {
      id: "final_score",
      label: "Score",
      show: true,
      width: "80px",
      align: "center",
    },
    { id: "status", label: "Status", show: true, width: "110px" },
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

  const patchCveMap = useMemo(() => {
    const map = {};

    cves.forEach((c) => {
      (c.patchObjects || []).forEach((p) => {
        const key = `${String(p.patch_id || "")
          .replace(/^BIGFIX-/i, "")
          .trim()}|${String(p.site_name || "").trim()}`;

        if (!map[key]) {
          map[key] = [];
        }

        map[key].push(c.cve_id);
      });
    });

    return map;
  }, [cves]);

  useEffect(() => {
    async function checkRole() {
      try {
        const res = await api.get("/sites");
        if (res.data?.isMaster) setIsMaster(true);
        else setIsMaster(false);
      } catch (e) {
        console.warn("Failed to check role:", e);
        setIsMaster(false);
      }
    }
    checkRole();
  }, []);

  useEffect(() => {
    const fetchCvesForPatches = async () => {
      if (!patches || patches.length === 0) {
        setCves([]);
        return;
      }
      try {
        const payload = patches.map((p) => ({
          patch_id: p.patch_id,
          site_name: p.site_name,
        }));
        const res = await api.post("/cves/by-patches", { patches: payload });
        setCves(res.data?.unique_cves || []);
      } catch (err) {
        console.error("Failed to load CVEs in PatchTab:", err);
      }
    };
    fetchCvesForPatches();
  }, [patches]);

  const toggleSelect = (patch) => {
    setSelectedMap((prev) => {
      const updated = { ...prev };
      const key = getPatchKey(patch);
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

  const openPatchDetails = (p) => {
    setSelectedPatch(p);
    setShowPanel(true);
  };

  const hasCveFilter = useMemo(() => {
    return parentFilters.some((b) =>
      b.conds.some((c) => c.column === "cve_id" && c.value),
    );
  }, [parentFilters]);

  const filteredPatches = useMemo(() => {
    if (
      hasCveFilter &&
      Object.keys(patchCveMap).length === 0 &&
      patches.length > 0
    ) {
      return [];
    }

    return filterPatchesList(
      patches || [],
      parentFilters,
      parentLogic,
      patchCveMap,
      baselines,
    );
  }, [
    patches,
    parentFilters,
    parentLogic,
    patchCveMap,
    baselines,
    hasCveFilter,
  ]);

  const sortedPatches = useMemo(() => {
    return [...filteredPatches].sort((a, b) =>
      comparePatches(a, b, sortConfig, patchCveMap),
    );
  }, [filteredPatches, sortConfig, patchCveMap]);

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

  const allSelected =
    filteredPatches.length > 0 &&
    filteredPatches.every((p) => selectedMap[getPatchKey(p)]);
  const someSelected =
    filteredPatches.some((p) => selectedMap[getPatchKey(p)]) && !allSelected;

  const paginatedPatches = sortedPatches.slice(
    (currentPage - 1) * rowsPerPage,
    currentPage * rowsPerPage,
  );
  const selectedCount = Object.keys(selectedMap).length;

  const hasApprovable = Object.values(selectedMap).some((p) => p.status !== 1);
  const hasUnapprovable = Object.values(selectedMap).some(
    (p) => p.status !== 0,
  );

  useEffect(() => {
    if (headerCheckboxRef.current)
      headerCheckboxRef.current.indeterminate = someSelected;
  }, [someSelected]);

  const handleExport = (scope) => {
    setShowExpDrop(false);
    let dataToExport = [];
    if (scope === "page") dataToExport = paginatedPatches;
    else if (scope === "filtered") dataToExport = sortedPatches;
    else dataToExport = patches;

    performExport(
      dataToExport,
      cols,
      exportFormat,
      "patches_export",
      (p, cId) => {
        if (cId === "severity") {
          return getDerivedSeverity(p);
        }
        if (cId === "cve_count")
          return patchCveMap[getPatchKey(p)]?.length || 0;
        if (cId === "status")
          return p.status === 1 ? "Approved" : "Not Approved";
        return p[cId];
      },
    );
  };

  const approvePatches = () => {
    if (selectedCount === 0) return;
    const hasUnapproved = Object.values(selectedMap).some(
      (p) => p.status !== 1,
    );
    if (hasUnapproved) {
      showToast(
        "Only approved patches can be used to create baseline",
        "error",
      );
      return;
    }
    addBaseline({ patches: Object.values(selectedMap) });
    setSelectedMap({});
  };

  const handleApprovePatches = async (approve = true) => {
    if (selectedCount === 0) return;
    const filtered = Object.values(selectedMap).filter((p) =>
      approve ? p.status !== 1 : p.status !== 0,
    );
    if (filtered.length === 0) return;
    try {
      const payload = filtered.map((p) => ({
        patch_id: p.patch_id,
        site_name: p.site_name,
      }));
      await api.post("/patches/approve", { patches: payload, approve });
      filtered.forEach((p) => {
        p.status = approve ? 1 : 0;
      });
      setSelectedMap({});
    } catch (err) {
      console.warn("Approve patches failed:", err);
    }
  };

  if (patchLoading)
    return <div className="app-loading-content">Loading patches...</div>;

  return (
    <div
      style={{ display: "flex", flexDirection: "column", flex: 1, minWidth: 0 }}
    >
      {/* TOOLBAR */}
      <div
        className="grid-toolbar"
        style={{ margin: "0 0 16px 0", padding: 0 }}
      >
        <div
          className="grid-toolbar-right"
          style={{ display: "flex", gap: "12px", marginLeft: "auto" }}
        >
          <button
            className="btn outline sec small"
            disabled={!isMaster || !hasApprovable}
            onClick={() => handleApprovePatches(true)}
            style={{
              color: selectedCount === 0 ? "var(--muted)" : "var(--text)",
              borderColor: "var(--border)",
            }}
          >
            Approve Patches
          </button>
          <button
            className="btn outline sec small"
            disabled={!isMaster || !hasUnapprovable}
            onClick={() => handleApprovePatches(false)}
          >
            Unapprove
          </button>
          <button
            className="btn outline sec small"
            disabled={selectedCount === 0}
            onClick={approvePatches}
            style={{
              color: selectedCount === 0 ? "var(--muted)" : "var(--text)",
              borderColor: "var(--border)",
            }}
          >
            {isEditingBaseline ? "Add Patches" : "Create Baseline"}
          </button>

          {/* Columns Dropdown */}
          <div className="dropdown" ref={colRef}>
            <button
              className="btn outline sec small"
              onClick={(e) => {
                e.stopPropagation();
                setShowColDrop(!showColDrop);
                setShowExpDrop(false);
              }}
              title="Columns"
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
                style={{
                  minWidth: "220px",
                  padding: "12px",
                  right: 0,
                  zIndex: 10,
                }}
              >
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: "4px",
                  }}
                >
                  {cols.map((col, i) => (
                    <div
                      key={col.id}
                      role="menuitemcheckbox"
                      aria-checked={col.show}
                      tabIndex={0}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "10px",
                        cursor: "pointer",
                        padding: "6px 12px",
                        borderRadius: "4px",
                        transition: "0.2s",
                      }}
                      onMouseOver={(e) =>
                        (e.currentTarget.style.background = "#f8fafc")
                      }
                      onFocus={(e) =>
                        (e.currentTarget.style.background = "#f8fafc")
                      }
                      onMouseOut={(e) =>
                        (e.currentTarget.style.background = "transparent")
                      }
                      onBlur={(e) =>
                        (e.currentTarget.style.background = "transparent")
                      }
                      onClick={(e) => {
                        e.stopPropagation();
                        const next = [...cols];
                        next[i].show = !next[i].show;
                        setCols(next);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          e.stopPropagation();
                          const next = [...cols];
                          next[i].show = !next[i].show;
                          setCols(next);
                        }
                      }}
                    >
                      <input
                        type="checkbox"
                        className="custom-checkbox no-events"
                        checked={col.show}
                        readOnly
                        tabIndex={-1}
                      />
                      <span
                        style={{
                          fontSize: "13px",
                          color: "var(--text)",
                          fontWeight: 500,
                        }}
                      >
                        {col.label}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Export Dropdown */}
          <div className="dropdown" ref={expRef}>
            <button
              className="btn outline small"
              onClick={(e) => {
                e.stopPropagation();
                setShowExpDrop(!showExpDrop);
                setShowColDrop(false);
              }}
              title="Export"
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
                style={{
                  width: "280px",
                  padding: "16px",
                  right: 0,
                  zIndex: 10,
                }}
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
                      className={`btn small ${exportFormat === fmt ? "pri" : "outline"}`}
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
                <button className="item" onClick={() => handleExport("page")}>
                  Current Page
                </button>
                <button
                  className="item"
                  onClick={() => handleExport("filtered")}
                >
                  Filtered Data
                </button>
                <button className="item" onClick={() => handleExport("all")}>
                  All Data
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* FIXED TABLE LAYOUT */}
      <div
        className="tableWrap border-top"
        style={{
          flex: 1,
          overflowY: "auto",
          overflowX: "hidden",
          margin: "0 -32px",
          width: "calc(100% + 64px)",
          borderLeft: "none",
          borderRight: "none",
          borderRadius: 0,
        }}
      >
        <table
          style={{ tableLayout: "fixed", width: "100%", minWidth: "800px" }}
        >
          <thead className="kpi-th-sticky">
            <tr>
              <th style={{ width: "40px", textAlign: "center" }}>
                <input
                  ref={headerCheckboxRef}
                  type="checkbox"
                  className="custom-checkbox"
                  checked={allSelected}
                  onChange={() => toggleSelectAll(filteredPatches)}
                />
              </th>
              {cols
                .filter((c) => c.show)
                .map((c) => (
                  <th
                    key={c.id}
                    style={{ width: c.width, textAlign: c.align || "left" }}
                    onClick={() => handleSort(c.id)}
                    className="cursor-pointer"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleSort(c.id);
                    }}
                  >
                    {c.label}
                    {getSortIcon(c.id)}
                  </th>
                ))}
            </tr>
          </thead>
          <tbody>
            {paginatedPatches.length === 0 ? (
              <tr>
                <td
                  colSpan={cols.filter((c) => c.show).length + 1}
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
              paginatedPatches.map((p) => {
                const isSelected = !!selectedMap[getPatchKey(p)];

                return (
                  <tr
                    key={getPatchKey(p)}
                    className={
                      isSelected
                        ? "selected-row cursor-pointer"
                        : "cursor-pointer"
                    }
                    onClick={() => toggleSelect(p)}
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        toggleSelect(p);
                      }
                    }}
                  >
                    <td style={{ textAlign: "center" }}>
                      <input
                        type="checkbox"
                        className="custom-checkbox"
                        checked={isSelected}
                        onChange={() => toggleSelect(p)}
                        onClick={(e) => e.stopPropagation()}
                        tabIndex={-1}
                      />
                    </td>
                    {cols
                      .filter((c) => c.show)
                      .map((c) => (
                        <td
                          key={c.id}
                          style={{
                            textAlign: c.align || "left",
                            ...(c.truncate
                              ? {
                                  whiteSpace: "nowrap",
                                  overflow: "hidden",
                                  textOverflow: "ellipsis",
                                }
                              : {}),
                          }}
                          title={c.truncate ? p[c.id] : undefined}
                        >
                          {renderCell(
                            c.id,
                            p,
                            patchCveMap,
                            navigate,
                            openPatchDetails,
                          )}
                        </td>
                      ))}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <Paginator
        total={filteredPatches.length}
        rpp={rowsPerPage}
        setRpp={setRowsPerPage}
        page={currentPage}
        setPage={setCurrentPage}
        edgeToEdge={true}
      />

      <PatchDetailsPanel
        selectedPatch={selectedPatch}
        showPanel={showPanel}
        setShowPanel={setShowPanel}
      />
    </div>
  );
}

PatchTab.propTypes = {
  patches: PropTypes.array,
  patchLoading: PropTypes.bool,
  addBaseline: PropTypes.func.isRequired,
  baselines: PropTypes.array,
  selectedMap: PropTypes.object.isRequired,
  setSelectedMap: PropTypes.func.isRequired,
  parentFilters: PropTypes.array,
  parentLogic: PropTypes.string,
  isEditingBaseline: PropTypes.bool,
  navigate: PropTypes.func.isRequired,
};
