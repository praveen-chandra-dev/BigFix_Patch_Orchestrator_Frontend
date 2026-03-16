import { useState, useEffect, useRef } from "react";
import api from "../../api/api";

const RiskDropdown = ({ options, value, onChange, width = "160px" }) => {
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
      className={`fx-wrap ${open ? "fx-open" : ""}`}
      ref={ref}
      style={{ width, flexShrink: 0 }}
    >
      <button
        type="button"
        className="fx-trigger"
        onClick={() => setOpen(!open)}
      >
        <span className="fx-value">
          {selectedOpt ? selectedOpt.label : value}
        </span>
        <span className="fx-chevron">▾</span>
      </button>
      {open && (
        <div className="fx-menu">
          <div className="fx-menu-inner">
            {options.map((opt) => (
              <div
                key={opt.value}
                className={`fx-item ${value === opt.value ? "active" : ""}`}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
                onClick={() => {
                  onChange(opt.value);
                  setOpen(false);
                }}
              >
                <span className="fx-label">{opt.label}</span>
                {value === opt.value}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default function BaselineTab({ baselines = [], pendingPatches = [] }) {
  const [patches, setPatches] = useState([]);
  const [baselineName, setBaselineName] = useState("");
  const [siteType, setSiteType] = useState("Master");
  const [selectedSite, setSelectedSite] = useState("");

  const [baselineList, setBaselineList] = useState([]);
  const [allSites, setAllSites] = useState([]);

  const [showCVE, setShowCVE] = useState(false);
  const [cveData, setCveData] = useState([]);

  const [selectedBaselineId, setSelectedBaselineId] = useState(null);
  const [creatingBaseline, setCreatingBaseline] = useState(false);
  const [patchLookup, setPatchLookup] = useState({});

  const filteredSites = Array.isArray(allSites)
    ? allSites.filter((site) => site.type === siteType)
    : [];

  const [baselineDetails, setBaselineDetails] = useState(null);

  useEffect(() => {
    if (pendingPatches.length) {
      setPatches(pendingPatches);
    }
  }, [pendingPatches]);

  useEffect(() => {
    api
      .get("/baselines")
      .then((res) => {
        const data = res.data;
        const formatted = (data.data || []).map((b) => ({
          id: b.id,
          name: b.baseline_name,
          status: b.status.toUpperCase(),
          patches: b.patch_ids.map((id) => ({
            patch_id: `BIGFIX-${id}`,

          })),
        }));
        setBaselineList(formatted);
      })
      .catch(() => alert("Failed to load baselines"));
  }, []);

  useEffect(() => {
    api
      .get("/sites")
      .then((res) => {
        const data = res.data;
        if (Array.isArray(data)) {
          setAllSites(data);
        } else if (data && Array.isArray(data.data)) {
          setAllSites(data.data);
        } else {
          setAllSites([]); 
        }
      })
      .catch((err) => {
        console.error("Failed to load sites:", err);
        setAllSites([]);
      });
  }, []);

  useEffect(() => {
    api
      .get("/patches")
      .then((res) => {
        const map = {};
        (res.data || []).forEach((p) => {
          const id = String(p.patch_id).replace(/^BIGFIX-/, "");
          map[id] = p.patch_name;
        });
        setPatchLookup(map);
      })
      .catch((err) => {
        console.error("Failed to load patches for lookup", err);
      });
  }, []);

  const movePatch = (index, direction) => {
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
    const updated = patches.filter((_, i) => i !== index);
    setPatches(updated);
  };

  const fetchCVE = async () => {
    if (!patches.length) {
      alert("No patches selected");
      return;
    }
    try {
      const res = await api.post("/cves/by-patches?page=1&limit=50", {
        patches: patches.map((p) => ({
          patch_id: p.patch_id,
          site_name: p.site_name,
        })),
      });

      setCveData(res.data?.data || []);
      setShowCVE(true);
    } catch (err) {
      console.error(err);
      alert(err.response?.data?.error || "Failed to fetch CVE");
    }
  };

  const createBaseline = async () => {
    if (creatingBaseline) return;
    if (!baselineName.trim()) {
      alert("Baseline name required");
      return;
    }
    if (!patches.length) {
      alert("No patches selected");
      return;
    }
    if (siteType === "Custom" && !selectedSite) {
      alert("Select site");
      return;
    }
    try {
      setCreatingBaseline(true);
      await api.post("/baselines/create", {
        name: baselineName,
        siteType,
        site: selectedSite,
        patches: patches.map((p) => ({
          patch_id: p.patch_id,
          site_name: p.site_name,
        })),
      });

      alert("Baseline created successfully");
      setBaselineName("");
      setPatches([]);

      const res = await api.get("/baselines");
      const formatted = (res.data?.data || []).map((b) => ({
        id: b.id,
        name: b.baseline_name,
        status: b.status.toUpperCase(),
        patches: b.patch_ids.map((id) => ({
          patch_id: `BIGFIX-${id}`,
        })),
      }));
      setBaselineList(formatted);
    } catch (err) {
      console.error(err);
      alert(err.response?.data?.error || "Baseline creation failed");
    } finally {
      setCreatingBaseline(false);
    }
  };

  const fetchBaselineDetails = async (id) => {
    try {
      const res = await api.get(`/baselines/${id}`);
      setBaselineDetails(res.data?.data?.[0]);
      setSelectedBaselineId(id);
    } catch (err) {
      console.error(err);
      alert("Failed to fetch baseline details");
    }
  };

  const deleteBaseline = async () => {
    if (!selectedBaselineId) {
      alert("Select a baseline first");
      return;
    }
    if (!window.confirm("Delete this baseline?")) return;
    try {
      await api.delete(`/baselines/${selectedBaselineId}`);
      setBaselineDetails(null);
      setSelectedBaselineId(null);
      const updated = baselineList.filter((b) => b.id !== selectedBaselineId);
      setBaselineList(updated);
    } catch (err) {
      console.error(err);
      alert("Delete failed");
    }
  };

  return (
    <div className="baseline-layout">
      {/* LEFT PANEL */}
      <div className="baseline-sidebar">
        <div className="baseline-sidebar-header">Baselines</div>

        <table className="baseline-list-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Patches</th>
              <th>Status</th>
            </tr>
          </thead>

          <tbody>
            {baselineList.map((b) => (
              <tr
                key={b.id}
                onClick={() => fetchBaselineDetails(b.id)}
                className={
                  b.id === selectedBaselineId ? "baseline-row-selected" : ""
                }
              >
                <td>{b.name}</td>
                <td>{b.patches?.length || 0}</td>
                <td>
                  <span
                    className={
                      b.status === "APPROVED"
                        ? "status-approved"
                        : "status-draft"
                    }
                  >
                    {b.status}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <div
          className="baseline-sidebar-actions"
          style={{
            padding: "16px",
            marginTop: "auto",
            borderTop: "1px solid var(--border)",
          }}
        >
          <button
            className="btn danger"
            disabled={!selectedBaselineId}
            onClick={deleteBaseline}
            style={{ width: "100%" }}
          >
            Delete Baseline
          </button>
        </div>
      </div>

      {/* RIGHT PANEL */}
      <div className="baseline-editor">
        {baselineDetails && (
          <div className="baseline-details" style={{ marginBottom: "24px" }}>
            <div className="baseline-details-header">
              <h3 style={{ margin: 0, fontSize: "18px", color: "var(--text)" }}>
                {baselineDetails.baseline_name}
              </h3>
              <button
                className="close-btn"
                onClick={() => setBaselineDetails(null)}
              >
                ✕
              </button>
            </div>

            <p
              style={{
                margin: "4px 0",
                color: "var(--muted)",
                fontSize: "14px",
              }}
            >
              BigFix ID: {baselineDetails.bigfix_baseline_id}
            </p>
            <p
              style={{
                margin: "4px 0",
                color: "var(--muted)",
                fontSize: "14px",
              }}
            >
              Patches: {baselineDetails.patch_ids.length}
            </p>

            <div
              className="patch-order-container"
              style={{ marginTop: "12px" }}
            >
              {baselineDetails.patch_ids.map((p, i) => {
                const patchName = patchLookup[p] || "Unknown Patch";
                return (
                  <div key={p} className="patch-order-item">
                    <strong
                      style={{ display: "block", color: "var(--primary)" }}
                    >
                      {i + 1}. {p}
                    </strong>
                    <div style={{ fontSize: "13px", color: "var(--muted)" }}>
                      {patchName}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {patches.length > 0 && (
          <div>
            <div className="baseline-config">
              <div className="baseline-field">
                <label>Baseline Name</label>
                <input
                  className="control"
                  value={baselineName}
                  onChange={(e) => setBaselineName(e.target.value)}
                  placeholder="Enter Baseline Name"
                />
              </div>

              <div className="baseline-field">
                <label>Site Type</label>
                <RiskDropdown
                  width="100%"
                  value={siteType}
                  onChange={(val) => {
                    setSiteType(val);
                    setSelectedSite(""); 
                  }}
                  options={[
                    { value: "Master", label: "Master" },
                    { value: "Custom", label: "Custom" },
                  ]}
                />
              </div>

              {siteType === "Custom" && (
                <div className="baseline-field">
                  <label>Site</label>
                  <RiskDropdown
                    width="100%"
                    value={selectedSite}
                    onChange={(val) => setSelectedSite(val)}
                    options={[
                      { value: "", label: "Select Site" },
                      ...filteredSites.map((site) => ({
                        value: site.name,
                        label: site.name,
                      })),
                    ]}
                  />
                </div>
              )}
            </div>

            {/* PATCH ORDER */}
            <div className="patch-order-section">
              <div
                className="section-title"
                style={{
                  fontWeight: 600,
                  color: "var(--text)",
                  marginBottom: "8px",
                }}
              >
                Patch Order
              </div>

              <div className="patch-order-container">
                {patches.map((p, index) => (
                  <div key={p.patch_id} className="patch-order-item">
                    <div>
                      <strong
                        style={{
                          display: "block",
                          marginBottom: "4px",
                          color: "var(--primary)",
                        }}
                      >
                        {index + 1}. {String(p.patch_id).replace(/^BIGFIX-/, "")}
                      </strong>
                      <div
                        className="patch-order-name"
                        style={{ color: "var(--muted)", fontSize: "13px" }}
                      >
                        {p.patch_name}
                      </div>
                    </div>

                    <div style={{ display: "flex", gap: "6px" }}>
                      <button
                        className="btn ghost small"
                        style={{ padding: "0 8px", height: "28px" }}
                        onClick={() => movePatch(index, -1)}
                      >
                        ↑
                      </button>
                      <button
                        className="btn ghost small"
                        style={{ padding: "0 8px", height: "28px" }}
                        onClick={() => movePatch(index, 1)}
                      >
                        ↓
                      </button>
                      <button
                        className="btn danger small"
                        style={{ padding: "0 8px", height: "28px" }}
                        onClick={() => removePatch(index)}
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* CVE */}
            <div className="baseline-cve-section">
              {!showCVE && (
                <button className="btn pri" onClick={fetchCVE}>
                  View CVE Details
                </button>
              )}

              {showCVE && (
                <>
                  <div
                    className="cve-header"
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      marginBottom: "12px",
                    }}
                  >
                    <span
                      className="section-title"
                      style={{ fontWeight: 600, color: "var(--text)" }}
                    >
                      CVE Details ({cveData.length})
                    </span>
                    <button
                      className="btn ghost"
                      onClick={() => setShowCVE(false)}
                    >
                      Hide
                    </button>
                  </div>

                  <div className="cve-table-container">
                    <table className="cve-table">
                      <thead>
                        <tr>
                          <th>CVE</th>
                          <th>Severity</th>
                          <th>CVSS</th>
                          <th>EPSS</th>
                          <th>KEV</th>
                        </tr>
                      </thead>
                      <tbody>
                        {cveData.map((cve) => {
                          const severityClass =
                            cve.cvss_severity?.toLowerCase() || "low";
                          return (
                            <tr key={cve.cve_id}>
                              <td className="cve-id-cell">{cve.cve_id}</td>
                              <td>
                                <span
                                  className={`severity-badge severity-${severityClass}`}
                                >
                                  {cve.cvss_severity}
                                </span>
                              </td>
                              <td>{cve.cvss_base_score}</td>
                              <td>{cve.epss_score}</td>
                              <td>
                                <span
                                  className={
                                    cve.is_kev
                                      ? "kev-yes-badge"
                                      : "kev-no-badge"
                                  }
                                >
                                  {cve.is_kev ? "Yes" : "No"}
                                </span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </div>

            <div
              className="baseline-actions"
              style={{
                marginTop: "24px",
                paddingTop: "16px",
                borderTop: "1px solid var(--border)",
                display: "flex",
                justifyContent: "flex-end",
              }}
            >
              <button
                className="btn pri"
                onClick={createBaseline}
                disabled={creatingBaseline}
              >
                {creatingBaseline ? "Creating Baseline..." : "Create Baseline"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}