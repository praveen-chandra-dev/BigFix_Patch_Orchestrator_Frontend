// src/components/RoleManagement.jsx
import { useState, useEffect, useMemo, useRef } from "react";
import FancySelect from "./common/FancySelect";
import Paginator from "./common/Paginator";
import { useToast } from "./common/CustomToast";
import InlineSpinner from "./common/InlineSpinner";

const API = window.env?.VITE_API_BASE || "http://localhost:5174";

const CustomModal = ({ open, title, message, onConfirm, onCancel, confirmText = "OK", cancelText = "Cancel", hideCancel = false, busy = false }) => {
    if (!open) return null;
    return (
        <div className="modal show" role="dialog" aria-modal="true" style={{ zIndex: 9999 }}>
            <div className="box max-w-520" onClick={e => e.stopPropagation()}>
                <h3 className="kpi-modal-title" style={{ color: 'var(--primary)', marginBottom: '12px' }}>{title}</h3>
                <div className="sub kpi-confirm-sub" style={{ fontSize: '14px', lineHeight: '1.5', color: 'var(--text)' }}>{message}</div>
                <div className="flex-row justify-end gap-8 mt-20">
                    {!hideCancel && <button type="button" className="btn outline" onClick={onCancel} disabled={busy}>{cancelText}</button>}
                    <button type="button" className="btn pri flex-row items-center gap-8" onClick={onConfirm} disabled={busy}>
                        {busy ? <InlineSpinner size={16} variant="light" /> : confirmText}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default function RoleManagement({ onClose, role, username }) {
  const { showToast } = useToast();

  const apiFetch = async (endpoint, options = {}) => {
      const headers = { "Content-Type": "application/json", "x-user-role": role || "Admin", "x-active-user": username || "" };
      const res = await fetch(`${API}${endpoint}`, { ...options, headers });
      const text = await res.text();
      let json;
      try { json = JSON.parse(text); } catch (e) {
          if (text.trim().startsWith('<')) throw new Error(`API Endpoint not found (${endpoint}). Did you restart the backend server?`);
          throw new Error(`Invalid response from ${endpoint}: ${text.substring(0, 50)}...`);
      }
      if (!res.ok || !json.ok) throw new Error(json.error || "API Error");
      return json;
  };

  const safeFetch = async (url, fallback) => {
      try { return await apiFetch(url); } catch (e) { console.warn(`[SafeFetch] ${url} failed:`, e.message); return fallback; }
  };

  const [roles, setRoles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState("LIST"); 
  const [activeTab, setActiveTab] = useState("LIST");
  const [editingRoleId, setEditingRoleId] = useState(null); 
  const [dataLoaded, setDataLoaded] = useState(false);
  const [modalConfig, setModalConfig] = useState({ open: false, title: "", message: "", onConfirm: null, onCancel: null, hideCancel: false });

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [perms, setPerms] = useState({
      masterOperator: "0", showOtherActions: "0", stopOtherActions: "0",
      canCreateActions: "1", canLock: "0", canSendRefresh: "1", canSubmitQueries: "1",
      customContent: "1", unmanagedAssets: "ShowNone", postActionBehavior: "AllowRestartOnly", 
      actionScriptCommands: "AllowRestartOnly", useConsole: "true", useWebUI: "false", useRESTAPI: "true"
  });

  const handlePermChange = (key, val) => { setPerms(prev => ({ ...prev, [key]: val })); };

  const [totalComps, setTotalComps] = useState(0);
  const [properties, setProperties] = useState([]);
  const [patchSetuGroups, setPatchSetuGroups] = useState([]);
  const [expandedNodes, setExpandedNodes] = useState(new Set(["ROOT", "RETRIEVED"]));
  const [propertyValues, setPropertyValues] = useState({});
  const [loadingStates, setLoadingStates] = useState({});
  const [selectedComputers, setSelectedComputers] = useState([]); 

  const [availableSites, setAvailableSites] = useState([]);
  const [selectedSites, setSelectedSites] = useState([]);
  const [availSiteSearch, setAvailSiteSearch] = useState("");
  const [availSitePage, setAvailSitePage] = useState(1);
  const [availSiteRpp, setAvailSiteRpp] = useState(10);
  const [availSiteSort, setAvailSiteSort] = useState({ key: 'name', direction: 'asc' });
  const [selSiteSearch, setSelSiteSearch] = useState("");
  const [selSitePage, setSelSitePage] = useState(1);
  const [selSiteRpp, setSelSiteRpp] = useState(10);
  const [selSiteSort, setSelSiteSort] = useState({ key: 'name', direction: 'asc' });

  const [patchSetuUsers, setPatchSetuUsers] = useState([]);
  const [selectedOperators, setSelectedOperators] = useState([]);
  const [operatorWarnings, setOperatorWarnings] = useState({});
  const [availOpSearch, setAvailOpSearch] = useState("");
  const [availOpPage, setAvailOpPage] = useState(1);
  const [availOpRpp, setAvailOpRpp] = useState(10);
  const [selOpSearch, setSelOpSearch] = useState("");
  const [selOpPage, setSelOpPage] = useState(1);
  const [selOpRpp, setSelOpRpp] = useState(10);

  const [saving, setSaving] = useState(false);
  const [rolePage, setRolePage] = useState(1);
  const [roleRpp, setRoleRpp] = useState(10);
  const [roleSort, setRoleSort] = useState({ key: null, direction: 'asc' });


useEffect(() => {
      const handleNav = (e) => {
          const tab = String(e.detail).toUpperCase();
          if (tab === 'LIST') {
              sessionStorage.setItem('role_mode', 'LIST'); window.dispatchEvent(new CustomEvent('sync:roles_mode'));
              setView("LIST"); setEditingRoleId(null);
          } else {
              if (!editingRoleId && tab !== 'DETAILS') {
                  setModalConfig({ open: true, title: "Action Required", message: "You must fill out and 'Save Details' to create the Role before assigning Computers, Sites, or Operators.", confirmText: "Got it", hideCancel: true, onConfirm: () => { setModalConfig({ open: false }); window.dispatchEvent(new CustomEvent('sync:roles_tab', { detail: "DETAILS" })); } });
                  return;
              }
              setView("CREATE"); setActiveTab(tab);
          }
      };
      window.addEventListener('nav:roles', handleNav);
      return () => window.removeEventListener('nav:roles', handleNav);
  }, [editingRoleId]);

  useEffect(() => { window.dispatchEvent(new CustomEvent('sync:roles_tab', { detail: view === "LIST" ? "LIST" : activeTab })); }, [view, activeTab]);
  useEffect(() => { loadRoles(); }, []);
  useEffect(() => { if (view === "CREATE" && !dataLoaded) { loadCreateData(); setDataLoaded(true); } }, [view, dataLoaded]);

  async function loadRoles() {
      setLoading(true);
      try {
          const res = await apiFetch("/api/roles");
          setRoles(res.roles || []);
      } catch (e) { showToast(e.message, "error"); } finally { setLoading(false); }
  }

  async function loadCreateData() {
      try {
          const [cRes, pRes, sRes, uRes, gRes] = await Promise.all([
              safeFetch("/api/roles/computers/count", { total: 0 }),
              safeFetch("/api/roles/properties", { properties: [] }),
              safeFetch("/api/roles/sites", { sites: [] }),
              safeFetch("/api/auth/users", { users: [] }),
              safeFetch("/api/groups/list", { groups: [] })
          ]);
          setTotalComps(cRes.total || 0); setProperties(pRes.properties || []);
          setAvailableSites(sRes.sites || []); setPatchSetuUsers(uRes.users || []); setPatchSetuGroups(gRes.groups || []);
      } catch (e) { showToast("Failed to load dependency data: " + e.message, "error"); }
  }


const handleOpenCreate = () => {
      sessionStorage.setItem('role_mode', 'CREATE'); window.dispatchEvent(new CustomEvent('sync:roles_mode'));
      setEditingRoleId(null); setView("CREATE"); setActiveTab("DETAILS"); setSaving(false); 
      setName(""); setDescription(""); setSelectedComputers([]); setSelectedSites([]); setSelectedOperators([]); 
      setExpandedNodes(new Set(["ROOT", "RETRIEVED"])); loadCreateData();
  };

  const handleEditRole = async (r) => {
      sessionStorage.setItem('role_mode', 'EDIT'); window.dispatchEvent(new CustomEvent('sync:roles_mode'));
      setEditingRoleId(r.BigFixRoleID); setName(r.Name); setDescription(r.Description);
      setView("CREATE"); setActiveTab("DETAILS"); setSaving(false); setLoading(true);
      try {
          await loadCreateData();
          const res = await apiFetch(`/api/roles/${r.BigFixRoleID}/details`);
          if (res.details) {
              const d = res.details;
              if (d.perms) setPerms(p => ({ ...p, ...d.perms }));
              setSelectedComputers(d.computers || []); setSelectedSites(d.sites || []); setSelectedOperators(d.operators || []);
          }
      } catch (e) { showToast("Failed to load role details: " + e.message, "error"); } finally { setLoading(false); }
  };

  const handleCancel = () => { 
      sessionStorage.setItem('role_mode', 'LIST'); window.dispatchEvent(new CustomEvent('sync:roles_mode'));
      setView("LIST"); setEditingRoleId(null); setSaving(false); 
  };

  const toggleVal = (nodeId) => {
      const next = new Set(expandedNodes);
      if (next.has(nodeId)) next.delete(nodeId); else next.add(nodeId);
      setExpandedNodes(next);
  };

  const toggleProp = async (nodeKey, targetProp, filters = []) => {
      const next = new Set(expandedNodes);
      if (next.has(nodeKey)) { next.delete(nodeKey); setExpandedNodes(next); } 
      else {
          next.add(nodeKey); setExpandedNodes(next);
          if (!propertyValues[nodeKey] && !loadingStates[nodeKey]) {
              setLoadingStates(p => ({...p, [nodeKey]: true}));
              try {
                  const res = await apiFetch(`/api/roles/property-values-filtered`, { method: 'POST', body: JSON.stringify({ targetProp, filters }) });
                  setPropertyValues(p => ({...p, [nodeKey]: res.values || []}));
              } catch(e) { console.error(e); } finally { setLoadingStates(p => ({...p, [nodeKey]: false})); }
          }
      }
  };

  const handleCompCheck = (property, value, resource = "") => {
      const existingIdx = selectedComputers.findIndex(c => c.property === property && c.value === value);
      if (existingIdx >= 0) {
          const next = [...selectedComputers]; next.splice(existingIdx, 1); setSelectedComputers(next);
      } else setSelectedComputers([...selectedComputers, { property, value, resource }]);
  };

  const handleOperatorToggle = async (username) => {
      if (selectedOperators.includes(username)) {
          setSelectedOperators(selectedOperators.filter(u => u !== username)); return;
      }
      setSelectedOperators([...selectedOperators, username]);
      if (operatorWarnings[username] === undefined) {
          try {
              const res = await apiFetch(`/api/roles/check-operator/${encodeURIComponent(username)}`);
              setOperatorWarnings(prev => ({...prev, [username]: res.exists }));
          } catch(e) { setOperatorWarnings(prev => ({...prev, [username]: false })); }
      }
  };

  const handleSiteAdd = (site) => {
    if (!selectedSites.some(s => s.url === site.url)) setSelectedSites([...selectedSites, { ...site, permission: 'Reader' }]);
  };

const executeSave = async () => {
    setSaving(true);
    try {
        if (activeTab === 'DETAILS') {
            if (!editingRoleId) {
                // 1. Initial Creation
                const payload = { name, description, perms };
                const res = await apiFetch("/api/roles/create", { method: "POST", body: JSON.stringify(payload) });
                setEditingRoleId(res.roleId); 
                
                // NEW LOGIC: Switch mode to EDIT immediately to unlock the other tabs!
                sessionStorage.setItem('role_mode', 'EDIT'); 
                window.dispatchEvent(new CustomEvent('sync:roles_mode'));
                
                showToast("Role created! You can now assign Computers, Sites, and Operators.", "success");
                loadRoles();
                setSaving(false);
                return; // Stop here so it doesn't redirect back to the List page
                
            } else {
                // Updating Existing Details
                const payload = { details: { name, description }, perms };
                await apiFetch(`/api/roles/${editingRoleId}`, { method: "PUT", body: JSON.stringify(payload) });
            }
        } 
        else if (activeTab === 'COMPUTERS') await apiFetch(`/api/roles/${editingRoleId}`, { method: "PUT", body: JSON.stringify({ computers: selectedComputers }) });
        else if (activeTab === 'SITES') await apiFetch(`/api/roles/${editingRoleId}`, { method: "PUT", body: JSON.stringify({ sites: selectedSites }) });
        else if (activeTab === 'OPERATORS') await apiFetch(`/api/roles/${editingRoleId}`, { method: "PUT", body: JSON.stringify({ operators: selectedOperators }) });
        
        // This redirect will now only happen when updating tabs of an already existing role
        showToast("Role updated successfully! Redirecting...", "success");
        setTimeout(() => { handleCancel(); loadRoles(); setSaving(false); }, 1200);
    } catch (e) { 
        showToast(e.message, "error"); 
        setSaving(false); 
    } finally { 
        setModalConfig({ open: false }); 
    }
};

  const handleSaveInit = () => {
      if (activeTab === 'DETAILS' && !name) { showToast("Role Name is required.", "error"); return; }
      if (activeTab === 'OPERATORS') {
          const hasMissingOps = selectedOperators.some(op => operatorWarnings[op] === false);
          if (hasMissingOps) {
              setModalConfig({ open: true, title: "Warning: Operators Not Found", message: "Some selected users do not exist in the BigFix Console yet. Role updates targeting these operators may fail. Do you wish to proceed anyway?", confirmText: "Proceed", onCancel: () => setModalConfig({ open: false }), onConfirm: executeSave });
              return;
          }
      }
      executeSave();
  };

  const renderDetails = () => {
      const SelectRow = ({ label, value, onChange, options, menuPlacement = 'bottom', disabled = false }) => (
          <div className="field flex-row items-center m-0" style={{ gap: '16px', marginBottom: '12px' }}>
              <label className="label m-0" style={{ width: '280px', fontWeight: 500 }}>{label}</label>
              <FancySelect options={options} value={value} onChange={onChange} width="220px" menuPlacement={menuPlacement} disabled={disabled} />
          </div>
      );
      const privOpts = [{value:"1", label:"Yes"}, {value:"0", label:"No"}];
      const boolOpts = [{value:"true", label:"Yes"}, {value:"false", label:"No"}];
      
      const isMaster = perms.masterOperator === "1";

      return (
          <div className="fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '20px', paddingBottom: '40px' }}>
              <div className="section" style={{ border: '1px solid var(--border)', borderRadius: '8px', overflow: 'visible' }}>
                  <div className="section-head" style={{ padding: '16px 20px', background: 'var(--panel)', borderBottom: '1px solid var(--border)' }}><span className="title">Details</span></div>
                  <div style={{ padding: '20px', maxWidth: '700px' }}>
                      <div className="field">
                          <label className="label">Name <span className="req">*</span></label>
                          <input type="text" className="control" value={name} onChange={e=>setName(e.target.value)} disabled={saving} />
                      </div>
                      <div className="field m-0">
                          <label className="label">Description</label>
                          <textarea className="control" style={{ minHeight: '80px', resize: 'vertical' }} value={description} onChange={e=>setDescription(e.target.value)} disabled={saving} />
                      </div>
                  </div>
              </div>

              <div className="section" style={{ border: '1px solid var(--border)', borderRadius: '8px', overflow: 'visible' }}>
                  <div className="section-head" style={{ padding: '16px 20px', background: 'var(--panel)', borderBottom: '1px solid var(--border)' }}><span className="title">Permissions</span></div>
                  <div style={{ padding: '20px' }}>
                      <SelectRow label="Master Operator" value={perms.masterOperator} onChange={v=>handlePermChange('masterOperator', v)} options={privOpts} disabled={saving} />
                      <SelectRow label="Show Other Operators' Actions" value={perms.showOtherActions} onChange={v=>handlePermChange('showOtherActions', v)} options={privOpts} disabled={saving || isMaster} />
                      <SelectRow label="Stop Other Operators' Actions" value={perms.stopOtherActions} onChange={v=>handlePermChange('stopOtherActions', v)} options={privOpts} disabled={saving || isMaster} />
                      <SelectRow label="Can Create Actions" value={perms.canCreateActions} onChange={v=>handlePermChange('canCreateActions', v)} options={privOpts} disabled={saving || isMaster} />
                      <SelectRow label="Can Lock" value={perms.canLock} onChange={v=>handlePermChange('canLock', v)} options={privOpts} disabled={saving || isMaster} />
                      <SelectRow label="Can Send Refresh to Multiple Computers" value={perms.canSendRefresh} onChange={v=>handlePermChange('canSendRefresh', v)} options={privOpts} disabled={saving || isMaster} />
                      <SelectRow label="Can Submit Queries" value={perms.canSubmitQueries} onChange={v=>handlePermChange('canSubmitQueries', v)} options={privOpts} disabled={saving || isMaster} />
                      <SelectRow label="Custom Content" value={perms.customContent} onChange={v=>handlePermChange('customContent', v)} options={privOpts} disabled={saving || isMaster} />
                      <SelectRow label="Unmanaged Assets" value={perms.unmanagedAssets} onChange={v=>handlePermChange('unmanagedAssets', v)} options={[{value:"ShowAll", label:"Show All"}, {value:"ShowNone", label:"Show None"}]} disabled={saving || isMaster} />
                  </div>
              </div>

              <div className="section" style={{ border: '1px solid var(--border)', borderRadius: '8px', overflow: 'visible' }}>
                  <div className="section-head" style={{ padding: '16px 20px', background: 'var(--panel)', borderBottom: '1px solid var(--border)' }}><span className="title">Restart and Shutdown [?]</span></div>
                  <div style={{ padding: '20px' }}>
                      <SelectRow label="Post-Action Behavior" value={perms.postActionBehavior} onChange={v=>handlePermChange('postActionBehavior', v)} options={[{value:"AllowRestartOnly", label:"Allow Restart Only"}, {value:"AllowRestartAndShutdown", label:"Allow Restart and Shutdown"}, {value:"None", label:"None"}]} disabled={saving || isMaster} />
                      <SelectRow label="Action Script Commands" value={perms.actionScriptCommands} onChange={v=>handlePermChange('actionScriptCommands', v)} options={[{value:"AllowRestartOnly", label:"Allow Restart Only"}, {value:"AllowRestartAndShutdown", label:"Allow Restart and Shutdown"}, {value:"None", label:"None"}]} disabled={saving || isMaster} />
                  </div>
              </div>

              <div className="section" style={{ border: '1px solid var(--border)', borderRadius: '8px', overflow: 'visible' }}>
                  <div className="section-head" style={{ padding: '16px 20px', background: 'var(--panel)', borderBottom: '1px solid var(--border)' }}><span className="title">Interface Login Privileges</span></div>
                  <div style={{ padding: '20px' }}>
                      <SelectRow label="Can use Console" value={perms.useConsole} onChange={v=>handlePermChange('useConsole', v)} options={boolOpts} menuPlacement="top" disabled={saving || isMaster} />
                      <SelectRow label="Can use WebUI" value={perms.useWebUI} onChange={v=>handlePermChange('useWebUI', v)} options={boolOpts} menuPlacement="top" disabled={saving || isMaster} />
                      <SelectRow label="Can use REST API" value={perms.useRESTAPI} onChange={v=>handlePermChange('useRESTAPI', v)} options={boolOpts} menuPlacement="top" disabled={saving || isMaster} />
                  </div>
              </div>
          </div>
      );
  };

  const renderPropList = (currentFilters = [], parentNodeKey = "ROOT") => {
      const availableProps = properties.filter(p => !currentFilters.some(f => f.prop === p.name));
      return availableProps.map(pObj => {
          const pName = pObj.name;
          const resource = pObj.resource;
          const nodeKey = `${parentNodeKey}__PROP_${pName.replace(/\s+/g, '')}`;
          const isExpanded = expandedNodes.has(nodeKey);
          const isCompName = pName === "Computer Name";

          return (
              <div key={nodeKey} style={{ marginBottom: '6px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }} onClick={() => toggleProp(nodeKey, pName, currentFilters)}>
                      <span style={{ transform: isExpanded ? 'rotate(90deg)' : 'none', transition: '0.2s', width: 12, display: 'inline-block', color: 'var(--primary)' }}>▶</span>
                      <span>📁</span> <span>By {pName}</span>
                  </div>

                  {isExpanded && (
                      <div style={{ paddingLeft: '20px', marginTop: '6px' }}>
                          {loadingStates[nodeKey] ? <span className="muted-text">Loading...</span> : 
                           propertyValues[nodeKey] && propertyValues[nodeKey].length > 0 ? (
                              propertyValues[nodeKey].map(item => {
                                  const valNodeKey = `${nodeKey}__VAL_${String(item.value).replace(/\s+/g, '')}`;
                                  const showExpand = item.count > 1 && !isCompName; 
                                  const isValExpanded = expandedNodes.has(valNodeKey);
                                  const nextFilters = [...currentFilters, { prop: pName, val: item.value }];

                                  return (
                                      <div key={valNodeKey} style={{ marginBottom: '6px' }}>
                                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                              <span onClick={() => showExpand && toggleVal(valNodeKey)} style={{ cursor: showExpand ? 'pointer' : 'default', visibility: showExpand ? 'visible' : 'hidden', transform: isValExpanded ? 'rotate(90deg)' : 'none', transition: '0.2s', width: 12, display: 'inline-block', color: 'var(--primary)' }}>▶</span>
                                              <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', margin: 0 }}>
                                                  <input type="checkbox" className="custom-checkbox" checked={selectedComputers.some(c => c.property === pName && c.value === item.value)} onChange={() => handleCompCheck(pName, item.value, resource)} style={{ margin: 0 }} />
                                                  <span style={{ whiteSpace: 'nowrap' }}>{isCompName ? '📄' : '📁'} {item.value} {isCompName ? '' : `(${item.count})`}</span>
                                              </label>
                                          </div>
                                          {showExpand && isValExpanded && <div style={{ paddingLeft: '20px', marginTop: '6px' }}>{renderPropList(nextFilters, valNodeKey)}</div>}
                                      </div>
                                  )
                              })
                           ) : <span className="muted-text">No values found.</span>}
                      </div>
                  )}
              </div>
          )
      });
  };

  const renderComputers = () => (
      <div className="fade-in" style={{ display: 'flex', flexWrap: 'nowrap', height: '650px', overflow: 'hidden', width: '100%', gap: '24px' }}>
         <div style={{ flex: 1, minWidth: 0, border: '1px solid var(--border)', borderRadius: '8px', display: 'flex', flexDirection: 'column', background: 'var(--panel)' }}>
            <div className="section-head" style={{ padding: '16px', background: 'var(--bg)', borderBottom: '1px solid var(--border)' }}>
                <span className="title text-13">Assign management rights based on properties:</span>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: '20px', fontSize: '13px', userSelect: 'none' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '10px', cursor: 'pointer' }} onClick={() => toggleVal("ROOT")}>
                   <span style={{ transform: expandedNodes.has("ROOT") ? 'rotate(90deg)' : 'none', transition: '0.2s', width: 12, display: 'inline-block', fontWeight: 'bold', color: 'var(--primary)' }}>▶</span>
                   <span>🖥️</span> <span style={{ fontWeight: 600 }}>All Computers ({totalComps})</span>
                </div>
                
                {expandedNodes.has("ROOT") && (
                    <div style={{ paddingLeft: '24px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '10px', cursor: 'pointer' }} onClick={() => toggleVal("RETRIEVED")}>
                           <span style={{ transform: expandedNodes.has("RETRIEVED") ? 'rotate(90deg)' : 'none', transition: '0.2s', width: 12, display: 'inline-block', fontWeight: 'bold', color: 'var(--primary)' }}>▶</span>
                           <span>📁</span> <span>By Retrieved Properties</span>
                        </div>

                        {expandedNodes.has("RETRIEVED") && (
                            <div style={{ paddingLeft: '24px' }}>
                                {renderPropList([], "RETRIEVED")}
                            </div>
                        )}
                        
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '10px', marginBottom: '10px', cursor: 'pointer' }} onClick={() => toggleVal("GROUP")}>
                           <span style={{ transform: expandedNodes.has("GROUP") ? 'rotate(90deg)' : 'none', transition: '0.2s', width: 12, display: 'inline-block', fontWeight: 'bold', color: 'var(--primary)' }}>▶</span>
                           <span>📁</span> <span>By Group</span>
                        </div>
                        {expandedNodes.has("GROUP") && (
                            <div style={{ paddingLeft: '24px', marginTop: '6px' }}>
                                {patchSetuGroups.length === 0 ? <span className="muted-text">No groups created in Patch Setu yet.</span> :
                                    patchSetuGroups.map(g => (
                                        <div key={g.id} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '4px 0' }}>
                                            <span style={{ width: 12, display: 'inline-block' }}></span>
                                            <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', margin: 0 }}>
                                                <input type="checkbox"
                                                    className="custom-checkbox"
                                                    checked={selectedComputers.some(c => c.property === 'Group' && c.value === g.name)}
                                                    onChange={() => handleCompCheck('Group', g.name, 'GroupResource')}
                                                />
                                                <span style={{ whiteSpace: 'nowrap' }}>📄 {g.name} ({g.computerCount ?? g.memberCount ?? 0})</span>
                                            </label>
                                        </div>
                                    ))
                                }
                            </div>
                        )}
                    </div>
                )}
            </div>
         </div>

         <div style={{ flex: 1, minWidth: 0, background: 'var(--panel)', display: 'flex', flexDirection: 'column', border: '1px solid var(--border)', borderRadius: '8px' }}>
            <div className="section-head" style={{ padding: '16px', background: 'var(--bg)', borderBottom: '1px solid var(--border)' }}>
                <span className="title text-13">Selected Rules ({selectedComputers.length})</span>
            </div>
            <div>
                <div style={{ marginBottom: '24px', fontSize: '13px', color: 'var(--muted)', lineHeight: '1.6' }}>
                  This role has management rights on all computers that have the retrieved property values shown on the left. This role does NOT have management rights on any computers that do NOT have the retrieved property values shown on the left.
                  <br/><br/>
                  This role will automatically be granted management rights on (or will have management rights removed on) any computers that change to match (or to not match) the retrieved property values shown on the left.
                </div>
                
                <div style={{ flex: 1 }}>
                    {selectedComputers.length === 0 ? <span className="muted-text" style={{ fontSize: '13px' }}>No assignments selected. Expand the tree on the left and check values to assign.</span> : (
                        <ul style={{ paddingLeft: '20px', margin: 0, fontSize: '13px', color: 'var(--text)' }}>
                            {selectedComputers.map(c => (
                                <li key={`${c.property}_${c.value}`} style={{ marginBottom: '8px' }}>
                                    <strong>{c.property}</strong> = {c.value}
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
            </div>
         </div>
      </div>
  );

  const renderSites = () => { 
      let availSortable = [...availableSites];
      if (availSiteSort.key) {
          availSortable.sort((a,b) => {
              let aVal = String(a[availSiteSort.key] || "").toLowerCase();
              let bVal = String(b[availSiteSort.key] || "").toLowerCase();
              if (aVal < bVal) return availSiteSort.direction === 'asc' ? -1 : 1;
              if (aVal > bVal) return availSiteSort.direction === 'asc' ? 1 : -1;
              return 0;
          });
      }
      const availFiltered = availSortable.filter(s => s.name.toLowerCase().includes(availSiteSearch.toLowerCase()));
      const availPaginated = availFiltered.slice((availSitePage - 1) * availSiteRpp, availSitePage * availSiteRpp);
      
      let selSortable = [...selectedSites];
      if (selSiteSort.key) {
          selSortable.sort((a,b) => {
              let aVal = String(a[selSiteSort.key] || "").toLowerCase();
              let bVal = String(b[selSiteSort.key] || "").toLowerCase();
              if (aVal < bVal) return selSiteSort.direction === 'asc' ? -1 : 1;
              if (aVal > bVal) return selSiteSort.direction === 'asc' ? 1 : -1;
              return 0;
          });
      }
      const selFiltered = selSortable.filter(s => s.name.toLowerCase().includes(selSiteSearch.toLowerCase()));
      const selPaginated = selFiltered.slice((selSitePage - 1) * selSiteRpp, selSitePage * selSiteRpp);

      const handleASort = (k) => setAvailSiteSort(p => ({ key: k, direction: p.key===k && p.direction==='asc' ? 'desc' : 'asc' }));
      const handleSSort = (k) => setSelSiteSort(p => ({ key: k, direction: p.key===k && p.direction==='asc' ? 'desc' : 'asc' }));

      return (
          <div className="fade-in" style={{ display: 'flex', flexWrap: 'nowrap', gap: '24px', alignItems: 'flex-start', height: '100%', width: '100%' }}>
              <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', height: '650px', border: '1px solid var(--border)', borderRadius: '8px', background: 'var(--panel)', overflow: 'hidden' }}>
                 <div className="section-head" style={{ padding: '16px', background: 'var(--bg)', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span className="title text-13">Available Sites</span>
                    <input type="text" className="control" placeholder="Search ⌕" style={{ width: '160px', height: '30px' }} value={availSiteSearch} onChange={e=>setAvailSiteSearch(e.target.value)} />
                 </div>
                 <div className="tableWrap" style={{ flex: 1, overflowY: 'auto', border: 'none', borderRadius: 0 }}>
                    <table style={{ margin: 0 }}>
                       <thead className="kpi-th-sticky">
                         <tr>
                           <th className="w-50p cursor-pointer" onClick={() => handleASort('name')}>Site Name {availSiteSort.key === 'name' ? (availSiteSort.direction==='asc'?'↑':'↓') : '↕'}</th>
                           <th className="w-30p cursor-pointer" onClick={() => handleASort('type')}>Type {availSiteSort.key === 'type' ? (availSiteSort.direction==='asc'?'↑':'↓') : '↕'}</th>
                           <th className="text-center w-20p">Action</th>
                         </tr>
                       </thead>
                       <tbody>
                         {availPaginated.length === 0 ? (<tr><td colSpan={3} className="text-center text-muted">No sites found.</td></tr>) : availPaginated.map(s => {
                           const isSelected = selectedSites.some(sel => sel.url === s.url);
                           return (
                             <tr key={s.url} style={{ background: isSelected ? '#f8fafc' : 'transparent' }}>
                               <td style={{ opacity: isSelected ? 0.5 : 1 }} className="fw-500">{s.name}</td>
                               <td style={{ opacity: isSelected ? 0.5 : 1 }}>{s.type}</td>
                               <td className="text-center">
                                 <button className="btn outline small" onClick={() => handleSiteAdd(s)} disabled={isSelected}>{isSelected ? 'Added' : 'Add'}</button>
                               </td>
                             </tr>
                           );
                         })}
                       </tbody>
                    </table>
                 </div>
                 <Paginator total={availFiltered.length} rpp={availSiteRpp} setRpp={setAvailSiteRpp} page={availSitePage} setPage={setAvailSitePage} edgeToEdge={false} />
              </div>

              <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', height: '650px', border: '1px solid var(--border)', borderRadius: '8px', background: 'var(--panel)', overflow: 'hidden' }}>
                 <div className="section-head" style={{ padding: '16px', background: 'var(--bg)', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                     <span className="title text-13">Assigned Sites</span>
                     <input type="text" className="control" placeholder="Search ⌕" style={{ width: '160px', height: '30px' }} value={selSiteSearch} onChange={e=>setSelSiteSearch(e.target.value)} />
                 </div>
                 <div className="tableWrap" style={{ flex: 1, border: 'none', borderRadius: 0 }}>
                    <table style={{ margin: 0 }}>
                        <thead className="kpi-th-sticky">
                            <tr>
                              <th className="w-45p cursor-pointer" onClick={() => handleSSort('name')}>Site Name {selSiteSort.key === 'name' ? (selSiteSort.direction==='asc'?'↑':'↓') : '↕'}</th>
                              <th className="w-25p cursor-pointer" onClick={() => handleSSort('type')}>Type {selSiteSort.key === 'type' ? (selSiteSort.direction==='asc'?'↑':'↓') : '↕'}</th>
                              <th className="w-20p">Permissions</th>
                              <th className="w-10p text-center"></th>
                            </tr>
                        </thead>
                        <tbody>
                            {selPaginated.length === 0 ? (<tr><td colSpan={4} className="text-center text-muted" style={{padding: '24px'}}>No sites assigned.</td></tr>) : selPaginated.map(s => (
                                <tr key={s.url}>
                                    <td className="fw-500">{s.name}</td>
                                    <td>{s.type}</td>
                                    <td>
                                       {s.type === 'External' ? (
                                           <span className="muted-text font-mono">Reader</span>
                                       ) : (
                                           <FancySelect 
                                               options={[{value:'Reader',label:'Reader'}, {value:'Writer',label:'Writer'}, {value:'Owner',label:'Owner'}]} 
                                               value={s.permission} 
                                               onChange={val => setSelectedSites(selectedSites.map(x => x.url === s.url ? { ...x, permission: val } : x))} 
                                           />
                                       )}
                                    </td>
                                    <td className="text-center">
                                       <button 
                                          className="btn outline small flex-row items-center justify-center" 
                                          style={{ width: 28, height: 28, padding: 0, color: 'var(--muted)', transition: '0.2s', margin: '0 auto' }}
                                          onMouseEnter={(e) => { e.currentTarget.style.borderColor = '#ef4444'; e.currentTarget.style.color = '#ef4444'; }}
                                          onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--muted)'; }}
                                          onClick={() => setSelectedSites(selectedSites.filter(x=>x.url!==s.url))}
                                       >✕</button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                 </div>
                 <Paginator total={selFiltered.length} rpp={selSiteRpp} setRpp={setSelSiteRpp} page={selSitePage} setPage={setSelSitePage} edgeToEdge={false} />
              </div>
          </div>
      );
  };

  const renderOperators = () => { 
      const availOpsRaw = patchSetuUsers.filter(u => !selectedOperators.includes(u.username || u.LoginName));
      const availFiltered = availOpsRaw.filter(u => (u.username || u.LoginName || "").toLowerCase().includes(availOpSearch.toLowerCase()));
      const availPaginated = availFiltered.slice((availOpPage - 1) * availOpRpp, availOpPage * availOpRpp);

      const selFiltered = selectedOperators.filter(u => u.toLowerCase().includes(selOpSearch.toLowerCase()));
      const selPaginated = selFiltered.slice((selOpPage - 1) * selOpRpp, selOpPage * selOpRpp);

      return (
          <div className="fade-in" style={{ display: 'flex', flexWrap: 'nowrap', gap: '24px', alignItems: 'flex-start', height: '100%', width: '100%' }}>
              <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', height: '650px', border: '1px solid var(--border)', borderRadius: '8px', background: 'var(--panel)', overflow: 'hidden' }}>
                 <div className="section-head" style={{ padding: '16px', background: 'var(--bg)', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span className="title text-13">Available Users</span>
                    <input type="text" className="control" placeholder="Search ⌕" style={{ width: '160px', height: '30px' }} value={availOpSearch} onChange={e=>setAvailOpSearch(e.target.value)} />
                 </div>
                 <div className="tableWrap" style={{ flex: 1, overflowY: 'auto', border: 'none', borderRadius: 0 }}>
                    <table style={{ margin: 0 }}>
                       <thead className="kpi-th-sticky">
                         <tr>
                           <th className="w-50p">Patch Setu User</th>
                           <th className="w-30p">BigFix Console Status</th>
                           <th className="text-center w-20p">Action</th>
                         </tr>
                       </thead>
                       <tbody>
                         {availPaginated.length === 0 ? (<tr><td colSpan={3} className="text-center text-muted">No users found.</td></tr>) : availPaginated.map(u => {
                           const userName = u.username || u.LoginName || 'Unknown';
                           return (
                             <tr key={userName}>
                               <td className="fw-600" style={{ maxWidth: '150px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{userName}</td>
                               <td>{operatorWarnings[userName] === true ? <span className="text-success fw-600">✓ Verified</span> : operatorWarnings[userName] === false ? <span className="text-danger fw-600">⚠ Not Found</span> : '—'}</td>
                               <td className="text-center">
                                 <button className="btn outline small" onClick={() => handleOperatorToggle(userName)}>Add</button>
                               </td>
                             </tr>
                           );
                         })}
                       </tbody>
                    </table>
                 </div>
                 <Paginator total={availFiltered.length} rpp={availOpRpp} setRpp={setAvailOpRpp} page={availOpPage} setPage={setAvailOpPage} edgeToEdge={false} />
              </div>

              <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', height: '650px', border: '1px solid var(--border)', borderRadius: '8px', background: 'var(--panel)', overflow: 'hidden' }}>
                 <div className="section-head" style={{ padding: '16px', background: 'var(--bg)', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                     <span className="title text-13">Assigned Users</span>
                     <input type="text" className="control" placeholder="Search ⌕" style={{ width: '160px', height: '30px' }} value={selOpSearch} onChange={e=>setSelOpSearch(e.target.value)} />
                 </div>
                 <div className="tableWrap" style={{ flex: 1, overflowY: 'auto', border: 'none', borderRadius: 0 }}>
                    <table style={{ margin: 0 }}>
                        <thead className="kpi-th-sticky">
                            <tr>
                              <th className="w-50p">Patch Setu User</th>
                              <th className="w-30p">BigFix Console Status</th>
                              <th className="text-center w-20p">Action</th>
                            </tr>
                        </thead>
                        <tbody>
                            {selPaginated.length === 0 ? (<tr><td colSpan={3} className="text-center text-muted" style={{padding: '24px'}}>No users assigned.</td></tr>) : selPaginated.map(userName => (
                                <tr key={userName}>
                                    <td className="fw-600" style={{ maxWidth: '150px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{userName}</td>
                                    <td>{operatorWarnings[userName] === true ? <span className="text-success fw-600">✓ Verified</span> : operatorWarnings[userName] === false ? <span className="text-danger fw-600">⚠ Not Found</span> : '—'}</td>
                                    <td className="text-center">
                                       <button 
                                          className="btn-icon cancel" 
                                          onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'red'; e.currentTarget.style.color = 'red'; }}
                                          onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--muted)'; }}
                                          onClick={() => handleOperatorToggle(userName)}
                                       >✕</button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                 </div>
                 <Paginator total={selFiltered.length} rpp={selOpRpp} setRpp={setSelOpRpp} page={selOpPage} setPage={setSelOpPage} edgeToEdge={false} />
              </div>
          </div>
      );
  };

  if (view === "CREATE") {
      const getTabTitle = (tab) => {
          if(tab === 'DETAILS') return 'Details';
          if(tab === 'COMPUTERS') return `Computer Assignments (${selectedComputers.length})`;
          if(tab === 'SITES') return `Sites (${selectedSites.length})`;
          if(tab === 'OPERATORS') return `Operators (${selectedOperators.length})`;
          return tab;
      };

      return (
        <div className="mgmtenv" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
            
            <CustomModal 
               {...modalConfig} 
               onCancel={modalConfig.onCancel || (() => setModalConfig({ open: false }))} 
               onConfirm={modalConfig.onConfirm || (() => setModalConfig({ open: false }))} 
            />

            <div className="topbar" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div className="left">
                    <h2 className="m-0">
                        {editingRoleId ? `Edit BigFix Role: ` : 'Create BigFix Role '}
                        <span style={{ color: 'var(--primary)' }}>{name || ''}</span>
                        <span style={{ color: 'var(--muted)', fontWeight: 400 }}> / {getTabTitle(activeTab)}</span>
                    </h2>
                </div>
                <div className="right flex-row gap-12 items-center">
                   <button onClick={handleCancel} className="btn outline sec">Cancel</button>
                   <button onClick={handleSaveInit} disabled={saving} className="btn pri min-w-140 flex-row items-center justify-center gap-8">
                       {saving ? (
                          <>
                             <InlineSpinner size={16} variant="light" />
                             <span>Saving...</span>
                          </>
                       ) : (
                          activeTab === 'DETAILS' ? (editingRoleId ? "Save Details" : "Create Role") : `Save ${activeTab.charAt(0) + activeTab.slice(1).toLowerCase()}`
                       )}
                   </button>
                </div>
            </div>
            
            <div style={{ }}>
                {activeTab === 'DETAILS' && renderDetails()}
                {activeTab === 'COMPUTERS' && renderComputers()}
                {activeTab === 'SITES' && renderSites()}
                {activeTab === 'OPERATORS' && renderOperators()}
            </div>
        </div>
      );
  }

  let sortedListRoles = [...roles];
  if (roleSort.key) {
      sortedListRoles.sort((a,b) => {
          let aVal = a[roleSort.key] || "";
          let bVal = b[roleSort.key] || "";
          if(roleSort.key === 'BigFixRoleID') { aVal = Number(aVal); bVal = Number(bVal); }
          if (aVal < bVal) return roleSort.direction === 'asc' ? -1 : 1;
          if (aVal > bVal) return roleSort.direction === 'asc' ? 1 : -1;
          return 0;
      });
  }
  const paginatedRoles = sortedListRoles.slice((rolePage - 1) * roleRpp, rolePage * roleRpp);
  
  const handleRoleSort = (key) => setRoleSort(prev => ({ key, direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc' }));
  const getRoleSortIcon = (key) => roleSort.key !== key ? <span className="muted-text ml-6">↕</span> : <span className="ml-6">{roleSort.direction === 'asc' ? '↑' : '↓'}</span>;

  return (
    <div className="mgmtenv" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div className="topbar" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div className="left">
            <h2 className="m-0">BigFix Role Management</h2>
        </div>
        <div className="right flex-row gap-12 items-center">
            <button className="iconbtn" onClick={loadRoles} title="Refresh Roles" disabled={loading}>
                {loading ? <InlineSpinner size={16} /> : <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16"><path d="M23 4v6h-6"></path><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path></svg>}
            </button>
            <button onClick={handleOpenCreate} className="btn pri">+ Create Role</button>
        </div>
      </div>
      
      <div style={{ padding: '20px', flex: 1, display: 'flex', flexDirection: 'column' }}>
        {loading ? (
            <div className="sub flex-row items-center justify-center gap-8" style={{ padding: '40px' }}>
                <InlineSpinner size={24} variant="primary" />
                <span>Loading roles...</span>
            </div>
        ) : (
            <div className="section" style={{ display: 'flex', flexDirection: 'column', flex: 1, padding: 0 }}>
                
                <div className="tableWrap border-top" style={{ flex: 1, overflow: "auto", margin: "0 -32px", width: "calc(100% + 64px)", borderLeft: "none", borderRight: "none", borderRadius: 0 }}>
                    <table style={{ margin: 0 }}>
                        <thead className="kpi-th-sticky">
                            <tr>
                                <th className="cursor-pointer w-10p" onClick={() => handleRoleSort('BigFixRoleID')}>Role ID {getRoleSortIcon('BigFixRoleID')}</th>
                                <th className="cursor-pointer w-45p" onClick={() => handleRoleSort('Name')}>BigFix Role Name {getRoleSortIcon('Name')}</th>
                                <th className="cursor-pointer w-40p" onClick={() => handleRoleSort('Description')}>Description {getRoleSortIcon('Description')}</th>
                                <th className="text-center w-5p">Action</th>
                            </tr>
                        </thead>
                        <tbody>
                            {paginatedRoles.length === 0 ? (<tr><td colSpan={4} className="text-center text-muted">No roles found.</td></tr>) : paginatedRoles.map(r => (
                                <tr key={r.RoleID} onClick={() => handleEditRole(r)} className="cursor-pointer">
                                    <td className="muted-text font-mono">{r.BigFixRoleID || 'Pending'}</td>
                                    <td className="fw-600" style={{ color: 'var(--primary)' }}>{r.Name}</td>
                                    <td>{r.Description || "—"}</td>
                                    <td className="text-center"><button className="btn outline small" onClick={(e) => { e.stopPropagation(); handleEditRole(r); }}>Edit</button></td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
                <Paginator total={roles.length} rpp={roleRpp} setRpp={setRoleRpp} page={rolePage} setPage={setRolePage} edgeToEdge={true} />
            </div>
        )}
      </div>
    </div>
  );
}