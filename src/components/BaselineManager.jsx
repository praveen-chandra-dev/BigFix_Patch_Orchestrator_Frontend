// src/components/BaselineManager.jsx
import { useState, useEffect, useMemo, useRef } from "react";

const API = window.env?.VITE_API_BASE || "http://localhost:5174";

function getHeaders() {
  return { "Content-Type": "application/json", "Accept": "application/json", "x-user-role": sessionStorage.getItem("user_role") || "Admin" };
}

async function getJSON(endpoint) {
  const r = await fetch(`${API}${endpoint}`, { headers: getHeaders() });
  const j = await r.json();
  if (!r.ok || j.ok === false) throw new Error(j.error || "Request failed");
  return j;
}

async function postJSON(endpoint, body) {
  const r = await fetch(`${API}${endpoint}`, { method: "POST", headers: getHeaders(), body: JSON.stringify(body) });
  const j = await r.json();
  if (!r.ok || j.ok === false) throw new Error(j.error || "Request failed");
  return j;
}

const FancySelect = ({ label, options, value, onChange, disabled, placeholder, isLoading, multiSelect }) => {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef(null);

  useEffect(() => {
    function handleClickOutside(event) { if (wrapperRef.current && !wrapperRef.current.contains(event.target)) setOpen(false); }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  let displayText = placeholder;
  let isPlaceholder = true;

  if (multiSelect) {
    if (Array.isArray(value) && value.length > 0) { isPlaceholder = false; displayText = value.length <= 2 ? value.join(", ") : `${value.length} selected`; }
  } else {
    const selectedOption = options.find((o) => o === value);
    if (selectedOption) { displayText = selectedOption; isPlaceholder = false; }
  }

  const handleOptionClick = (opt, e) => {
    if (multiSelect) {
      e.stopPropagation(); const current = Array.isArray(value) ? value : []; const newSet = new Set(current);
      if (newSet.has(opt)) newSet.delete(opt); else newSet.add(opt); onChange(Array.from(newSet));
    } else { onChange(opt); setOpen(false); }
  };

  return (
    <div className="field flex-1">
      <span className="label">{label}</span>
      {isLoading && <div className="sub label-loading-sub">Loading...</div>}
      <div className={`fx-wrap flex-1 ${open ? "fx-open" : ""} ${disabled || isLoading ? "disabled" : ""}`} ref={wrapperRef}>
        <button type="button" className="fx-trigger" onClick={() => setOpen(!open)}>
          <span className={`fx-value ${isPlaceholder ? "fx-placeholder" : ""}`} title={!isPlaceholder ? displayText : ""}>{displayText}</span>
          <span className="fx-chevron">▾</span>
        </button>

        {open && (
          <div className="fx-menu">
            <div className="fx-menu-inner">
              {options.length === 0 ? (
                <div className="fx-item fx-empty">No options</div>
              ) : (
                options.map((opt) => {
                  const isSelected = multiSelect ? (value || []).includes(opt) : value === opt;
                  return (
                    <div key={opt} className={`fx-item ${isSelected ? "fx-active" : ""}`} onClick={(e) => handleOptionClick(opt, e)}>
                      {multiSelect && <input type="checkbox" className="custom-checkbox mr-10 no-events" checked={isSelected} readOnly />}
                      <span className="fx-label">{opt}</span>
                      {!multiSelect && isSelected && <span className="fx-tick">✓</span>}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default function BaselineManager({ onClose }) {
  const [sites, setSites] = useState([]);
  const [selectedSites, setSelectedSites] = useState([]);
  const [selectedSeverities, setSelectedSeverities] = useState([]);
  const [allPatches, setAllPatches] = useState([]);
  const [loadingSites, setLoadingSites] = useState(false);
  const [loadingPatches, setLoadingPatches] = useState(false);
  const [error, setError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");
  const [selectedPatchKeys, setSelectedPatchKeys] = useState(() => new Set());
  const [targetSites, setTargetSites] = useState([]);
  const [selectedTargetSite, setSelectedTargetSite] = useState("");
  const [baselineName, setBaselineName] = useState("");
  const [creating, setCreating] = useState(false);

  const clearMessages = () => { if (error) setError(""); if (successMsg) setSuccessMsg(""); };

  useEffect(() => {
    async function init() {
      setLoadingSites(true);
      try {
        const [jSrc, jTgt] = await Promise.all([getJSON("/api/baseline/sites"), getJSON("/api/baseline/custom-sites")]);
        if (jSrc.ok) {
            let sourceSites = jSrc.sites || [];
            if (sessionStorage.getItem("user_role") === 'EUC') sourceSites = sourceSites.filter(s => s.toLowerCase().includes('windows'));
            setSites(sourceSites);
        }
        if (jTgt.ok) {
          const tSites = jTgt.sites || []; setTargetSites(tSites);
          if (tSites.length > 0) setSelectedTargetSite(tSites[0]);
        }
      } catch (e) { setError(e.message); } finally { setLoadingSites(false); }
    }
    init();
  }, []);

  useEffect(() => {
    clearMessages(); setSelectedSeverities([]); setAllPatches([]); setSelectedPatchKeys(new Set());
    if (selectedSites.length === 0) return;
    async function fetchPatches() {
      setLoadingPatches(true);
      try {
        let combined = [];
        for (const site of selectedSites) {
          const j = await getJSON(`/api/baseline/patches?site=${encodeURIComponent(site)}`);
          if (j.ok && Array.isArray(j.patches)) combined = combined.concat(j.patches.map((p) => ({ ...p, site: p.site || site, key: `${p.id}||${p.site || site}` })));
        }
        setAllPatches(combined);
      } catch (e) { setError(e.message); } finally { setLoadingPatches(false); }
    }
    fetchPatches();
  }, [selectedSites]);

  const availableSeverities = useMemo(() => { if (allPatches.length === 0) return []; return Array.from(new Set(allPatches.map((p) => p.severity || "Unspecified"))).sort(); }, [allPatches]);
  const filteredPatches = useMemo(() => { if (selectedSites.length === 0 || selectedSeverities.length === 0) return []; return allPatches.filter((p) => selectedSeverities.includes(p.severity || "Unspecified")); }, [allPatches, selectedSeverities, selectedSites]);

  const togglePatch = (key) => { clearMessages(); const next = new Set(selectedPatchKeys); if (next.has(key)) next.delete(key); else next.add(key); setSelectedPatchKeys(next); };
  const toggleAll = () => { clearMessages(); const allKeys = filteredPatches.map((p) => p.key); const allSelected = allKeys.length > 0 && allKeys.every((k) => selectedPatchKeys.has(k)); const next = new Set(selectedPatchKeys); if (allSelected) allKeys.forEach((k) => next.delete(k)); else allKeys.forEach((k) => next.add(k)); setSelectedPatchKeys(next); };

  const handleCreate = async () => {
    setError(""); setSuccessMsg(""); const localName = baselineName.trim();
    if (!localName) { setError("Please enter a Baseline Name."); return; }
    if (!selectedTargetSite) { setError("Please select a Target Site."); return; }
    if (selectedPatchKeys.size === 0) { setError("Please select at least one patch."); return; }
    setCreating(true);
    try {
      const payload = { baselineName: localName, targetSite: selectedTargetSite, patchKeys: Array.from(selectedPatchKeys) };
      const j = await postJSON("/api/baseline/create", payload);
      if (j.ok) { setSuccessMsg(`Baseline "${j.baselineName || localName}" created successfully.`); setBaselineName(""); setSelectedPatchKeys(new Set()); } 
      else { throw new Error(j.error || "Failed to create baseline"); }
    } catch (e) { setError(e.message); } finally { setCreating(false); }
  };

  const isAllSelected = filteredPatches.length > 0 && filteredPatches.every((p) => selectedPatchKeys.has(p.key));
  const isIndeterminate = filteredPatches.some((p) => selectedPatchKeys.has(p.key)) && !isAllSelected;

  return (
    <div className="mgmt">
      <div className="topbar">
        <div className="left"><h2>Create Baseline</h2></div>
        <div className="right"><button className="btn" onClick={onClose}>Close</button></div>
      </div>

      <div className="section overflow-visible">
        <div className="section-head"><span className="title">1. Filter Patches</span></div>
        <div className="controls-grid">
          <FancySelect label="Select Source Site(s)" options={sites} value={selectedSites} onChange={setSelectedSites} placeholder="— Select Site(s) —" isLoading={loadingSites} disabled={loadingSites} multiSelect={true} />
          <FancySelect label="Select Severity" options={availableSeverities} value={selectedSeverities} onChange={(v) => { setSelectedSeverities(v); clearMessages(); }} placeholder="— Select Severity —" isLoading={loadingPatches} disabled={selectedSites.length === 0} multiSelect={true} />
        </div>
      </div>

      {selectedSites.length > 0 && selectedSeverities.length > 0 && (
        <div className="section">
          <div className="section-head">
            <span className="title">2. Select Patches</span>
            <div className="section-head-right">
              <span className="pill soft">Selected: {selectedPatchKeys.size}</span>
              <span className="pill green">Total: {filteredPatches.length}</span>
            </div>
          </div>
          <div className="tableWrap h-400 border-top">
            {filteredPatches.length === 0 ? (
              <div className="sub empty-state">No patches found.</div>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th className="text-center w-40"><input type="checkbox" className="custom-checkbox" checked={isAllSelected} ref={(el) => el && (el.indeterminate = isIndeterminate)} onChange={toggleAll} /></th>
                    <th>ID</th><th>Severity</th><th>Site</th><th>Name</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredPatches.map((p) => (
                    <tr key={p.key} onClick={() => togglePatch(p.key)} className={selectedPatchKeys.has(p.key) ? "selected-row" : ""}>
                      <td className="text-center"><input type="checkbox" className="custom-checkbox no-events" checked={selectedPatchKeys.has(p.key)} readOnly /></td>
                      <td>{p.id}</td>
                      <td><span className={`rowchip ${/critical/i.test(p.severity) ? "hf" : "succ"}`}>{p.severity}</span></td>
                      <td>{p.site}</td><td>{p.name}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      <div className="p-0-20-20">
        {error && <div className="banner error">{error}</div>}
        {successMsg && <div className="banner success"><svg className="banner-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg><span>{successMsg}</span></div>}
      </div>

      {selectedPatchKeys.size > 0 && (
        <div className="section overflow-visible">
          <div className="section-head"><span className="title">3. Finalize & Create</span></div>
          <div className="controls-grid">
            <div className="field flex-1">
              <span className="label">Baseline Name</span>
              <div className="inputwrap">
                <input type="text" className="control" placeholder="e.g., Nov 2025 Security Updates" value={baselineName} onChange={(e) => { setBaselineName(e.target.value); clearMessages(); }} disabled={creating} />
              </div>
            </div>
            <div className="flex-1">
              <FancySelect label="Target Custom Site" options={targetSites} value={selectedTargetSite} onChange={(v) => { setSelectedTargetSite(v); clearMessages(); }} placeholder="— Select Target Site —" isLoading={loadingSites} disabled={creating} />
            </div>
          </div>
          <div className="action-bar">
            <div className="spacer"></div>
            <button className="btn outline small" onClick={handleCreate} disabled={creating}>{creating ? "Creating..." : "Create Baseline"}</button>
          </div>
        </div>
      )}
    </div>
  );
}