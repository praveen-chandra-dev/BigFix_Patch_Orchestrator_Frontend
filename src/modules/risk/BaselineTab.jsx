// src/modules/risk/BaselineTab.jsx
import { useState, useEffect, useRef, useMemo } from "react";
import api from "../../api/api";

const RiskDropdown = ({ options, value, onChange, width = "160px", disabled = false }) => {
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

export default function BaselineTab({ pendingPatches = [], clearPendingPatches, setEditingBaseline, onGoToPatches }) {
  const [patches, setPatches] = useState([]);
  const [baselineName, setBaselineName] = useState("");
  const [siteType, setSiteType] = useState("Custom");
  const [selectedSite, setSelectedSite] = useState("");

  const [baselineList, setBaselineList] = useState([]);
  const [allSites, setAllSites] = useState([]);
  const [isMaster, setIsMaster] = useState(null); 

  const [showCVE, setShowCVE] = useState(false);
  const [cveData, setCveData] = useState([]);

  const [selectedBaselineId, setSelectedBaselineId] = useState(null);
  const selectedBaselineIdRef = useRef(selectedBaselineId);
  useEffect(() => { selectedBaselineIdRef.current = selectedBaselineId; }, [selectedBaselineId]);

  const [creatingBaseline, setCreatingBaseline] = useState(false);
  const [patchLookup, setPatchLookup] = useState({});

  const [baselineDetails, setBaselineDetails] = useState(null);

  // Sync editing state with RiskModule to change the PatchTab button dynamically
  useEffect(() => {
     if (setEditingBaseline) setEditingBaseline(!!selectedBaselineId);
  }, [selectedBaselineId, setEditingBaseline]);

  // APPEND OR OVERWRITE PATCHES FROM PARENT
  useEffect(() => {
    if (pendingPatches.length > 0) {
      if (selectedBaselineIdRef.current || patches.length > 0) {
         setPatches(prev => {
             const existingIds = new Set(prev.map(p => p.patch_id));
             const newP = pendingPatches.filter(p => !existingIds.has(p.patch_id));
             return [...prev, ...newP];
         });
      } else {
         setPatches(pendingPatches);
      }
      if (clearPendingPatches) clearPendingPatches(); // Clear after consuming to prevent loops
    }
  }, [pendingPatches, clearPendingPatches, patches.length]);

  const refreshList = async () => {
    try {
      const res = await api.get("/baselines/list");
      const rawArray = Array.isArray(res.data?.baselines) ? res.data.baselines : [];
      const formatted = rawArray.map((b) => ({
        id: b.id, 
        name: b.name || "Unnamed Baseline",
        siteType: b.siteType,
        siteName: b.siteName,
        status: "READY",
      }));
      setBaselineList(formatted);
    } catch (e) {
      console.warn("Failed to load baselines:", e.message);
      setBaselineList([]);
    }
  };

  useEffect(() => {
    refreshList();
  }, []);

  useEffect(() => {
    api.get("/baselines/risk-sites").then((res) => {
        const data = res.data;
        const moStatus = !!data.isMaster;
        
        let initialSiteType = "Custom";
        if (moStatus) initialSiteType = "Master";
        
        let initialSelectedSite = "";
        let formattedSites = [];

        if (Array.isArray(data.sites)) {
          const validSites = data.sites.filter(s => s.type === "Custom" || s.type === "Master");
          formattedSites = validSites.map(s => ({ value: s.name, label: s.displayName || s.name, type: s.type }));
          
          if (!moStatus && formattedSites.length > 0) {
              const customSites = formattedSites.filter(s => s.type === "Custom");
              if (customSites.length > 0) initialSelectedSite = customSites[0].value;
          }
        }
        
        setAllSites(formattedSites);
        setSiteType(initialSiteType);
        setSelectedSite(initialSelectedSite);
        setIsMaster(moStatus);
    }).catch(() => {
        setAllSites([]);
        setIsMaster(false);
    });
  }, []);

  const filteredSites = useMemo(() => {
     return allSites.filter(site => site.type === siteType);
  }, [allSites, siteType]);

  useEffect(() => {
      if (filteredSites.length > 0 && (!selectedSite || !filteredSites.some(s => s.value === selectedSite))) {
          setSelectedSite(filteredSites[0].value);
      }
  }, [filteredSites, siteType, selectedSite]);

  useEffect(() => {
    api.get("/patches")
      .then((res) => {
        const map = {};
        const patchData = Array.isArray(res.data) ? res.data : (res.data?.data || []);
        patchData.forEach((p) => {
          const id = String(p.patch_id).replace(/^BIGFIX-/, "");
          map[id] = { name: p.patch_name, site: p.site_name };
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
    [newPatches[index], newPatches[newIndex]] = [newPatches[newIndex], newPatches[index]];
    setPatches(newPatches);
  };

  const removePatch = (index) => {
    const updated = patches.filter((_, i) => i !== index);
    setPatches(updated);
  };

  const fetchCVE = async () => {
    if (!patches.length) {
      alert("No patches selected"); return;
    }
    try {
      const payloadPatches = patches.map((p) => {
          const rawId = String(p.patch_id).replace(/^BIGFIX-/, "");
          const sName = p.site_name || patchLookup[rawId]?.site || selectedSite || "Unknown";
          return { patch_id: rawId, site_name: sName };
      });

      const res = await api.post("/cves/by-patches?page=1&limit=50", {
        patches: payloadPatches,
      });

      setCveData(res.data?.data || []);
      setShowCVE(true);
    } catch (err) {
      alert(err.response?.data?.error || "Failed to fetch CVE");
    }
  };

  const clearEditor = (clearPatches = true) => {
    setBaselineDetails(null);
    setSelectedBaselineId(null);
    setBaselineName("");
    setShowCVE(false);
    if (clearPatches) setPatches([]);
    if (setEditingBaseline) setEditingBaseline(false);
  };

  const createBaseline = async () => {
    if (creatingBaseline) return;
    if (!baselineName.trim()) { alert("Baseline name required"); return; }
    if (!patches.length) { alert("No patches selected"); return; }
    if (siteType === "Custom" && !selectedSite) { alert("Select site"); return; }
    
    try {
      setCreatingBaseline(true);
      await api.post("/baselines/create", {
        name: baselineName,
        siteType,
        site: selectedSite,
        patches: patches.map((p) => ({
          patch_id: String(p.patch_id).replace(/^BIGFIX-/, ""),
          site_name: p.site_name || patchLookup[String(p.patch_id).replace(/^BIGFIX-/, "")]?.site,
        })),
      });

      alert("Baseline created successfully");
      clearEditor();
      refreshList();
    } catch (err) {
      alert(err.response?.data?.error || err.response?.data?.details || "Baseline creation failed");
    } finally {
      setCreatingBaseline(false);
    }
  };

  const updateBaseline = async () => {
    if (creatingBaseline) return;
    if (!baselineName.trim()) { alert("Baseline name required"); return; }
    if (!patches.length) { alert("No patches selected"); return; }
    
    try {
        setCreatingBaseline(true);
        const b = baselineList.find(x => x.id === selectedBaselineId);
        await api.put(`/baselines/${selectedBaselineId}?siteType=${b?.siteType}&siteName=${b?.siteName}`, {
            name: baselineName,
            patches: patches.map((p) => ({
                patch_id: String(p.patch_id).replace(/^BIGFIX-/, ""),
                site_name: p.site_name || patchLookup[String(p.patch_id).replace(/^BIGFIX-/, "")]?.site,
            }))
        });
        alert("Baseline updated successfully");
        clearEditor();
        refreshList();
    } catch (e) {
        alert(e.response?.data?.error || e.response?.data?.details || "Update failed");
    } finally {
        setCreatingBaseline(false);
    }
  };

  const fetchBaselineDetails = async (b) => {
    try {
      const res = await api.get(`/baselines/${b.id}?siteType=${b.siteType}&siteName=${b.siteName}`);
      const data = res.data?.data?.[0] || res.data;
      
      setBaselineDetails(data);
      setSelectedBaselineId(b.id);
      setBaselineName(data.baseline_name || data.name || "");
      setShowCVE(false);
      
      const loadedPatches = (data.patches || data.patch_ids || []).map(p => {
          const isObj = typeof p === 'object';
          const rawId = isObj ? String(p.patch_id).replace(/^BIGFIX-/, "") : String(p).replace(/^BIGFIX-/, "");
          const info = patchLookup[rawId] || {};
          
          let pName = isObj && p.patch_name ? p.patch_name : "Unknown Patch";
          if (pName === "Unknown Patch" && info.name) pName = info.name;

          let sName = isObj && p.site_name ? p.site_name : "";
          if ((!sName || sName === "Unknown Site") && info.site) sName = info.site;
          
          return {
              patch_id: `BIGFIX-${rawId}`,
              patch_name: pName,
              site_name: sName
          };
      });
      setPatches(loadedPatches);

    } catch (err) {
      console.error(err);
      alert("Failed to fetch baseline details");
    }
  };

  const deleteBaseline = async () => {
    if (!selectedBaselineId) { alert("Select a baseline first"); return; }
    if (!window.confirm("Are you sure you want to permanently delete this baseline from BigFix?")) return;
    try {
      const b = baselineList.find(x => x.id === selectedBaselineId);
      await api.delete(`/baselines/${selectedBaselineId}?siteType=${b?.siteType}&siteName=${b?.siteName}`);
      alert("Baseline deleted successfully");
      clearEditor();
      refreshList();
    } catch (err) {
      alert("Delete failed: " + (err.response?.data?.error || err.response?.data?.details || err.message));
    }
  };

  if (isMaster === null) return <div className="app-loading-content">Loading Permissions...</div>;

  return (
    <div className="baseline-layout" style={{ height: 'calc(100vh - 140px)', minHeight: 0 }}>
      {/* LEFT PANEL */}
      <div className="baseline-sidebar" style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
        <div className="baseline-sidebar-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
            <span>Baselines</span>
        </div>

        <div style={{ flex: 1, overflowY: "auto", minHeight: 0 }}>
            <table className="baseline-list-table">
              <thead style={{ position: 'sticky', top: 0, zIndex: 1, background: 'var(--panel-2)' }}>
                <tr>
                  <th>Name</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {baselineList.map((b) => (
                  <tr
                    key={b.id}
                    onClick={() => fetchBaselineDetails(b)}
                    className={b.id === selectedBaselineId ? "baseline-row-selected" : ""}
                  >
                    <td style={{ wordBreak: 'break-word', fontWeight: 500, color: 'var(--primary)' }}>{b.name}</td>
                    <td><span className="status-approved">{b.status}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
        </div>

        <div className="baseline-sidebar-actions" style={{ padding: "16px", borderTop: "1px solid var(--border)", flexShrink: 0 }}>
          <button
            className="btn danger"
            disabled={!selectedBaselineId}
            onClick={deleteBaseline}
            style={{ width: "100%", background: 'transparent', border: '1px solid var(--danger)', color: 'var(--danger)' }}
          >
            Delete Baseline
          </button>
        </div>
      </div>

      {/* RIGHT PANEL */}
      <div className="baseline-editor" style={{ display: 'flex', flexDirection: 'column', height: '100%', overflowY: 'auto' }}>
        {patches.length > 0 || baselineName ? (
          <div>
            {baselineDetails && (
                <div style={{ marginBottom: "20px", display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--panel-2)', padding: '12px 16px', borderRadius: '8px', border: '1px solid var(--border)' }}>
                    <div>
                        <h3 style={{ margin: 0, fontSize: "16px", color: "var(--primary)" }}>Editing: {baselineDetails.baseline_name}</h3>
                        <div style={{ fontSize: '12px', color: 'var(--muted)', marginTop: '4px' }}>BigFix ID: {baselineDetails.bigfix_baseline_id}</div>
                    </div>
                    <button className="close-btn" onClick={() => clearEditor()}>✕</button>
                </div>
            )}

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

              {isMaster && (
                  <div className="baseline-field">
                    <label>Site Type</label>
                    <RiskDropdown
                      width="100%"
                      value={siteType}
                      disabled={!!selectedBaselineId} 
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
              )}

              {(siteType === "Custom" || !isMaster) && (
                <div className="baseline-field">
                  <label>Target Site</label>
                  <RiskDropdown
                    width="100%"
                    value={selectedSite}
                    disabled={!!selectedBaselineId} 
                    onChange={(val) => setSelectedSite(val)}
                    options={[
                      { value: "", label: "Select Site" },
                      ...filteredSites
                    ]}
                  />
                </div>
              )}
            </div>

            {/* PATCH ORDER */}
            <div className="patch-order-section">
              <div className="section-title" style={{ fontWeight: 600, color: "var(--text)", marginBottom: "8px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span>Patch Order</span>
                {patches.length > 0 && onGoToPatches && (
                    <button className="btn outline small" onClick={onGoToPatches} style={{ height: "26px", padding: "0 10px" }}>
                       + Add Patches
                    </button>
                )}
              </div>

              <div className="patch-order-container">
                {patches.map((p, index) => {
                  const cleanId = String(p.patch_id).replace(/^BIGFIX-/, "");
                  const patchName = p.patch_name || "Unknown Patch";
                  
                  return (
                      <div key={`${p.patch_id}-${index}`} className="patch-order-item">
                        <div>
                          <strong style={{ display: "block", marginBottom: "4px", color: "var(--primary)" }}>
                            {index + 1}. {cleanId}
                          </strong>
                          <div className="patch-order-name" style={{ color: "var(--muted)", fontSize: "13px" }}>
                            {patchName}
                          </div>
                        </div>

                        <div style={{ display: "flex", gap: "6px" }}>
                          <button className="btn ghost small" style={{ padding: "0 8px", height: "28px" }} onClick={() => movePatch(index, -1)}>↑</button>
                          <button className="btn ghost small" style={{ padding: "0 8px", height: "28px" }} onClick={() => movePatch(index, 1)}>↓</button>
                          <button className="btn danger small" style={{ padding: "0 8px", height: "28px" }} onClick={() => removePatch(index)}>✕</button>
                        </div>
                      </div>
                  );
                })}
              </div>
            </div>

            {/* CVE 
            <div className="baseline-cve-section">
              {!showCVE && <button className="btn pri" onClick={fetchCVE}>View CVE Details</button>}

              {showCVE && (
                <>
                  <div className="cve-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
                    <span className="section-title" style={{ fontWeight: 600, color: "var(--text)" }}>CVE Details ({cveData.length})</span>
                    <button className="btn ghost" onClick={() => setShowCVE(false)}>Hide</button>
                  </div>

                  <div className="cve-table-container">
                    <table className="cve-table">
                      <thead>
                        <tr><th>CVE</th><th>Severity</th><th>CVSS</th><th>EPSS</th><th>KEV</th></tr>
                      </thead>
                      <tbody>
                        {cveData.length === 0 ? (
                           <tr><td colSpan="5" style={{ textAlign: "center", padding: "20px", color: "var(--muted)" }}>No CVE mappings found for these patches.</td></tr>
                        ) : cveData.map((cve) => {
                          const severityClass = cve.cvss_severity?.toLowerCase() || "low";
                          return (
                            <tr key={cve.cve_id}>
                              <td className="cve-id-cell">{cve.cve_id}</td>
                              <td><span className={`severity-badge severity-${severityClass}`}>{cve.cvss_severity}</span></td>
                              <td>{cve.cvss_base_score}</td>
                              <td>{cve.epss_score}</td>
                              <td><span className={cve.is_kev ? "kev-yes-badge" : "kev-no-badge"}>{cve.is_kev ? "Yes" : "No"}</span></td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </div>
            ACTIONS */ }

            <div className="baseline-actions" style={{ marginTop: "24px", paddingTop: "16px", borderTop: "1px solid var(--border)", display: "flex", justifyContent: "flex-end" }}>
              <button
                className="btn pri"
                onClick={selectedBaselineId ? updateBaseline : createBaseline}
                disabled={creatingBaseline}
              >
                {creatingBaseline ? "Saving..." : selectedBaselineId ? "Update Baseline" : "Create Baseline"}
              </button>
            </div>
          </div>
        ) : (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--muted)' }}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="48" height="48" style={{ marginBottom: '16px', opacity: 0.5 }}><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
                <div style={{ fontSize: '16px', fontWeight: 500 }}>Select a Baseline to Edit</div>
                <div style={{ fontSize: '13px', marginTop: '8px' }}>Or go to the Patches tab and select patches to create a new one.</div>
            </div>
        )}
      </div>
    </div>
  );
}