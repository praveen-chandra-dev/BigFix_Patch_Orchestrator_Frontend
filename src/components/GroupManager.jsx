// src/components/GroupManager.jsx
import { useState, useEffect, useRef, useMemo, useCallback } from "react";

const API = window.env.VITE_API_BASE;

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
    document.addEventListener("mousedown", handleClickOutside); return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  let displayText = placeholder; let isPlaceholder = true;
  if (multiSelect) {
    if (Array.isArray(value) && value.length > 0) { isPlaceholder = false; displayText = value.length <= 2 ? value.join(", ") : `${value.length} selected`; }
  } else {
    const selectedOption = options.find(o => o === value);
    if (selectedOption) { displayText = selectedOption; isPlaceholder = false; }
  }

  const handleOptionClick = (opt, e) => {
    if (multiSelect) { e.stopPropagation(); const current = Array.isArray(value) ? value : []; const newSet = new Set(current); if (newSet.has(opt)) newSet.delete(opt); else newSet.add(opt); onChange(Array.from(newSet)); } 
    else { onChange(opt); setOpen(false); }
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
              {options.length === 0 ? ( <div className="fx-item fx-empty">No options</div> ) : (
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

export default function GroupManager({ onClose }) {
  const [groupType, setGroupType] = useState("Automatic");
  const [groupName, setGroupName] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  const [properties, setProperties] = useState([]);
  const [selectedProperty, setSelectedProperty] = useState("");
  const [operators] = useState(["Contains", "Equals", "Starts With"]);
  const [selectedOperator, setSelectedOperator] = useState("Contains");
  const [valueInput, setValueInput] = useState("");
  const [conditions, setConditions] = useState([]); 
  const [loadingProps, setLoadingProps] = useState(false);
  
  const [customSites, setCustomSites] = useState([]);
  const [selectedTargetSite, setSelectedTargetSite] = useState("");
  const [loadingSites, setLoadingSites] = useState(false);

  const [allComputers, setAllComputers] = useState([]);
  const [osList, setOsList] = useState([]); 
  const [selectedOSs, setSelectedOSs] = useState([]); 
  const [selectedCompIds, setSelectedCompIds] = useState(new Set()); 
  
  const [compPage, setCompPage] = useState(1);
  const [compSearch, setCompSearch] = useState("");
  const [hasMoreComp, setHasMoreComp] = useState(true);
  const [fetchingComp, setFetchingComp] = useState(false);

  useEffect(() => { setError(""); setSuccessMsg(""); }, []);
  const clearMessages = () => { if (error) setError(""); if (successMsg) setSuccessMsg(""); };

  useEffect(() => {
    clearMessages();
    if (groupType === "Automatic") {
      if (properties.length === 0) {
        setLoadingProps(true);
        getJSON("/api/groups/metadata/properties").then(data => setProperties(data.properties || [])).catch(e => setError(e.message)).finally(() => setLoadingProps(false));
      }
      if (customSites.length === 0) {
        setLoadingSites(true);
        getJSON("/api/baseline/custom-sites").then(data => { const sites = data.sites || []; setCustomSites(sites); if (sites.length > 0) setSelectedTargetSite(sites[0]); }).catch(e => console.error(e)).finally(() => setLoadingSites(false));
      }
    }
  }, [groupType]);

  useEffect(() => {
    if (groupType === "Manual") fetchComputers();
    else { setAllComputers([]); setCompPage(1); }
  }, [groupType, compPage, compSearch]);

  const fetchComputers = async () => {
    if (fetchingComp) return;
    setFetchingComp(true);
    try {
      const url = `/api/groups/metadata/computers?page=${compPage}&limit=20&search=${encodeURIComponent(compSearch)}`;
      const data = await getJSON(url);
      if (data.ok) {
        const newComps = data.computers || [];
        if (compPage === 1) {
          setAllComputers(newComps);
          setOsList(Array.from(new Set(newComps.map(c => c.os).filter(o => o && o !== "Unknown"))).sort());
        } else {
          setAllComputers(prev => { const existingIds = new Set(prev.map(c => c.id)); const unique = newComps.filter(c => !existingIds.has(c.id)); return [...prev, ...unique]; });
          setOsList(prev => { const next = new Set(prev); newComps.forEach(c => { if(c.os && c.os !== "Unknown") next.add(c.os); }); return Array.from(next).sort(); });
        }
        setHasMoreComp(compPage < data.totalPages);
      }
    } catch (e) { setError(e.message); } finally { setFetchingComp(false); }
  };

  const observer = useRef();
  const lastCompRef = useCallback(node => {
    if (fetchingComp) return;
    if (observer.current) observer.current.disconnect();
    observer.current = new IntersectionObserver(entries => { if (entries[0].isIntersecting && hasMoreComp) setCompPage(prev => prev + 1); });
    if (node) observer.current.observe(node);
  }, [fetchingComp, hasMoreComp]);

  const visibleComputers = useMemo(() => {
    let list = allComputers;
    if (sessionStorage.getItem("user_role") === 'EUC') list = list.filter(c => !(c.os || "").toLowerCase().includes("server"));
    if (selectedOSs.length > 0) list = list.filter(c => selectedOSs.includes(c.os));
    return list;
  }, [allComputers, selectedOSs]);

  const addCondition = () => {
    clearMessages(); setError("");
    if (!selectedProperty || !valueInput.trim()) { setError("Please select a property and enter a value."); return; }
    setConditions([...conditions, { id: Date.now(), property: selectedProperty, operator: selectedOperator, value: valueInput }]);
    setValueInput(""); 
  };

  const removeCondition = (id) => { clearMessages(); setConditions(conditions.filter(c => c.id !== id)); };

  const toggleComputer = (id) => { clearMessages(); const next = new Set(selectedCompIds); if (next.has(id)) next.delete(id); else next.add(id); setSelectedCompIds(next); };

  const toggleAllVisible = () => { clearMessages(); const next = new Set(selectedCompIds); const allVisibleIds = visibleComputers.map(c => c.id); const allSelected = allVisibleIds.length > 0 && allVisibleIds.every(id => next.has(id)); if (allSelected) allVisibleIds.forEach(id => next.delete(id)); else allVisibleIds.forEach(id => next.add(id)); setSelectedCompIds(next); };

  const handleCreate = async () => {
    setError(""); setSuccessMsg("");
    if (!groupName.trim()) { setError("Group Name is required."); return; }
    const payload = { name: groupName, type: groupType };

    if (groupType === "Automatic") {
      if (conditions.length === 0) { setError("Please add at least one condition."); return; }
      if (!selectedTargetSite) { setError("Please select a target site."); return; }
      payload.targetSite = selectedTargetSite; payload.conditions = conditions;
    } else {
      if (selectedCompIds.size === 0) { setError("Please select at least one computer."); return; }
      payload.computerIds = Array.from(selectedCompIds);
    }

    setCreating(true);
    try {
      await postJSON("/api/groups/create", payload);
      setSuccessMsg(`${groupType} Group "${groupName}" created successfully!`);
      setGroupName(""); setConditions([]); setSelectedCompIds(new Set()); setSelectedOSs([]); setCompSearch(""); setCompPage(1);
    } catch (e) { setError(e.message); } finally { setCreating(false); }
  };

  return (
    <div className="mgmt">
      <div className="topbar">
        <div className="left"><h2>Create Computer Group</h2></div>
        <div className="right"><button className="btn" onClick={onClose}>Close</button></div>
      </div>

      <div className="section overflow-visible">
        <div className="section-head"><span className="title">1. Group Settings</span></div>
        <div className="controls-grid">
          <div className="field min-w-200">
            <span className="label">Group Type</span>
            <div className="toggle-bg">
              <button className={`toggle-btn ${groupType === "Automatic" ? "active" : ""}`} onClick={() => setGroupType("Automatic")}>Automatic</button>
              <button className={`toggle-btn ${groupType === "Manual" ? "active" : ""}`} onClick={() => setGroupType("Manual")}>Manual</button>
            </div>
          </div>
          <div className="field">
            <span className="label">Group Name</span>
            <div className="inputwrap">
              <input type="text" className="control" placeholder="e.g., Windows 10 Patch Group" value={groupName} onChange={(e) => { setGroupName(e.target.value); clearMessages(); }} disabled={creating} />
            </div>
          </div>
        </div>
      </div>

      {groupType === "Automatic" && (
        <div className="section overflow-visible">
          <div className="section-head"><span className="title">2. Define Property Criteria</span></div>
          <div className="flex-row items-end p-20 gap-16 wrap">
            <div className="flex-1 min-w-200"><FancySelect label="Property" options={properties} value={selectedProperty} onChange={setSelectedProperty} placeholder="— Select Property —" isLoading={loadingProps} /></div>
            <div style={{ flex: 0.7, minWidth: 140 }}><FancySelect label="Comparison" options={operators} value={selectedOperator} onChange={setSelectedOperator} placeholder="Contains" /></div>
            <div className="field flex-1 min-w-200">
              <span className="label">Search Text</span>
              <div className="inputwrap">
                <input type="text" className="control" placeholder="e.g., rhel" value={valueInput} onChange={(e) => setValueInput(e.target.value)} />
              </div>
            </div>
            <div className="pb-0"><button className="btn outline small" style={{ height: '40px' }} onClick={addCondition}>Add</button></div>
          </div>
          <div className="flex-row p-0-20-20">
             <div className="flex-1"><FancySelect label="Target Site (Custom)" options={customSites} value={selectedTargetSite} onChange={setSelectedTargetSite} placeholder="— Select Target Site —" isLoading={loadingSites} /></div>
          </div>
          {conditions.length > 0 && (
            <div className="tableWrap border-top">
              <table>
                <thead><tr><th>Property</th><th>Comparison</th><th>Value</th><th>Target Site</th><th className="right">Action</th></tr></thead>
                <tbody>{conditions.map(c => <tr key={c.id}><td><b>{c.property}</b></td><td><span className="rowchip succ">{c.operator}</span></td><td>{c.value}</td><td className="muted-text">{selectedTargetSite || "—"}</td><td className="right"><button className="btn-icon-sm" onClick={() => removeCondition(c.id)}>✕</button></td></tr>)}</tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {groupType === "Manual" && (
        <div className="section overflow-visible">
          <div className="section-head"><span className="title">2. Select Computers</span></div>
          <div className="flex-row items-end p-0-20-10 gap-16 wrap" style={{ paddingTop: 20 }}>
            <div className="field flex-1">
              <span className="label">Search Computers</span>
              <div className="inputwrap">
                <input type="text" className="control" placeholder="Search by Name or IP..." value={compSearch} onChange={e => { setCompSearch(e.target.value); setCompPage(1); setAllComputers([]); }} />
              </div>
            </div>
            <div className="flex-1"><FancySelect label="Filter Loaded OS" options={osList} value={selectedOSs} onChange={setSelectedOSs} placeholder="— Show All —" multiSelect={true} /></div>
          </div>
          <div className="flex-row de-header-row p-0-20-10">
              <span className="sub">Loaded: {allComputers.length} {hasMoreComp ? "(Scroll for more)" : "(All loaded)"}</span>
              <span className="pill green">Selected: {selectedCompIds.size}</span>
          </div>
          <div className="tableWrap h-400 border-top">
            <table>
                <thead><tr><th className="text-center w-40"><input type="checkbox" className="custom-checkbox" onChange={toggleAllVisible} checked={visibleComputers.length > 0 && visibleComputers.every(c => selectedCompIds.has(c.id))} /></th><th>Computer Name</th><th>Operating System</th><th>IP Address</th></tr></thead>
                <tbody>
                  {visibleComputers.map((c, index) => {
                    const isLast = index === visibleComputers.length - 1;
                    return (
                      <tr key={c.id} ref={isLast ? lastCompRef : null} onClick={() => toggleComputer(c.id)} className={selectedCompIds.has(c.id) ? "selected-row" : ""}>
                        <td className="text-center"><input type="checkbox" className="custom-checkbox no-events" checked={selectedCompIds.has(c.id)} readOnly /></td>
                        <td>{c.name}</td><td>{c.os}</td><td className="muted-text">{c.ips?.[0] || "-"}</td>
                      </tr>
                    );
                  })}
                  {fetchingComp && <tr><td colSpan={4} className="empty-state">Loading more...</td></tr>}
                  {!fetchingComp && visibleComputers.length === 0 && <tr><td colSpan={4} className="empty-state">No computers found.</td></tr>}
                </tbody>
              </table>
          </div>
        </div>
      )}

      <div className="p-0-20-10">
        {error && <div className="banner error">{error}</div>}
        {successMsg && <div className="banner success"><svg className="banner-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg><span>{successMsg}</span></div>}
      </div>

      <div className="action-bar">
        <div className="spacer"></div>
        <button className="btn outline small" onClick={handleCreate} disabled={creating || !groupName || (groupType==='Automatic' && !conditions.length) || (groupType==='Manual' && !selectedCompIds.size)}>
          {creating ? "Creating..." : "Create Group"}
        </button>
      </div>
    </div>
  );
}