// src/modules/risk/BaselineTab.jsx
import { useState, useEffect, useRef, useMemo } from "react";
import PropTypes from "prop-types";
import api from "../../api/api";
import { useToast } from "../../components/common/CustomToast";
import { getErrorMessage } from "../../utils/errorHandler";
import InlineSpinner from "../../components/common/InlineSpinner";
import ConfirmModal from "../../components/common/ConfirmModal";

const RiskDropdown = ({
  options,
  value,
  onChange,
  width = "100%",
  disabled = false,
}) => {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const selectedOpt = options.find((o) => o.value === value);

  return (
    <div
      className={`fx-wrap ${open ? "fx-open" : ""} ${disabled ? "disabled" : ""}`}
      ref={ref}
      style={{ width, flexShrink: 0 }}
    >
      <button
        type="button"
        className="fx-trigger"
        onClick={() => !disabled && setOpen(!open)}
        disabled={disabled}
      >
        <span className="fx-value">
          {selectedOpt ? selectedOpt.label : value || "Select Option"}
        </span>
        <span className="fx-chevron">▾</span>
      </button>
      {open && (
        <div className="fx-menu">
          <div className="fx-menu-inner">
            {options.map((opt) => (
              <button
                type="button"
                key={opt.value}
                className={`fx-item ${value === opt.value ? "active" : ""}`}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  width: "100%",
                  background: "none",
                  border: "none",
                  font: "inherit",
                  cursor: "pointer",
                  textAlign: "left"
                }}
                onClick={() => {
                  onChange(opt.value);
                  setOpen(false);
                }}
              >
                <span className="fx-label">{opt.label}</span>
                {value === opt.value}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

RiskDropdown.propTypes = {
  options: PropTypes.array.isRequired,
  value: PropTypes.string,
  onChange: PropTypes.func.isRequired,
  width: PropTypes.string,
  disabled: PropTypes.bool,
};

export default function BaselineTab({
  pendingPatches = [],
  clearPendingPatches,
  setEditingBaseline,
  onGoToPatches,
  refreshTrigger,
  parentFilters = [],
  parentLogic = "AND",
}) {
  const [patches, setPatches] = useState([]);
  const [baselineName, setBaselineName] = useState("");
  const [description, setDescription] = useState("");
  const [siteType, setSiteType] = useState("Custom");
  const [selectedSite, setSelectedSite] = useState("");
  const [isExternal, setIsExternal] = useState(false);

  const [baselineList, setBaselineList] = useState([]);
  const [allSites, setAllSites] = useState([]);
  const [isMaster, setIsMaster] = useState(null);

  const [showCVE, setShowCVE] = useState(false);
  const [cveData, setCveData] = useState([]);
  const { showToast } = useToast();
  const [selectedBaselineId, setSelectedBaselineId] = useState(null);
  const selectedBaselineIdRef = useRef(selectedBaselineId);
  
  useEffect(() => {
    selectedBaselineIdRef.current = selectedBaselineId;
  }, [selectedBaselineId]);

  const [creatingBaseline, setCreatingBaseline] = useState(false);
  const [deletingBaseline, setDeletingBaseline] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [patchLookup, setPatchLookup] = useState({});

  const [baselineDetails, setBaselineDetails] = useState(null);
  const [loadingDetails, setLoadingDetails] = useState(false);

  useEffect(() => {
    if (setEditingBaseline)
      setEditingBaseline(!!selectedBaselineId && !isExternal);
  }, [selectedBaselineId, isExternal, setEditingBaseline]);

  useEffect(() => {
    if (pendingPatches.length > 0) {
      if (selectedBaselineIdRef.current || patches.length > 0) {
        setPatches((prev) => {
          const existingIds = new Set(prev.map((p) => p.patch_id));
          const newP = pendingPatches.filter(
            (p) => !existingIds.has(p.patch_id),
          );
          return [...prev, ...newP];
        });
      } else {
        setPatches(pendingPatches);
      }
      if (clearPendingPatches) clearPendingPatches();
    }
  }, [pendingPatches, clearPendingPatches, patches.length]);

  const refreshList = async () => {
    try {
      const res = await api.get("/baselines/list");
      const rawArray = Array.isArray(res.data?.baselines)
        ? res.data.baselines
        : [];
      const formatted = rawArray.map((b) => ({
        id: b.id,
        name: b.name || "Unnamed Baseline",
        siteType: String(b.siteType || "").toLowerCase(),
        siteName: b.siteName,
        componentCount: b.component_count ?? 0,
      }));
      setBaselineList(formatted);
    } catch (e) {
      console.warn("Failed to load baselines:", e.message);
      setBaselineList([]);
    }
  };

  useEffect(() => {
    refreshList();
  }, [refreshTrigger]);

  useEffect(() => {
    api
      .get("/baselines/risk-sites")
      .then((res) => {
        const data = res.data;
        const moStatus = !!data.isMaster;

        let initialSiteType = "Custom";
        if (moStatus) initialSiteType = "Master";

        let initialSelectedSite = "";
        let formattedSites = [];

        if (Array.isArray(data.sites)) {
          const validSites = data.sites.filter(
            (s) => s.type === "Custom" || s.type === "Master",
          );
          formattedSites = validSites.map((s) => ({
            value: s.name,
            label: s.displayName || s.name,
            type: s.type,
          }));

          if (!moStatus && formattedSites.length > 0) {
            const customSites = formattedSites.filter(
              (s) => s.type === "Custom",
            );
            if (customSites.length > 0)
              initialSelectedSite = customSites[0].value;
          }
        }

        setAllSites(formattedSites);
        setSiteType(initialSiteType);
        setSelectedSite(initialSelectedSite);
        setIsMaster(moStatus);
      })
      .catch(() => {
        setAllSites([]);
        setIsMaster(false);
      });
  }, [refreshTrigger]);

  const filteredSites = useMemo(() => {
    return allSites.filter((site) => site.type === siteType);
  }, [allSites, siteType]);

  useEffect(() => {
    if (
      filteredSites.length > 0 &&
      (!selectedSite || !filteredSites.some((s) => s.value === selectedSite))
    ) {
      setSelectedSite(filteredSites[0].value);
    }
  }, [filteredSites, siteType, selectedSite]);

  useEffect(() => {
    api
      .get("/patches")
      .then((res) => {
        const map = {};
        const patchData = Array.isArray(res.data)
          ? res.data
          : res.data?.data || [];
        patchData.forEach((p) => {
          const id = String(p.patch_id).replace(/^BIGFIX-/, "");
          map[id] = { name: p.patch_name, site: p.site_name };
        });
        setPatchLookup(map);
      })
      .catch((err) => {
        console.warn("Failed to load patches for lookup", err);
      });
  }, [refreshTrigger]);

  const movePatch = (index, direction) => {
    if (isExternal) return;
    const newPatches = [...patches];
    const newIndex = index + direction;
    if (newIndex < 0 || newIndex >= newPatches.length) return;
    [newPatches[index], newPatches[newIndex]] = [
      newPatches[newIndex],
      newPatches[index],
    ];
    setPatches(newPatches);
  };

  const removePatch = (index) => {
    if (isExternal) return;
    const updated = patches.filter((_, i) => i !== index);
    setPatches(updated);
  };

  const fetchCVE = async () => {
    if (!patches.length) {
      showToast("No patches selected", "error");
      return;
    }
    try {
      const payloadPatches = patches.map((p) => {
        const rawId = String(p.patch_id).replace(/^BIGFIX-/, "");
        const sName =
          p.site_name || patchLookup[rawId]?.site || selectedSite || "Unknown";
        return { patch_id: rawId, site_name: sName };
      });

      const res = await api.post("/cves/by-patches?page=1&limit=50", {
        patches: payloadPatches,
      });

      setCveData(res.data?.data || []);
      setShowCVE(true);
    } catch (err) {
      showToast(getErrorMessage(err, "Failed to fetch CVE"), "error");
    }
  };

  const clearEditor = (clearPatches = true) => {
    setBaselineDetails(null);
    setSelectedBaselineId(null);
    setBaselineName("");
    setDescription("");
    setShowCVE(false);
    setIsExternal(false);
    if (clearPatches) setPatches([]);
    if (setEditingBaseline) setEditingBaseline(false);
  };

  const createBaseline = async () => {
    if (creatingBaseline || isExternal) return;
    if (!baselineName.trim()) {
      showToast("Baseline name required", "error");
      return;
    }
    if (!patches.length) {
      showToast("No patches selected", "error");
      return;
    }
    if (siteType === "Custom" && !selectedSite) {
      showToast("Select site", "error");
      return;
    }

    try {
      setCreatingBaseline(true);
      await api.post("/baselines/create", {
        name: baselineName,
        description: description,
        siteType,
        site: selectedSite,
        patches: patches.map((p) => ({
          patch_id: String(p.patch_id).replace(/^BIGFIX-/, ""),
          patch_name: p.patch_name,
          site_name:
            p.site_name ||
            patchLookup[String(p.patch_id).replace(/^BIGFIX-/, "")]?.site,
          site_url: p.site_url,
        })),
      });

      showToast("Baseline created successfully!", "success");
      clearEditor();
      refreshList();
    } catch (err) {
      showToast(getErrorMessage(err, "Baseline creation failed"), "error");
    } finally {
      setCreatingBaseline(false);
    }
  };

  const updateBaseline = async () => {
    if (creatingBaseline || isExternal) return;
    if (!baselineName.trim()) {
      showToast("Baseline name required", "error");
      return;
    }
    if (!patches.length) {
      showToast("No patches selected", "error");
      return;
    }

    try {
      setCreatingBaseline(true);
      const b = baselineList.find((x) => x.id === selectedBaselineId);
      await api.put(
        `/baselines/${selectedBaselineId}?siteType=${b?.siteType}&siteName=${b?.siteName}`,
        {
          name: baselineName,
          description: description,
          patches: patches.map((p) => ({
            patch_id: String(p.patch_id).replace(/^BIGFIX-/, ""),
            patch_name: p.patch_name,
            site_name:
              p.site_name ||
              patchLookup[String(p.patch_id).replace(/^BIGFIX-/, "")]?.site,
            site_url: p.site_url,
          })),
        },
      );

      clearEditor();
      showToast(
        "Baseline updated successfully! It may take 10-15 seconds to reflect.",
        "success",
      );
      refreshList();
    } catch (e) {
      showToast(getErrorMessage(e, "Update failed"), "error");
    } finally {
      setCreatingBaseline(false);
    }
  };

  const fetchBaselineDetails = async (b) => {
    try {
      setLoadingDetails(true);
      setPatches([]);

      const res = await api.get(
        `/baselines/${b.id}?siteType=${b.siteType}&siteName=${b.siteName}`,
      );
      const data = res.data?.data?.[0] || res.data;

      setBaselineDetails(data);
      setSelectedBaselineId(b.id);
      setBaselineName(data.baseline_name || data.name || "");
      setDescription(data.description || "");
      setShowCVE(false);

      const extCheck = b.siteType === "external";
      setIsExternal(extCheck);

      if (b.siteType) {
        const capitalizedType =
          b.siteType.charAt(0).toUpperCase() + b.siteType.slice(1);
        setSiteType(capitalizedType);
      }
      setSelectedSite(data.site_name || b.siteName || "");

      const loadedPatches = (data.patches || data.patch_ids || []).map((p) => {
        const isObj = typeof p === "object";
        const rawId = isObj
          ? String(p.patch_id).replace(/^BIGFIX-/, "")
          : String(p).replace(/^BIGFIX-/, "");
        const info = patchLookup[rawId] || {};

        let pName =
          isObj && p.patch_name && p.patch_name !== "Unknown Patch"
            ? p.patch_name
            : info.name || "Unknown Patch";
        let sName =
          isObj && p.site_name && p.site_name !== "Unknown Site"
            ? p.site_name
            : info.site || "";
        let sUrl = isObj && p.site_url ? p.site_url : "";

        return {
          patch_id: `BIGFIX-${rawId}`,
          patch_name: pName,
          site_name: sName,
          site_url: sUrl,
        };
      });
      setPatches(loadedPatches);
    } catch (err) {
      console.warn(err);
      showToast("Failed to fetch baseline details", "error");
    } finally {
      setLoadingDetails(false);
    }
  };

  useEffect(() => {
    const unknownIds = patches
      .filter((p) => p.patch_name === "Unknown Patch")
      .map((p) => String(p.patch_id).replace(/^BIGFIX-/, ""));
    if (unknownIds.length > 0 && baselineDetails) {
      api
        .post("/baselines/resolve-names", { ids: unknownIds })
        .then((res) => {
          if (res.data?.ok && res.data.resolved) {
            const resolvedMap = {};
            res.data.resolved.forEach((r) => (resolvedMap[r.id] = r));

            setPatches((prev) =>
              prev.map((p) => {
                const cleanId = String(p.patch_id).replace(/^BIGFIX-/, "");
                if (p.patch_name === "Unknown Patch" && resolvedMap[cleanId]) {
                  return {
                    ...p,
                    patch_name: resolvedMap[cleanId].name,
                    site_name:
                      p.site_name === "Unknown Site" || !p.site_name
                        ? resolvedMap[cleanId].site
                        : p.site_name,
                  };
                }
                return p;
              }),
            );
          }
        })
        .catch((err) =>
          console.warn("Failed to resolve missing patch names", err),
        );
    }
  }, [patches, baselineDetails]);

  const deleteBaseline = () => {
    if (!selectedBaselineId || isExternal) {
      showToast("Cannot delete this baseline", "error");
      return;
    }

    setShowDeleteModal(true);
  };

  const confirmDeleteBaseline = async () => {
    try {
      setDeletingBaseline(true);

      const b = baselineList.find((x) => x.id === selectedBaselineId);

      await api.delete(
        `/baselines/${selectedBaselineId}?siteType=${b?.siteType}&siteName=${b?.siteName}`,
      );

      showToast("Baseline deleted successfully", "success");

      setShowDeleteModal(false);
      clearEditor();
      refreshList();
    } catch (err) {
      showToast(getErrorMessage(err, "Delete failed"), "error");
    } finally {
      setDeletingBaseline(false);
    }
  };
  
  const [sortConfig, setSortConfig] = useState({
    key: "name",
    direction: "asc",
  });

  const handleSort = (key) => {
    setSortConfig((prev) => ({
      key,
      direction: prev.key === key && prev.direction === "asc" ? "desc" : "asc",
    }));
  };

  const getSortIcon = (key) => {
    if (sortConfig.key !== key)
      return (
        <span style={{ opacity: 0.4, marginLeft: "4px", cursor: "pointer" }}>
          ↕
        </span>
      );
    return (
      <span style={{ marginLeft: "4px", cursor: "pointer" }}>
        {sortConfig.direction === "asc" ? "↑" : "↓"}
      </span>
    );
  };

  // S3776 Fix: Extracted from applyFilters to reduce Cognitive Complexity
  const evaluateBaselineCondition = (baseline, c) => {
    const search = String(c.value).toLowerCase();
    const field = String(baseline.name || "").toLowerCase();

    if (c.operator === "contains") return field.includes(search);
    if (c.operator === "=") return field === search;
    if (c.operator === "!=") return field !== search;

    return true;
  };

  const applyFilters = (baseline) => {
    if (!parentFilters || !parentFilters.length) return true;
    
    // S6644 Fix: Removed boolean literal logic
    let globalMatch = parentLogic !== "OR"; 
    
    for (let b of parentFilters) {
      let blockMatch = true;
      let validConds = 0;
      
      for (let c of b.conds) {
        if (!c.value) continue;
        validConds++;
        const condition = evaluateBaselineCondition(baseline, c);
        blockMatch = blockMatch && condition;
      }
      
      if (validConds > 0) {
        // S3358 Fix: Extracted nested ternary operation into positive logic
        if (parentLogic === "OR") {
          globalMatch = globalMatch || blockMatch;
        } else {
          globalMatch = globalMatch && blockMatch;
        }
      }
    }
    return globalMatch;
  };

  const filteredBaselines = useMemo(() => {
    return baselineList.filter(applyFilters);
  }, [baselineList, parentFilters, parentLogic]);

  const sortedBaselines = useMemo(() => {
    let sortable = [...filteredBaselines];
    if (sortConfig.key) {
      sortable.sort((a, b) => {
        let aVal = String(a[sortConfig.key] || "").toLowerCase();
        let bVal = String(b[sortConfig.key] || "").toLowerCase();

        if (aVal < bVal) return sortConfig.direction === "asc" ? -1 : 1;
        if (aVal > bVal) return sortConfig.direction === "asc" ? 1 : -1;
        return 0;
      });
    }
    return sortable;
  }, [filteredBaselines, sortConfig]);

  if (isMaster === null)
    return <div className="app-loading-content">Loading Permissions...</div>;

  return (
    <div
      className="baseline-tab-container"
      style={{
        display: "grid",
        gridTemplateColumns: "minmax(300px, 380px) 1fr",
        gap: "24px",
        height: "calc(100vh - 140px)",
        minHeight: "500px",
        padding: "0 0 8px 0",
      }}
    >
      {/* LEFT PANEL: BASELINE LIST */}
      <div
        className="baseline-list-panel"
        style={{
          display: "flex",
          flexDirection: "column",
          background: "var(--panel)",
          border: "1px solid var(--border)",
          borderRadius: "12px",
          overflow: "hidden",
          boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
        }}
      >
        <div
          style={{
            padding: "18px 20px",
            background: "var(--panel-2)",
            borderBottom: "1px solid var(--border)",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <span
            style={{ fontSize: "16px", fontWeight: 600, color: "var(--text)" }}
          >
            Baselines
          </span>
        </div>

        <div style={{ flex: 1, overflowY: "auto" }}>
          <table
            className="baseline-list-table"
            style={{ width: "100%", borderCollapse: "collapse" }}
          >
            <thead
              style={{
                position: "sticky",
                top: 0,
                zIndex: 1,
                background: "var(--panel-2)",
              }}
            >
              <tr>
                <th
                  onClick={() => handleSort("name")}
                  tabIndex={0}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleSort("name"); }}
                  style={{
                    cursor: "pointer",
                    padding: "12px 20px",
                    textAlign: "left",
                    fontSize: "12px",
                    fontWeight: 600,
                    color: "var(--muted)",
                    borderBottom: "1px solid var(--border)",
                  }}
                >
                  NAME {getSortIcon("name")}
                </th>
                <th
                  onClick={() => handleSort("componentCount")}
                  tabIndex={0}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleSort("componentCount"); }}
                  style={{
                    cursor: "pointer",
                    padding: "12px 20px",
                    textAlign: "center",
                    fontSize: "12px",
                    fontWeight: 600,
                    color: "var(--muted)",
                    borderBottom: "1px solid var(--border)",
                    width: "100px",
                  }}
                >
                  COMPONENTS {getSortIcon("componentCount")}
                </th>
              </tr>
            </thead>
            <tbody>
              {sortedBaselines.length === 0 ? (
                <tr>
                  <td
                    colSpan="2"
                    style={{
                      textAlign: "center",
                      padding: "40px",
                      color: "var(--muted)",
                    }}
                  >
                    No baselines found.
                  </td>
                </tr>
              ) : (
                sortedBaselines.map((b) => (
                  <tr
                    key={b.id}
                    onClick={() => fetchBaselineDetails(b)}
                    tabIndex={0}
                    onKeyDown={(e) => { if (e.key === 'Enter') fetchBaselineDetails(b); }}
                    style={{
                      cursor: "pointer",
                      borderBottom: "1px solid var(--border)",
                      background:
                        b.id === selectedBaselineId
                          ? "rgba(var(--primary-rgb), 0.08)"
                          : "transparent",
                      transition: "background 0.15s ease",
                    }}
                    onMouseEnter={(e) => {
                      if (b.id !== selectedBaselineId)
                        e.currentTarget.style.background = "var(--bg-hover)";
                    }}
                    onMouseLeave={(e) => {
                      if (b.id !== selectedBaselineId)
                        e.currentTarget.style.background = "transparent";
                    }}
                  >
                    <td
                      style={{
                        padding: "14px 20px",
                        wordBreak: "break-word",
                        fontWeight: 500,
                        color: "var(--primary)",
                      }}
                    >
                      {b.name}
                    </td>
                    <td
                      style={{
                        padding: "14px 20px",
                        textAlign: "center",
                        color: "var(--text)",
                        fontWeight: 500,
                      }}
                    >
                      {b.componentCount}
                    </td>
                    <td style={{ padding: "14px 20px" }}></td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {!isExternal && selectedBaselineId && (
          <div
            style={{
              padding: "16px 20px",
              borderTop: "1px solid var(--border)",
              background: "var(--panel-2)",
            }}
          >
            <button
              type="button"
              className="btn danger"
              onClick={deleteBaseline}
              disabled={deletingBaseline}
              style={{
                width: "100%",
                background: "transparent",
                border: "1px solid var(--danger)",
                color: "var(--danger)",
                borderRadius: "8px",
                padding: "8px 12px",
                fontWeight: 500,
                transition: "all 0.2s",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "8px",
                opacity: deletingBaseline ? 0.7 : 1,
              }}
            >
              {deletingBaseline && <InlineSpinner size={16} variant="danger" />}

              {deletingBaseline ? "Deleting Baseline..." : "Delete Baseline"}
            </button>
          </div>
        )}
      </div>

      {/* RIGHT PANEL: EDITOR */}
      <div
        className="baseline-editor-panel"
        style={{
          display: "flex",
          flexDirection: "column",
          background: "var(--panel)",
          border: "1px solid var(--border)",
          borderRadius: "12px",
          overflow: "hidden",
          boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
        }}
      >
        {loadingDetails ? (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              height: "100%",
              color: "var(--muted)",
              gap: "16px",
            }}
          >
            <div
              className="spinner"
              style={{
                width: "40px",
                height: "40px",
                border: "3px solid rgba(var(--primary-rgb), 0.2)",
                borderTopColor: "var(--primary)",
                borderRadius: "50%",
                animation: "spin 0.8s linear infinite",
              }}
            />
            <div style={{ fontSize: "15px", fontWeight: 500 }}>
              Loading Baseline Data...
            </div>
          </div>
        ) : patches.length > 0 || baselineName ? (
          <div
            style={{ display: "flex", flexDirection: "column", height: "100%" }}
          >
            {/* Editor Header */}
            <div
              style={{
                padding: "16px 24px",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                background: "var(--panel-2)",
                borderBottom: "1px solid var(--border)",
              }}
            >
              <div>
                <h3
                  style={{
                    margin: 0,
                    fontSize: "18px",
                    fontWeight: 600,
                    color: "var(--primary)",
                  }}
                >
                  {selectedBaselineId
                    ? `Editing: ${baselineDetails?.baseline_name || baselineName}`
                    : "Create New Baseline"}
                </h3>
                {selectedBaselineId && (
                  <div
                    style={{
                      fontSize: "12px",
                      color: "var(--muted)",
                      marginTop: "4px",
                    }}
                  >
                    BigFix ID: {selectedBaselineId}
                  </div>
                )}
              </div>
              <button
                className="close-btn"
                type="button"
                onClick={() => clearEditor()}
                style={{
                  background: "transparent",
                  border: "none",
                  fontSize: "20px",
                  cursor: "pointer",
                  color: "var(--muted)",
                  padding: "4px",
                  borderRadius: "4px",
                  transition: "color 0.2s",
                }}
              >
                ✕
              </button>
            </div>

            {/* Scrollable Body */}
            <div style={{ flex: 1, overflowY: "auto", padding: "24px" }}>
              {isExternal && (
                <div
                  style={{
                    padding: "12px 16px",
                    background: "#eef2ff",
                    color: "#1e40af",
                    borderRadius: "10px",
                    border: "1px solid #c7d2fe",
                    marginBottom: "24px",
                    fontSize: "13px",
                    fontWeight: 500,
                    display: "flex",
                    gap: "10px",
                    alignItems: "center",
                  }}
                >
                  <svg
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <circle cx="12" cy="12" r="10"></circle>
                    <line x1="12" y1="16" x2="12" y2="12"></line>
                    <line x1="12" y1="8" x2="12.01" y2="8"></line>
                  </svg>
                  <span>
                    This baseline belongs to an External Site. It is read-only
                    and cannot be modified or deleted.
                  </span>
                </div>
              )}

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: "24px",
                  marginBottom: "16px",
                }}
              >
                <div className="field m-0">
                  <label
                    className="label"
                    style={{
                      fontWeight: 500,
                      marginBottom: "6px",
                      display: "block",
                    }}
                  >
                    Baseline Name
                  </label>
                  <input
                    className="control"
                    value={baselineName}
                    onChange={(e) => setBaselineName(e.target.value)}
                    placeholder="Enter Baseline Name"
                    disabled={isExternal}
                    style={{
                      width: "100%",
                      padding: "10px 12px",
                      borderRadius: "8px",
                      border: "1px solid var(--border)",
                      background: isExternal ? "var(--bg)" : "var(--panel)",
                      transition: "border-color 0.2s",
                    }}
                  />
                </div>

                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: isMaster ? "1fr 1fr" : "1fr",
                    gap: "16px",
                  }}
                >
                  {isMaster && (
                    <div className="field m-0">
                      <label
                        className="label"
                        style={{
                          fontWeight: 500,
                          marginBottom: "6px",
                          display: "block",
                        }}
                      >
                        Site Type
                      </label>
                      <RiskDropdown
                        value={isExternal ? "External" : siteType}
                        disabled={!!selectedBaselineId || isExternal}
                        onChange={(val) => {
                          setSiteType(val);
                          setSelectedSite("");
                        }}
                        options={
                          isExternal
                            ? [{ value: "External", label: "External" }]
                            : [
                                { value: "Master", label: "Master" },
                                { value: "Custom", label: "Custom" },
                              ]
                        }
                      />
                    </div>
                  )}

                  {(siteType === "Custom" || !isMaster || isExternal) && (
                    <div className="field m-0">
                      <label
                        className="label"
                        style={{
                          fontWeight: 500,
                          marginBottom: "6px",
                          display: "block",
                        }}
                      >
                        Target Site
                      </label>
                      <RiskDropdown
                        value={
                          isExternal ? baselineDetails?.site_name : selectedSite
                        }
                        disabled={!!selectedBaselineId || isExternal}
                        onChange={(val) => setSelectedSite(val)}
                        options={
                          isExternal
                            ? [
                                {
                                  value: baselineDetails?.site_name,
                                  label: baselineDetails?.site_name,
                                },
                              ]
                            : [
                                { value: "", label: "Select Site" },
                                ...filteredSites,
                              ]
                        }
                      />
                    </div>
                  )}
                </div>
              </div>

              <div className="field m-0" style={{ marginBottom: "28px" }}>
                <label
                  className="label"
                  style={{
                    fontWeight: 500,
                    marginBottom: "6px",
                    display: "block",
                  }}
                >
                  Description
                </label>
                <textarea
                  className="control"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Enter Baseline Description (Optional)"
                  disabled={isExternal}
                  rows={3}
                  style={{
                    width: "100%",
                    padding: "10px 12px",
                    borderRadius: "8px",
                    border: "1px solid var(--border)",
                    background: isExternal ? "var(--bg)" : "var(--panel)",
                    transition: "border-color 0.2s",
                    resize: "vertical",
                    fontFamily: "inherit",
                    fontSize: "14px",
                  }}
                />
              </div>

              {/* PATCH ORDER */}
              <div style={{ marginBottom: "28px" }}>
                <div
                  style={{
                    fontWeight: 600,
                    color: "var(--text)",
                    marginBottom: "12px",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                  }}
                >
                  <span>Patch Order ({patches.length})</span>
                  {patches.length > 0 && onGoToPatches && !isExternal && (
                    <button
                      type="button"
                      className="btn outline small"
                      onClick={onGoToPatches}
                      style={{
                        height: "32px",
                        padding: "0 14px",
                        borderRadius: "6px",
                        fontWeight: 500,
                      }}
                    >
                      + Add Patches
                    </button>
                  )}
                </div>

                <div
                  style={{
                    border: "1px solid var(--border)",
                    borderRadius: "12px",
                    overflow: "hidden",
                    background: "var(--panel)",
                  }}
                >
                  {patches.map((p, index) => {
                    const cleanId = String(p.patch_id).replace(/^BIGFIX-/, "");
                    const patchName = p.patch_name || "Unknown Patch";

                    return (
                      <div
                        key={`${p.patch_id}-${index}`}
                        style={{
                          display: "flex",
                          alignItems: isExternal ? "flex-start" : "center",
                          padding: "14px 20px",
                          borderBottom:
                            index < patches.length - 1
                              ? "1px solid var(--border)"
                              : "none",
                          background:
                            index % 2 === 0
                              ? "transparent"
                              : "rgba(var(--bg), 0.5)",
                          transition: "background 0.15s",
                        }}
                      >
                        <div style={{ flex: 1 }}>
                          <strong
                            style={{
                              display: "block",
                              marginBottom: "6px",
                              color: "var(--primary)",
                              fontSize: "14px",
                            }}
                          >
                            {index + 1}. {cleanId}
                          </strong>
                          <div
                            style={{
                              color: "var(--muted)",
                              fontSize: "13px",
                              lineHeight: "1.4",
                            }}
                          >
                            {patchName}
                          </div>
                        </div>

                        {!isExternal && (
                          <div style={{ display: "flex", gap: "8px" }}>
                            <button
                              type="button"
                              className="btn ghost small"
                              onClick={() => movePatch(index, -1)}
                              disabled={index === 0}
                              style={{
                                padding: "0 10px",
                                height: "30px",
                                borderRadius: "6px",
                                opacity: index === 0 ? 0.4 : 1,
                                cursor: index === 0 ? "not-allowed" : "pointer",
                              }}
                            >
                              ↑
                            </button>
                            <button
                              type="button"
                              className="btn ghost small"
                              onClick={() => movePatch(index, 1)}
                              disabled={index === patches.length - 1}
                              style={{
                                padding: "0 10px",
                                height: "30px",
                                borderRadius: "6px",
                                opacity: index === patches.length - 1 ? 0.4 : 1,
                                cursor:
                                  index === patches.length - 1
                                    ? "not-allowed"
                                    : "pointer",
                              }}
                            >
                              ↓
                            </button>
                            <button
                              type="button"
                              className="btn danger small"
                              onClick={() => removePatch(index)}
                              style={{
                                padding: "0 10px",
                                height: "30px",
                                borderRadius: "6px",
                                background: "transparent",
                                border: "1px solid var(--danger)",
                                color: "var(--danger)",
                              }}
                            >
                              ✕
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* CVE SECTION */}
              {showCVE && (
                <div
                  style={{
                    marginTop: "28px",
                    border: "1px solid var(--border)",
                    borderRadius: "12px",
                    overflow: "hidden",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      padding: "14px 20px",
                      background: "var(--panel-2)",
                      borderBottom: "1px solid var(--border)",
                    }}
                  >
                    <span style={{ fontWeight: 600, color: "var(--text)" }}>
                      CVE Details ({cveData.length})
                    </span>
                    <button
                      type="button"
                      className="btn ghost small"
                      onClick={() => setShowCVE(false)}
                      style={{ padding: "4px 12px", borderRadius: "6px" }}
                    >
                      Hide
                    </button>
                  </div>

                  <div style={{ overflowX: "auto" }}>
                    <table
                      className="cve-table"
                      style={{
                        width: "100%",
                        borderCollapse: "collapse",
                        textAlign: "left",
                      }}
                    >
                      <thead style={{ background: "var(--bg)" }}>
                        <tr>
                          <th
                            style={{
                              padding: "12px 16px",
                              borderBottom: "1px solid var(--border)",
                              fontSize: "12px",
                              fontWeight: 500,
                            }}
                          >
                            CVE
                          </th>
                          <th
                            style={{
                              padding: "12px 16px",
                              borderBottom: "1px solid var(--border)",
                              fontSize: "12px",
                              fontWeight: 500,
                            }}
                          >
                            Severity
                          </th>
                          <th
                            style={{
                              padding: "12px 16px",
                              borderBottom: "1px solid var(--border)",
                              fontSize: "12px",
                              fontWeight: 500,
                            }}
                          >
                            CVSS
                          </th>
                          <th
                            style={{
                              padding: "12px 16px",
                              borderBottom: "1px solid var(--border)",
                              fontSize: "12px",
                              fontWeight: 500,
                            }}
                          >
                            EPSS
                          </th>
                          <th
                            style={{
                              padding: "12px 16px",
                              borderBottom: "1px solid var(--border)",
                              fontSize: "12px",
                              fontWeight: 500,
                            }}
                          >
                            KEV
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {cveData.length === 0 ? (
                          <tr>
                            <td
                              colSpan="5"
                              style={{
                                textAlign: "center",
                                padding: "24px",
                                color: "var(--muted)",
                              }}
                            >
                              No CVE mappings found for these patches.
                            </td>
                          </tr>
                        ) : (
                          cveData.map((cve) => {
                            const severityClass =
                              cve.cvss_severity?.toLowerCase() || "low";
                            return (
                              <tr
                                key={cve.cve_id}
                                style={{
                                  borderBottom: "1px solid var(--border)",
                                }}
                              >
                                <td
                                  style={{
                                    padding: "12px 16px",
                                    fontWeight: 500,
                                  }}
                                >
                                  {cve.cve_id}
                                </td>
                                <td style={{ padding: "12px 16px" }}>
                                  <span
                                    className={`severity-badge severity-${severityClass}`}
                                    style={{
                                      padding: "4px 10px",
                                      borderRadius: "20px",
                                      fontSize: "11px",
                                      fontWeight: 500,
                                      background:
                                        severityClass === "critical"
                                          ? "#ffebee"
                                          : severityClass === "high"
                                            ? "#fff3e0"
                                            : "#e8f5e9",
                                      color:
                                        severityClass === "critical"
                                          ? "#c62828"
                                          : severityClass === "high"
                                            ? "#ed6c02"
                                            : "#2e7d32",
                                    }}
                                  >
                                    {cve.cvss_severity}
                                  </span>
                                </td>
                                <td style={{ padding: "12px 16px" }}>
                                  {cve.cvss_base_score}
                                </td>
                                <td style={{ padding: "12px 16px" }}>
                                  {cve.epss_score}
                                </td>
                                <td style={{ padding: "12px 16px" }}>
                                  <span
                                    style={{
                                      padding: "4px 10px",
                                      borderRadius: "20px",
                                      fontSize: "11px",
                                      fontWeight: 500,
                                      background: cve.is_kev
                                        ? "#ffebee"
                                        : "#e8f5e9",
                                      color: cve.is_kev ? "#c62828" : "#2e7d32",
                                    }}
                                  >
                                    {cve.is_kev ? "Yes" : "No"}
                                  </span>
                                </td>
                              </tr>
                            );
                          })
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>

            {/* Sticky Editor Footer */}
            <div
              style={{
                padding: "16px 24px",
                borderTop: "1px solid var(--border)",
                background: "var(--panel-2)",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: "16px",
              }}
            >
              {!isExternal && (
                <button
                  type="button"
                  className="btn pri"
                  onClick={selectedBaselineId ? updateBaseline : createBaseline}
                  disabled={creatingBaseline}
                  style={{
                    padding: "8px 24px",
                    borderRadius: "8px",
                    fontWeight: 600,
                    background: "var(--primary)",
                    color: "white",
                    border: "none",
                    transition: "all 0.2s",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: "8px",
                  }}
                >
                  {creatingBaseline && (
                    <InlineSpinner size={16} variant="light" />
                  )}

                  {creatingBaseline
                    ? selectedBaselineId
                      ? "Updating Baseline..."
                      : "Creating Baseline..."
                    : selectedBaselineId
                      ? "Update Baseline"
                      : "Create Baseline"}
                </button>
              )}
            </div>
          </div>
        ) : (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              height: "100%",
              color: "var(--muted)",
              textAlign: "center",
              padding: "40px",
            }}
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              width="56"
              height="56"
              style={{ marginBottom: "16px", opacity: 0.4 }}
            >
              <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
            </svg>
            <div style={{ fontSize: "16px", fontWeight: 500 }}>
              Select a Baseline to Edit
            </div>
            <div style={{ fontSize: "13px", marginTop: "8px" }}>
              Or go to the Patches tab and select patches to create a new one.
            </div>
          </div>
        )}
      </div>
      <ConfirmModal
        open={showDeleteModal}
        title="Delete Baseline"
        message={
          <>
            <div style={{ marginBottom: "6px" }}>
              Are you sure you want to delete this baseline?
            </div>
            <div style={{ color: "#dc2626", fontSize: "13px" }}>
              This action cannot be undone.
            </div>
          </>
        }
        confirmText="Delete"
        cancelText="Cancel"
        loading={deletingBaseline}
        onConfirm={confirmDeleteBaseline}
        onCancel={() => setShowDeleteModal(false)}
      />
    </div>
  );
}

BaselineTab.propTypes = {
  pendingPatches: PropTypes.array,
  clearPendingPatches: PropTypes.func,
  setEditingBaseline: PropTypes.func,
  onGoToPatches: PropTypes.func,
  refreshTrigger: PropTypes.number,
  parentFilters: PropTypes.array,
  parentLogic: PropTypes.string,
};