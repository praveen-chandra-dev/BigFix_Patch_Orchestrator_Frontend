// src/modules/risk/BaselineTab.jsx
import { useState, useEffect, useRef, useMemo } from "react";
import api from "../../api/api";

const RiskDropdown = ({ options, value, onChange, width = "100%", disabled = false }) => {
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
  const [isExternal, setIsExternal] = useState(false); 

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
  const [loadingDetails, setLoadingDetails] = useState(false); // ADDED STATE FOR LOADER

  useEffect(() => {
     if (setEditingBaseline) setEditingBaseline(!!selectedBaselineId && !isExternal);
  }, [selectedBaselineId, isExternal, setEditingBaseline]);

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
      if (clearPendingPatches) clearPendingPatches(); 
    }
  }, [pendingPatches, clearPendingPatches, patches.length]);

  const refreshList = async () => {
    try {
      const res = await api.get("/baselines/list");
      const rawArray = Array.isArray(res.data?.baselines) ? res.data.baselines : [];
      const formatted = rawArray.map((b) => ({
        id: b.id, 
        name: b.name || "Unnamed Baseline",
        siteType: String(b.siteType || "").toLowerCase(),
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
    if (isExternal) return;
    const newPatches = [...patches];
    const newIndex = index + direction;
    if (newIndex < 0 || newIndex >= newPatches.length) return;
    [newPatches[index], newPatches[newIndex]] = [newPatches[newIndex], newPatches[index]];
    setPatches(newPatches);
  };

  const removePatch = (index) => {
    if (isExternal) return;
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
    setIsExternal(false);
    if (clearPatches) setPatches([]);
    if (setEditingBaseline) setEditingBaseline(false);
  };

  const createBaseline = async () => {
    if (creatingBaseline || isExternal) return;
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
          patch_name: p.patch_name,
          site_name: p.site_name || patchLookup[String(p.patch_id).replace(/^BIGFIX-/, "")]?.site,
          site_url: p.site_url 
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
    if (creatingBaseline || isExternal) return;
    if (!baselineName.trim()) { alert("Baseline name required"); return; }
    if (!patches.length) { alert("No patches selected"); return; }
    
    try {
        setCreatingBaseline(true);
        const b = baselineList.find(x => x.id === selectedBaselineId);
        await api.put(`/baselines/${selectedBaselineId}?siteType=${b?.siteType}&siteName=${b?.siteName}`, {
            name: baselineName,
            patches: patches.map((p) => ({
                patch_id: String(p.patch_id).replace(/^BIGFIX-/, ""),
                patch_name: p.patch_name,
                site_name: p.site_name || patchLookup[String(p.patch_id).replace(/^BIGFIX-/, "")]?.site,
                site_url: p.site_url 
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
      setLoadingDetails(true); // START LOADING SPINNER
      const res = await api.get(`/baselines/${b.id}?siteType=${b.siteType}&siteName=${b.siteName}`);
      const data = res.data?.data?.[0] || res.data;
      
      setBaselineDetails(data);
      setSelectedBaselineId(b.id);
      setBaselineName(data.baseline_name || data.name || "");
      setShowCVE(false);
      
      const extCheck = b.siteType === 'external';
      setIsExternal(extCheck);
      
      const loadedPatches = (data.patches || data.patch_ids || []).map(p => {
          const isObj = typeof p === 'object';
          const rawId = isObj ? String(p.patch_id).replace(/^BIGFIX-/, "") : String(p).replace(/^BIGFIX-/, "");
          const info = patchLookup[rawId] || {};
          
          let pName = isObj && p.patch_name && p.patch_name !== "Unknown Patch" ? p.patch_name : (info.name || "Unknown Patch");
          let sName = isObj && p.site_name && p.site_name !== "Unknown Site" ? p.site_name : (info.site || "");
          let sUrl = isObj && p.site_url ? p.site_url : "";
          
          return {
              patch_id: `BIGFIX-${rawId}`,
              patch_name: pName,
              site_name: sName,
              site_url: sUrl 
          };
      });
      setPatches(loadedPatches);

    } catch (err) {
      console.error(err);
      alert("Failed to fetch baseline details");
    } finally {
      setLoadingDetails(false); // STOP LOADING SPINNER
    }
  };

  // BACKGROUND RESOLVER FOR MISSING NAMES
  useEffect(() => {
      const unknownIds = patches.filter(p => p.patch_name === "Unknown Patch").map(p => String(p.patch_id).replace(/^BIGFIX-/, ""));
      if (unknownIds.length > 0 && baselineDetails) {
          api.post("/baselines/resolve-names", { ids: unknownIds })
             .then(res => {
                 if (res.data?.ok && res.data.resolved) {
                     const resolvedMap = {};
                     res.data.resolved.forEach(r => resolvedMap[r.id] = r);
                     
                     setPatches(prev => prev.map(p => {
                         const cleanId = String(p.patch_id).replace(/^BIGFIX-/, "");
                         if (p.patch_name === "Unknown Patch" && resolvedMap[cleanId]) {
                             return {
                                 ...p,
                                 patch_name: resolvedMap[cleanId].name,
                                 site_name: p.site_name === "Unknown Site" || !p.site_name ? resolvedMap[cleanId].site : p.site_name
                             };
                         }
                         return p;
                     }));
                 }
             })
             .catch(err => console.warn("Failed to resolve missing patch names", err));
      }
  }, [patches, baselineDetails]);

  const deleteBaseline = async () => {
    if (!selectedBaselineId || isExternal) { alert("Cannot delete this baseline"); return; }
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
    // NEW GRID LAYOUT: Fixes visual overlapping and provides robust responsive structure
    <div style={{ display: 'grid', gridTemplateColumns: '340px 1fr', gap: '20px', height: 'calc(100vh - 140px)', minHeight: '500px' }}>
      
      {/* LEFT PANEL: BASELINE LIST */}
      <div style={{ display: 'flex', flexDirection: 'column', background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: '8px', overflow: 'hidden' }}>
        <div style={{ padding: '16px', background: 'var(--panel-2)', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text)' }}>Baselines</span>
            <button className="btn outline small" style={{ height: '28px', padding: '0 12px' }} onClick={() => clearEditor()}>+ New</button>
        </div>

        <div style={{ flex: 1, overflowY: "auto" }}>
            <table className="baseline-list-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead style={{ position: 'sticky', top: 0, zIndex: 1, background: 'var(--panel-2)' }}>
                <tr>
                  <th style={{ padding: '10px 16px', textAlign: 'left', fontSize: '12px', color: 'var(--muted)', borderBottom: '1px solid var(--border)' }}>NAME</th>
                  <th style={{ padding: '10px 16px', textAlign: 'left', fontSize: '12px', color: 'var(--muted)', borderBottom: '1px solid var(--border)', width: '80px' }}>STATUS</th>
                </tr>
              </thead>
              <tbody>
                {baselineList.map((b) => (
                  <tr
                    key={b.id}
                    onClick={() => fetchBaselineDetails(b)}
                    style={{ cursor: 'pointer', borderBottom: '1px solid var(--border)', background: b.id === selectedBaselineId ? 'var(--bg)' : 'transparent' }}
                  >
                    <td style={{ padding: '12px 16px', wordBreak: 'break-word', fontWeight: 500, color: 'var(--primary)' }}>{b.name}</td>
                    <td style={{ padding: '12px 16px' }}><span className="pill green text-10">READY</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
        </div>

        {!isExternal && selectedBaselineId && (
            <div style={{ padding: "16px", borderTop: "1px solid var(--border)", background: 'var(--panel-2)' }}>
              <button
                className="btn danger"
                onClick={deleteBaseline}
                style={{ width: "100%", background: 'transparent', border: '1px solid var(--danger)', color: 'var(--danger)' }}
              >
                Delete Baseline
              </button>
            </div>
        )}
      </div>

      {/* RIGHT PANEL: EDITOR */}
      <div style={{ display: 'flex', flexDirection: 'column', background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: '8px', overflow: 'hidden' }}>
        
        {loadingDetails ? (
           // LOADING SPINNER ADDED HERE
           <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--muted)' }}>
               <svg className="spinner" viewBox="0 0 50 50" style={{ width: 40, height: 40, stroke: 'var(--primary)', marginBottom: '16px' }}><circle cx="25" cy="25" r="20" fill="none" strokeWidth="5"></circle></svg>
               <div style={{ fontSize: '15px', fontWeight: 500 }}>Loading Baseline Data...</div>
           </div>
        ) : patches.length > 0 || baselineName ? (
          <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
            
            {/* Editor Header */}
            <div style={{ padding: "16px 24px", display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--panel-2)', borderBottom: '1px solid var(--border)' }}>
                <div>
                    <h3 style={{ margin: 0, fontSize: "16px", color: "var(--primary)" }}>{selectedBaselineId ? `Editing: ${baselineDetails?.baseline_name || baselineName}` : "Create New Baseline"}</h3>
                    {selectedBaselineId && <div style={{ fontSize: '12px', color: 'var(--muted)', marginTop: '4px' }}>BigFix ID: {selectedBaselineId}</div>}
                </div>
                <button className="close-btn" onClick={() => clearEditor()}>✕</button>
            </div>

            {/* Scrollable Body */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '24px' }}>
                {isExternal && (
                    <div style={{ padding: '12px', background: '#e0f2fe', color: '#0369a1', borderRadius: '8px', border: '1px solid #bae6fd', marginBottom: '24px', fontSize: '13px', fontWeight: 500, display: 'flex', gap: '8px', alignItems: 'center' }}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>
                        This baseline belongs to an External Site. It is read-only and cannot be modified or deleted.
                    </div>
                )}

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '24px' }}>
                  <div className="field m-0">
                    <label className="label">Baseline Name</label>
                    <input
                      className="control"
                      value={baselineName}
                      onChange={(e) => setBaselineName(e.target.value)}
                      placeholder="Enter Baseline Name"
                      disabled={isExternal}
                    />
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: isMaster ? '1fr 1fr' : '1fr', gap: '16px' }}>
                      {isMaster && (
                          <div className="field m-0">
                            <label className="label">Site Type</label>
                            <RiskDropdown
                              value={isExternal ? "External" : siteType}
                              disabled={!!selectedBaselineId || isExternal} 
                              onChange={(val) => {
                                setSiteType(val);
                                setSelectedSite(""); 
                              }}
                              options={isExternal ? [{value:"External", label:"External"}] : [{ value: "Master", label: "Master" }, { value: "Custom", label: "Custom" }]}
                            />
                          </div>
                      )}

                      {(siteType === "Custom" || !isMaster || isExternal) && (
                        <div className="field m-0">
                          <label className="label">Target Site</label>
                          <RiskDropdown
                            value={isExternal ? baselineDetails?.site_name : selectedSite}
                            disabled={!!selectedBaselineId || isExternal} 
                            onChange={(val) => setSelectedSite(val)}
                            options={isExternal ? [{value: baselineDetails?.site_name, label: baselineDetails?.site_name}] : [{ value: "", label: "Select Site" }, ...filteredSites]}
                          />
                        </div>
                      )}
                  </div>
                </div>

                {/* PATCH ORDER */}
                <div style={{ marginBottom: "24px" }}>
                  <div style={{ fontWeight: 600, color: "var(--text)", marginBottom: "12px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span>Patch Order ({patches.length})</span>
                    {patches.length > 0 && onGoToPatches && !isExternal && (
                        <button className="btn outline small" onClick={onGoToPatches} style={{ height: "26px", padding: "0 10px" }}>
                           + Add Patches
                        </button>
                    )}
                  </div>

                  <div style={{ border: '1px solid var(--border)', borderRadius: '8px', overflow: 'hidden' }}>
                    {patches.map((p, index) => {
                      const cleanId = String(p.patch_id).replace(/^BIGFIX-/, "");
                      const patchName = p.patch_name || "Unknown Patch";
                      
                      return (
                          <div key={`${p.patch_id}-${index}`} style={{ display: 'flex', alignItems: isExternal ? 'flex-start' : 'center', padding: '12px 16px', borderBottom: index < patches.length - 1 ? '1px solid var(--border)' : 'none', background: index % 2 === 0 ? 'transparent' : 'var(--bg)' }}>
                            <div style={{ flex: 1 }}>
                              <strong style={{ display: "block", marginBottom: "4px", color: "var(--primary)" }}>
                                {index + 1}. {cleanId}
                              </strong>
                              <div style={{ color: "var(--muted)", fontSize: "13px" }}>
                                {patchName}
                              </div>
                            </div>

                            {!isExternal && (
                                <div style={{ display: "flex", gap: "6px" }}>
                                  <button className="btn ghost small" style={{ padding: "0 8px", height: "28px" }} onClick={() => movePatch(index, -1)}>↑</button>
                                  <button className="btn ghost small" style={{ padding: "0 8px", height: "28px" }} onClick={() => movePatch(index, 1)}>↓</button>
                                  <button className="btn danger small" style={{ padding: "0 8px", height: "28px" }} onClick={() => removePatch(index)}>✕</button>
                                </div>
                            )}
                          </div>
                      );
                    })}
                  </div>
                </div>

                {/* CVE SECTION */}
                {showCVE && (
                  <div style={{ marginTop: '24px', border: '1px solid var(--border)', borderRadius: '8px', overflow: 'hidden' }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 16px", background: 'var(--panel-2)', borderBottom: '1px solid var(--border)' }}>
                      <span style={{ fontWeight: 600, color: "var(--text)" }}>CVE Details ({cveData.length})</span>
                      <button className="btn ghost small" onClick={() => setShowCVE(false)}>Hide</button>
                    </div>

                    <div style={{ overflowX: 'auto' }}>
                      <table className="cve-table" style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                        <thead style={{ background: 'var(--bg)' }}>
                          <tr>
                              <th style={{ padding: '10px 16px', borderBottom: '1px solid var(--border)' }}>CVE</th>
                              <th style={{ padding: '10px 16px', borderBottom: '1px solid var(--border)' }}>Severity</th>
                              <th style={{ padding: '10px 16px', borderBottom: '1px solid var(--border)' }}>CVSS</th>
                              <th style={{ padding: '10px 16px', borderBottom: '1px solid var(--border)' }}>EPSS</th>
                              <th style={{ padding: '10px 16px', borderBottom: '1px solid var(--border)' }}>KEV</th>
                          </tr>
                        </thead>
                        <tbody>
                          {cveData.length === 0 ? (
                             <tr><td colSpan="5" style={{ textAlign: "center", padding: "20px", color: "var(--muted)" }}>No CVE mappings found for these patches.</td></tr>
                          ) : cveData.map((cve) => {
                            const severityClass = cve.cvss_severity?.toLowerCase() || "low";
                            return (
                              <tr key={cve.cve_id} style={{ borderBottom: '1px solid var(--border)' }}>
                                <td style={{ padding: '10px 16px', fontWeight: 500 }}>{cve.cve_id}</td>
                                <td style={{ padding: '10px 16px' }}><span className={`severity-badge severity-${severityClass}`}>{cve.cvss_severity}</span></td>
                                <td style={{ padding: '10px 16px' }}>{cve.cvss_base_score}</td>
                                <td style={{ padding: '10px 16px' }}>{cve.epss_score}</td>
                                <td style={{ padding: '10px 16px' }}><span className={cve.is_kev ? "kev-yes-badge" : "kev-no-badge"}>{cve.is_kev ? "Yes" : "No"}</span></td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
            </div>

            {/* Sticky Editor Footer */}
            <div style={{ padding: "16px 24px", borderTop: "1px solid var(--border)", background: 'var(--panel-2)', display: "flex", justifyContent: "space-between", alignItems: 'center' }}>
              <button className="btn outline" onClick={fetchCVE} disabled={showCVE}>View CVE Details</button>
              
              {!isExternal && (
                  <button
                    className="btn pri"
                    onClick={selectedBaselineId ? updateBaseline : createBaseline}
                    disabled={creatingBaseline}
                  >
                    {creatingBaseline ? "Saving..." : selectedBaselineId ? "Update Baseline" : "Create Baseline"}
                  </button>
              )}
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