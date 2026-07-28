// src/components/GroupManager.jsx
import { useState, useEffect, useRef, useMemo } from "react";
import PropTypes from "prop-types";
import FilterDrawer from "./FilterDrawer";
import { performExport } from "../utils/exportUtils";
import FancySelect from "./common/FancySelect";
import Paginator from "./common/Paginator";
import InlineSpinner from "./common/InlineSpinner";
import { useToast } from "./common/CustomToast";
import ComputerList from "./ComputerList";

const API = globalThis.env?.VITE_API_BASE || "";

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

async function putJSON(endpoint, body) {
  const r = await fetch(`${API}${endpoint}`, { method: "PUT", headers: getHeaders(), body: JSON.stringify(body) });
  const j = await r.json();
  if (!r.ok || j.ok === false) throw new Error(j.error || "Request failed");
  return j;
}

// Extracted to greatly reduce Cognitive Complexity (S3776)
const evaluateCondition = (fieldValue, operator, searchValue) => {
  if (operator === "contains") return fieldValue.includes(searchValue);
  if (operator === "=") return fieldValue === searchValue;
  if (operator === "!=") return fieldValue !== searchValue;
  if (operator === ">") return Number(fieldValue) > Number(searchValue);
  if (operator === "<") return Number(fieldValue) < Number(searchValue);
  return true;
};

// Extracted block evaluation for manage groups
const evaluateManageBlock = (group, block) => {
  let blockMatch = true;
  let validConds = 0;
  for (const c of block.conds) {
    if (!c.value) continue;
    validConds++; 
    const search = String(c.value).toLowerCase();
    const field = String(group[c.column] || "").toLowerCase();
    blockMatch = blockMatch && evaluateCondition(field, c.operator, search);
  }
  return { blockMatch, validConds };
};

const applyManageFilters = (group, manageFilters, manageGlobalLogic) => {
  if (!manageFilters.length) return true;
  let globalMatch = manageGlobalLogic !== "OR";
  for (const b of manageFilters) {
    const { blockMatch, validConds } = evaluateManageBlock(group, b);
    if (validConds > 0) {
      if (manageGlobalLogic === "OR") {
        globalMatch = globalMatch || blockMatch;
      } else {
        globalMatch = globalMatch && blockMatch;
      }
    }
  }
  return globalMatch;
};

// Extracted block evaluation for computers
const evaluateComputerBlock = (computer, block) => {
  let blockMatch = true;
  let validConds = 0;
  for (const c of block.conds) {
    if (!c.value) continue;
    validConds++; 
    const search = String(c.value).toLowerCase();
    const field = c.column === "ips" ? (computer.ips || []).join(", ").toLowerCase() : String(computer[c.column] || "").toLowerCase();
    blockMatch = blockMatch && evaluateCondition(field, c.operator, search);
  }
  return { blockMatch, validConds };
};

const applyComputerFilters = (computer, filters, globalLogic) => {
  if (!filters.length) return true;
  let globalMatch = globalLogic !== "OR";
  for (const b of filters) {
    const { blockMatch, validConds } = evaluateComputerBlock(computer, b);
    if (validConds > 0) {
      if (globalLogic === "OR") {
        globalMatch = globalMatch || blockMatch;
      } else {
        globalMatch = globalMatch && blockMatch;
      }
    }
  }
  return globalMatch;
};

// Sub-Component: S3358 Fix for Nested Ternaries in Manage Groups Table
const ManageGroupsTable = ({ fetchingManage, paginatedManageGroups, manageCols, handleManageSort, getManageSortIcon, isMO, handleEditClick }) => {
  if (fetchingManage) return <div className="sub empty-state" style={{ padding: '40px', textAlign: 'center' }}>Loading groups...</div>;
  if (paginatedManageGroups.length === 0) return <div className="sub empty-state" style={{ padding: '40px', textAlign: 'center' }}>No groups found matching your criteria.</div>;

  return (
    <table>
      <thead className="kpi-th-sticky">
        <tr>
          {manageCols.find(c=>c.id==='id')?.show && <th className="cursor-pointer" onClick={() => handleManageSort('id')} onKeyDown={(e) => e.key === 'Enter' && handleManageSort('id')} tabIndex={0}>ID{getManageSortIcon('id')}</th>}
          {manageCols.find(c=>c.id==='name')?.show && <th className="cursor-pointer" onClick={() => handleManageSort('name')} onKeyDown={(e) => e.key === 'Enter' && handleManageSort('name')} tabIndex={0}>Name{getManageSortIcon('name')}</th>}
          {manageCols.find(c=>c.id==='type')?.show && <th className="cursor-pointer" onClick={() => handleManageSort('type')} onKeyDown={(e) => e.key === 'Enter' && handleManageSort('type')} tabIndex={0}>Type{getManageSortIcon('type')}</th>}
          {manageCols.find(c=>c.id==='site')?.show && <th className="cursor-pointer" onClick={() => handleManageSort('site')} onKeyDown={(e) => e.key === 'Enter' && handleManageSort('site')} tabIndex={0}>Site{getManageSortIcon('site')}</th>}
          {manageCols.find(c=>c.id==='count')?.show && <th className="cursor-pointer" onClick={() => handleManageSort('count')} onKeyDown={(e) => e.key === 'Enter' && handleManageSort('count')} tabIndex={0}>Member Computer Count{getManageSortIcon('count')}</th>}
          <th className="text-center w-80">Action</th>
        </tr>
      </thead>
      <tbody>
        {paginatedManageGroups.map((g) => (
          <tr key={g.id}>
            {manageCols.find(c=>c.id==='id')?.show && <td>{g.id}</td>}
            {manageCols.find(c=>c.id==='name')?.show && <td><strong>{g.name}</strong></td>}
            {manageCols.find(c=>c.id==='type')?.show && <td><span className="rowchip">{g.type}</span></td>}
            {manageCols.find(c=>c.id==='site')?.show && <td className="muted-text">{g.site}</td>}
            {manageCols.find(c=>c.id==='count')?.show && (
                <td className="cursor-pointer" onClick={() => globalThis.dispatchEvent(new CustomEvent('nav:group', { detail: { tab: 'COMPUTERS', groupId: g.id, groupName: g.name } }))}>
                    <span style={{ color: 'var(--primary)', fontWeight: 600, textDecoration: 'underline' }}>{g.count}</span>
                </td>
            )}
            <td className="text-center">
               {(isMO || g.type !== 'Manual') && (
                  <button 
                      type="button"
                      className="btn outline small" 
                      style={{ height: '28px', padding: '0 12px', fontSize: '12px' }}
                      onClick={(e) => { e.stopPropagation(); handleEditClick(g.id); }} 
                  >
                      Edit
                  </button>
               )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
};

ManageGroupsTable.propTypes = {
  fetchingManage: PropTypes.bool.isRequired,
  paginatedManageGroups: PropTypes.array.isRequired,
  manageCols: PropTypes.array.isRequired,
  handleManageSort: PropTypes.func.isRequired,
  getManageSortIcon: PropTypes.func.isRequired,
  isMO: PropTypes.bool.isRequired,
  handleEditClick: PropTypes.func.isRequired
};

// Sub-Component: S3358 Fix for Nested Ternaries in Computer Selection Table
const ComputerSelectionTable = ({ fetchingComp, paginatedComputers, cols, handleSort, getSortIcon, toggleAllVisible, toggleComputer, selectedCompIds }) => {
  if (fetchingComp) return <div className="sub empty-state" style={{ padding: '40px', textAlign: 'center' }}>Loading computers...</div>;
  if (paginatedComputers.length === 0) return <div className="sub empty-state" style={{ padding: '40px', textAlign: 'center' }}>No computers found.</div>;

  return (
      <table>
          <thead className="kpi-th-sticky">
            <tr>
              <th className="text-center w-40"><input type="checkbox" className="custom-checkbox" onChange={toggleAllVisible} checked={paginatedComputers.length > 0 && paginatedComputers.every(c => selectedCompIds.has(c.id))} /></th>
              {cols.find(c=>c.id==='name')?.show && <th className="cursor-pointer" onClick={() => handleSort('name')} onKeyDown={(e) => e.key === 'Enter' && handleSort('name')} tabIndex={0}>Computer Name{getSortIcon('name')}</th>}
              {cols.find(c=>c.id==='os')?.show && <th className="cursor-pointer" onClick={() => handleSort('os')} onKeyDown={(e) => e.key === 'Enter' && handleSort('os')} tabIndex={0}>Operating System{getSortIcon('os')}</th>}
              {cols.find(c=>c.id==='ips')?.show && <th className="cursor-pointer" onClick={() => handleSort('ips')} onKeyDown={(e) => e.key === 'Enter' && handleSort('ips')} tabIndex={0}>IP Address{getSortIcon('ips')}</th>}
            </tr>
          </thead>
          <tbody>
            {paginatedComputers.map((c) => (
              <tr key={c.id} onClick={() => toggleComputer(c.id)} className={selectedCompIds.has(c.id) ? "selected-row" : ""}>
                <td className="text-center"><input type="checkbox" className="custom-checkbox no-events" checked={selectedCompIds.has(c.id)} readOnly /></td>
                {cols.find(c=>c.id==='name')?.show && <td>{c.name}</td>}
                {cols.find(c=>c.id==='os')?.show && <td>{c.os}</td>}
                {cols.find(c=>c.id==='ips')?.show && <td className="muted-text">{c.ips?.[0] || "-"}</td>}
              </tr>
            ))}
          </tbody>
        </table>
  );
};

ComputerSelectionTable.propTypes = {
  fetchingComp: PropTypes.bool.isRequired,
  paginatedComputers: PropTypes.array.isRequired,
  cols: PropTypes.array.isRequired,
  handleSort: PropTypes.func.isRequired,
  getSortIcon: PropTypes.func.isRequired,
  toggleAllVisible: PropTypes.func.isRequired,
  toggleComputer: PropTypes.func.isRequired,
  selectedCompIds: PropTypes.instanceOf(Set).isRequired
};

// Sub-Component: Reduces Cognitive Complexity of Create View
const ConditionsTable = ({ conditions, logicOptions, groupLogic, setGroupLogic, selectedTargetSite, removeCondition }) => {
  if (conditions.length === 0) return null;
  return (
      <div className="tableWrap border-top" style={{ borderRadius: 0, borderLeft: 'none', borderRight: 'none', overflow: 'visible' }}>
        <div style={{ padding: '16px 20px', backgroundColor: 'var(--bg)', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'flex-start', gap: '26px', flexWrap: 'wrap' }}>
           <div style={{ width: '180px', flexShrink: 0 }}>
              <FancySelect 
                  label="Evaluation Logic" 
                  options={logicOptions} 
                  value={groupLogic} 
                  onChange={setGroupLogic} 
              />
           </div>
           <div className="text-13 muted-text" style={{ flex: 1, marginTop: '28px', minWidth: '250px' }}>
               {groupLogic === "All" ? "Computers must match ALL of the listed conditions." : "Computers must match ANY of the listed conditions."}
           </div>
        </div>
        <table>
          <thead><tr><th>Property</th><th>Comparison</th><th>Value</th><th>Target Site</th><th className="right">Action</th></tr></thead>
          <tbody>
            {conditions.map(c => (
              <tr key={c.id}>
                <td><b>{c.property}</b></td>
                <td><span className="rowchip succ">{c.operator}</span></td>
                <td>{c.value}</td>
                <td className="muted-text">{selectedTargetSite || "—"}</td>
                <td className="right"><button type="button" className="btn-icon-sm" onClick={() => removeCondition(c.id)}>✕</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
  );
};

ConditionsTable.propTypes = {
  conditions: PropTypes.array.isRequired,
  logicOptions: PropTypes.array.isRequired,
  groupLogic: PropTypes.string.isRequired,
  setGroupLogic: PropTypes.func.isRequired,
  selectedTargetSite: PropTypes.string.isRequired,
  removeCondition: PropTypes.func.isRequired
};

// Main Component
export default function GroupManager({ onClose }) {
  const isMO = sessionStorage.getItem("isMO") === "true";
  const { showToast } = useToast();
  
  const [activeTab, setActiveTab] = useState('COMPUTERS');
  const [targetGroupId, setTargetGroupId] = useState(null);
  const [targetGroupName, setTargetGroupName] = useState("");

  const [isEditing, setIsEditing] = useState(false);
  const [editingGroupId, setEditingGroupId] = useState(null);

  const [groupType, setGroupType] = useState("Automatic");
  const [groupName, setGroupName] = useState("");
  const [creating, setCreating] = useState(false);
  const [properties, setProperties] = useState([]);
  const [selectedProperty, setSelectedProperty] = useState("");
  const [operators] = useState([{value:"Contains", label:"Contains"}, {value:"Equals", label:"Equals"}, {value:"Starts With", label:"Starts With"}]);
  const [selectedOperator, setSelectedOperator] = useState("Contains");
  const [valueInput, setValueInput] = useState("");
  const [conditions, setConditions] = useState([]); 
  const [loadingProps, setLoadingProps] = useState(false);
  
  const [customSites, setCustomSites] = useState([]);
  const [selectedTargetSite, setSelectedTargetSite] = useState("");
  const [loadingSites, setLoadingSites] = useState(false);

  const [allComputers, setAllComputers] = useState([]);
  const [selectedCompIds, setSelectedCompIds] = useState(new Set()); 
  const [fetchingComp, setFetchingComp] = useState(false);
  const [lastUpdated, setLastUpdated] = useState("");

  const [currentPage, setCurrentPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [sortConfig, setSortConfig] = useState({ key: null, direction: "asc" });
  const [showColDrop, setShowColDrop] = useState(false);
  const [showExpDrop, setShowExpDrop] = useState(false);
  const [exportFormat, setExportFormat] = useState('CSV');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [globalLogic, setGlobalLogic] = useState("AND");
  const [filters, setFilters] = useState([]);
  
  const logicOptions = useMemo(() => [{value:"All", label:"All"}, {value:"Any", label:"Any"}], []);
  const [groupLogic, setGroupLogic] = useState("All");

  const colRef = useRef(null);
  const expRef = useRef(null);

  const [manageGroups, setManageGroups] = useState([]);
  const [fetchingManage, setFetchingManage] = useState(false);
  const [managePage, setManagePage] = useState(1);
  const [manageRpp, setManageRpp] = useState(10);
  const [manageDrawerOpen, setManageDrawerOpen] = useState(false);
  const [manageGlobalLogic, setManageGlobalLogic] = useState("AND");
  const [manageFilters, setManageFilters] = useState([]);
  const [manageSort, setManageSort] = useState({ key: 'site', direction: 'asc' });
  const [manageShowCol, setManageShowCol] = useState(false);
  const [manageShowExp, setManageShowExp] = useState(false);
  const manageColRef = useRef(null);
  const manageExpRef = useRef(null);

  const [manageCols, setManageCols] = useState([
    { id: 'id', label: 'ID', show: true },
    { id: 'name', label: 'Name', show: true },
    { id: 'type', label: 'Type', show: true },
    { id: 'site', label: 'Site', show: true },
    { id: 'count', label: 'Member Computer Count', show: true }
  ]);

  const managePropertyOptions = useMemo(() => [
    { value: "name", label: "Name" },
    { value: "type", label: "Type" },
    { value: "site", label: "Site" },
    { value: "id", label: "ID" },
    { value: "count", label: "Member Count" }
  ], []);

  const fetchManageGroups = async (forceRefresh = false) => {
    setFetchingManage(true);
    try {
      const data = await getJSON(`/api/groups/manage?refresh=${forceRefresh}`);
      if (data.ok) setManageGroups(data.groups || []);
    } catch (e) { showToast(e.message, "error"); } 
    finally { setFetchingManage(false); }
  };

  useEffect(() => {
    if (activeTab === 'MANAGE') fetchManageGroups(false);
  }, [activeTab]);

  useEffect(() => {
    const handleOutsideManage = (e) => {
      if (manageColRef.current && !manageColRef.current.contains(e.target)) setManageShowCol(false);
      if (manageExpRef.current && !manageExpRef.current.contains(e.target)) setManageShowExp(false);
    };
    document.addEventListener("mousedown", handleOutsideManage);
    return () => document.removeEventListener("mousedown", handleOutsideManage);
  }, []);

  const filteredManageGroups = useMemo(() => manageGroups.filter(g => applyManageFilters(g, manageFilters, manageGlobalLogic)), [manageGroups, manageFilters, manageGlobalLogic]);
  const activeManageFilterCount = manageFilters.reduce((acc, b) => acc + b.conds.filter(c => c.value).length, 0);

  const sortedManageGroups = useMemo(() => {
    let items = [...filteredManageGroups];
    if (manageSort.key) {
      items.sort((a, b) => {
        if (manageSort.key === 'count' || manageSort.key === 'id') {
           const aVal = Number(a[manageSort.key] || 0);
           const bVal = Number(b[manageSort.key] || 0);
           return manageSort.direction === 'asc' ? aVal - bVal : bVal - aVal;
        }
        const aVal = String(a[manageSort.key] || "").toLowerCase();
        const bVal = String(b[manageSort.key] || "").toLowerCase();
        if (aVal < bVal) return manageSort.direction === "asc" ? -1 : 1;
        if (aVal > bVal) return manageSort.direction === "asc" ? 1 : -1;
        return 0;
      });
    }
    return items;
  }, [filteredManageGroups, manageSort]);

  const paginatedManageGroups = sortedManageGroups.slice((managePage - 1) * manageRpp, managePage * manageRpp);
  const handleManageSort = (key) => setManageSort(prev => ({ key, direction: prev.key === key && prev.direction === "asc" ? "desc" : "asc" }));
  const getManageSortIcon = (key) => {
    if (manageSort.key !== key) return <span className="muted-text ml-6">↕</span>;
    return <span className="ml-6">{manageSort.direction === "asc" ? "↑" : "↓"}</span>;
  };

  const handleManageExport = (scope) => { 
    setManageShowExp(false); 
    
    let dataToExport = [];
    if (scope === 'page') {
      dataToExport = paginatedManageGroups;
    } else if (scope === 'filtered') {
      dataToExport = sortedManageGroups;
    } else {
      dataToExport = manageGroups;
    }

    performExport(dataToExport, manageCols, exportFormat, "manage_groups_export");
  };

  const [cols, setCols] = useState([
    { id: 'name', label: 'Computer Name', show: true },
    { id: 'os', label: 'Operating System', show: true },
    { id: 'ips', label: 'IP Address', show: true }
  ]);

  const propertyOptions = useMemo(() => [
    { value: "name", label: "Computer Name" },
    { value: "os", label: "Operating System" },
    { value: "ips", label: "IP Address" }
  ], []);

  useEffect(() => {
    const handleNav = (e) => {
        if (typeof e.detail === 'object') {
            setActiveTab(e.detail.tab);
            setTargetGroupId(e.detail.groupId);
            setTargetGroupName(e.detail.groupName);
        } else {
            setActiveTab(e.detail);
            if (e.detail !== 'COMPUTERS') {
                setTargetGroupId(null);
                setTargetGroupName("");
            }
        }
    };
    globalThis.addEventListener('nav:group', handleNav);
    globalThis.dispatchEvent(new CustomEvent('sync:group_tab', { detail: activeTab }));
    return () => globalThis.removeEventListener('nav:group', handleNav);
  }, [activeTab]);

  useEffect(() => {
    const handleOutside = (e) => {
      if (colRef.current && !colRef.current.contains(e.target)) setShowColDrop(false);
      if (expRef.current && !expRef.current.contains(e.target)) setShowExpDrop(false);
    };
    document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, []);

  useEffect(() => {
    setLastUpdated(new Date().toLocaleString());
    if (groupType === "Automatic" || groupType === "ServerBased") {
      if (properties.length === 0) {
        setLoadingProps(true);
        getJSON("/api/groups/metadata/properties")
          .then(data => setProperties(data.properties?.map(p => ({value: p, label: p})) || []))
          .catch(e => showToast(e.message, "error")) 
          .finally(() => setLoadingProps(false));
      }
      if (customSites.length === 0) {
        setLoadingSites(true);
        getJSON("/api/groups/metadata/role-sites").then(data => { 
          const sites = data.sites?.map(s => ({value: s, label: s})) || []; 
          setCustomSites(sites); 
          if (sites.length > 0) setSelectedTargetSite(sites[0].value); 
        }).catch(e => console.warn(e)).finally(() => setLoadingSites(false));
      }
    }
  }, [groupType]);

  const fetchComputers = async () => {
    setFetchingComp(true);
    try {
      const data = await getJSON(`/api/groups/metadata/computers?page=1&limit=10000`);
      if (data.ok) {
        setAllComputers(data.computers || []);
        setLastUpdated(new Date().toLocaleString());
      }
    } catch (e) { showToast(e.message, "error"); } 
    finally { setFetchingComp(false); }
  };

  useEffect(() => {
    if (groupType === "Manual") fetchComputers();
    else { setAllComputers([]); setCurrentPage(1); }
  }, [groupType]);

  const visibleComputers = useMemo(() => allComputers.filter(c => applyComputerFilters(c, filters, globalLogic)), [allComputers, filters, globalLogic]);
  
  const sortedComputers = useMemo(() => {
    let sortableItems = [...visibleComputers];
    if (sortConfig.key) {
      sortableItems.sort((a, b) => {
        let aVal = "";
        let bVal = "";
        if (sortConfig.key === 'ips') {
            aVal = Array.isArray(a.ips) ? a.ips.join(", ") : "";
            bVal = Array.isArray(b.ips) ? b.ips.join(", ") : "";
        } else {
            aVal = String(a[sortConfig.key] || "").toLowerCase();
            bVal = String(b[sortConfig.key] || "").toLowerCase();
        }
        if (aVal < bVal) return sortConfig.direction === "asc" ? -1 : 1;
        if (aVal > bVal) return sortConfig.direction === "asc" ? 1 : -1;
        return 0;
      });
    }
    return sortableItems;
  }, [visibleComputers, sortConfig]);

  const paginatedComputers = sortedComputers.slice((currentPage - 1) * rowsPerPage, currentPage * rowsPerPage);

  const addCondition = () => {
    if (!selectedProperty || !valueInput.trim()) { 
      showToast("Please select a property and enter a value.", "error"); 
      return; 
    }
    setConditions([...conditions, { id: Date.now(), property: selectedProperty, operator: selectedOperator, value: valueInput }]);
    setValueInput(""); 
  };

  const removeCondition = (id) => setConditions(conditions.filter(c => c.id !== id));
  const toggleComputer = (id) => { const next = new Set(selectedCompIds); next.has(id) ? next.delete(id) : next.add(id); setSelectedCompIds(next); };
  const toggleAllVisible = () => { 
      const next = new Set(selectedCompIds); 
      const allVisibleIds = paginatedComputers.map(c => c.id); 
      const allSelected = allVisibleIds.length > 0 && allVisibleIds.every(id => next.has(id)); 
      allSelected ? allVisibleIds.forEach(id => next.delete(id)) : allVisibleIds.forEach(id => next.add(id)); 
      setSelectedCompIds(next); 
  };

  const handleSort = (key) => setSortConfig(prev => ({ key, direction: prev.key === key && prev.direction === "asc" ? "desc" : "asc" }));
  const getSortIcon = (key) => {
    if (sortConfig.key !== key) return <span className="muted-text ml-6">↕</span>;
    return <span className="ml-6">{sortConfig.direction === "asc" ? "↑" : "↓"}</span>;
  };

  const resetForm = () => {
      setGroupName("");
      setConditions([]);
      setGroupLogic("All");
      setSelectedCompIds(new Set());
      setIsEditing(false);
      setEditingGroupId(null);
  };

  const handleEditClick = async (groupId) => {
      try {
          showToast("Loading group details...", "info");
          const data = await getJSON(`/api/groups/${groupId}/details`);
          if (data.ok) {
              const g = data.groupData;
              setGroupType(g.type);
              setGroupName(g.name);
              
              if (g.type === "Automatic" || g.type === "ServerBased") {
                  setGroupLogic(g.logic === "Any" ? "Any" : "All"); 
                  setConditions(g.conditions.map((c, i) => ({
                      id: Date.now() + i,
                      property: c.property || c.propertyId, 
                      operator: c.operator,
                      value: c.value
                  })));
                  setSelectedTargetSite(g.siteName === 'master' ? 'ActionSite' : g.siteName);
              } else if (g.type === "Manual") {
                  setSelectedCompIds(new Set(g.computerIds));
                  if(allComputers.length === 0) fetchComputers();
              }
              
              setIsEditing(true);
              setEditingGroupId(groupId);
              setActiveTab('CREATE'); 
          }
      } catch (e) {
          showToast("Failed to load group details: " + e.message, "error");
      }
  };

  const handleSaveGroup = async () => {
    if (!groupName.trim()) return showToast("Group Name is required.", "error");
    
    const payload = { name: groupName, type: groupType, logic: groupLogic };

    if (groupType === "Automatic" || groupType === "ServerBased") {
      if (conditions.length === 0) return showToast("Please add at least one condition.", "error");
      if (!selectedTargetSite) return showToast("Please select a target site.", "error");
      payload.targetSite = selectedTargetSite; payload.conditions = conditions;
    } else {
      if (selectedCompIds.size === 0) return showToast("Please select at least one computer.", "error");
      payload.computerIds = Array.from(selectedCompIds);
    }

    setCreating(true);
    try {
      if (isEditing) {
          await putJSON(`/api/groups/${editingGroupId}`, payload);
          showToast(`${groupType} Group "${groupName}" updated successfully!`, "success");
      } else {
          await postJSON("/api/groups/create", payload);
          showToast(`${groupType} Group "${groupName}" created successfully!`, "success");
      }
      resetForm();
      setActiveTab('MANAGE');
      fetchManageGroups(true);
    } catch (e) { 
      showToast(e.message, "error"); 
    } finally { 
      setCreating(false); 
    }
  };

  const activeFilterCount = filters.reduce((acc, b) => acc + b.conds.filter(c => c.value).length, 0);

  const handleExport = (scope) => { 
    setShowExpDrop(false); 
    
    let dataToExport = [];
    if (scope === 'page') {
      dataToExport = paginatedComputers;
    } else if (scope === 'filtered') {
      dataToExport = sortedComputers;
    } else {
      dataToExport = allComputers;
    }

    performExport(dataToExport, cols, exportFormat, "computers_export", (r, c) => {
      if (c === 'ips') return Array.isArray(r.ips) ? r.ips.join(", ") : "";
      return r[c];
    });
  };

  let saveBtnContent = null;
  if (creating) {
      saveBtnContent = (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
            <InlineSpinner size={16} variant="light" />
            <span>{isEditing ? "Updating..." : "Creating..."}</span>
          </div>
      );
  } else if (isEditing) {
      saveBtnContent = "Update Group";
  } else {
      saveBtnContent = "Create Group";
  }

  if (activeTab === 'COMPUTERS') {
      return <ComputerList groupId={targetGroupId} groupName={targetGroupName} />;
  }

  if (activeTab === 'MANAGE') {
    return (
      <div className="mgmt">
        <div className="topbar" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div className="left" style={{ display: 'flex', flexDirection: 'column' }}>
              <h2 style={{ margin: 0, fontSize: "22px", fontWeight: 600, color: "var(--text)" }}>Manage Groups</h2>
              <div className="sub mt-4 text-13 muted-text">View and edit existing groups</div>
          </div>
          <div className="right flex-row gap-12 items-center">
             <div style={{ position: 'relative' }}>
                 <button type="button" className="iconbtn" onClick={() => setManageDrawerOpen(true)} title="Filter Data">
                     <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16"><line x1="4" y1="21" x2="4" y2="14"></line><line x1="4" y1="10" x2="4" y2="3"></line><line x1="12" y1="21" x2="12" y2="12"></line><line x1="12" y1="8" x2="12" y2="3"></line><line x1="20" y1="21" x2="20" y2="16"></line><line x1="20" y1="12" x2="20" y2="3"></line><line x1="1" y1="14" x2="7" y2="14"></line><line x1="9" y1="8" x2="15" y2="8"></line><line x1="17" y1="16" x2="23" y2="16"></line></svg>
                 </button>
                 {activeManageFilterCount > 0 && <span className="pill blue" style={{ position: 'absolute', top: -8, right: -8, padding: '2px 6px', fontSize: 10 }}>{activeManageFilterCount}</span>}
             </div>
             <button type="button" className="iconbtn" onClick={() => fetchManageGroups(true)} title="Refresh Data">
                 <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16"><path d="M23 4v6h-6"></path><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path></svg>
             </button>
          </div>
        </div>
        
        <div className="section overflow-visible" style={{ marginTop: '20px' }}>
          {activeManageFilterCount > 0 && (
              <div className="p-0-20-20" style={{ paddingTop: '20px' }}>
                  <div className="active-filter-banner active">
                    <div className="filter-tags">
                      {manageFilters.map((b) => {
                        const validConds = b.conds.filter(c => c.value);
                        if (!validConds.length) return null;
                        const blockKey = b.conds.map(c => `${c.column}-${c.operator}-${c.value}`).join('|');
                        return (
                          <div key={blockKey} style={{display:'inline-flex', alignItems:'center'}}>
                            <span style={{fontSize:12, fontWeight:600, color:'var(--primary)', margin:'0 8px'}}>{manageGlobalLogic}</span>
                            {validConds.map((c) => {
                              const condKey = `${c.column}-${c.operator}-${c.value}`;
                              return (
                                <span key={condKey} style={{display:'inline-flex', alignItems:'center'}}>
                                  <span style={{fontSize:11, fontWeight:600, color:'var(--primary)', margin:'0 6px'}}>AND</span>
                                  <span className="filter-tag"><strong>{managePropertyOptions.find(o => o.value === c.column)?.label || c.column}</strong>&nbsp;{c.operator}&nbsp;<strong>'{c.value}'</strong></span>
                                </span>
                              );
                            })}
                          </div>
                        );
                      })}
                    </div>
                    <button type="button" className="btn outline" onClick={() => setManageFilters([])}>Clear Filters</button>
                  </div>
              </div>
          )}

          <div className="section-head" style={{ paddingBottom: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: activeManageFilterCount > 0 ? 0 : '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span className="title">Group Directory</span>
              <span className="pill soft">Total: {filteredManageGroups.length}</span>
            </div>
            <div style={{ display: 'flex', gap: '12px' }}>
                <div className="dropdown" ref={manageColRef}>
                    <button type="button" className="btn outline sec small" onClick={() => { setManageShowCol(!manageShowCol); setManageShowExp(false); }}>
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16"><line x1="8" y1="6" x2="21" y2="6"></line><line x1="8" y1="12" x2="21" y2="12"></line><line x1="8" y1="18" x2="21" y2="18"></line><line x1="3" y1="6" x2="3.01" y2="6"></line><line x1="3" y1="12" x2="3.01" y2="12"></line><line x1="3" y1="18" x2="3.01" y2="18"></line></svg>
                        &nbsp; Columns
                    </button>
                    {manageShowCol && (
                        <div className="dropdown-menu show" style={{ minWidth: "220px", padding: "12px", right: 0 }}>
                            <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                                {manageCols.map((col, i) => (
                                    <label key={col.id} style={{ display: "flex", alignItems: "center", gap: "10px", cursor: "pointer", padding: "6px 12px", borderRadius: "4px", transition: "0.2s" }} onMouseOver={e=>e.currentTarget.style.background="#f8fafc"} onFocus={e=>e.currentTarget.style.background="#f8fafc"} onMouseOut={e=>e.currentTarget.style.background="transparent"} onBlur={e=>e.currentTarget.style.background="transparent"}>
                                        <input type="checkbox" className="custom-checkbox" checked={col.show} onChange={e => {
                                            const next = [...manageCols]; next[i].show = e.target.checked; setManageCols(next);
                                        }} />
                                        <span style={{ fontSize: "13px", fontWeight: 500 }}>{col.label}</span>
                                    </label>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
                <div className="dropdown" ref={manageExpRef}>
                    <button type="button" className="btn outline small" onClick={() => { setManageShowExp(!manageShowExp); setManageShowCol(false); }}>
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"></path></svg>
                        &nbsp; Export
                    </button>
                    {manageShowExp && (
                        <div className="dropdown-menu show" style={{ width: "280px", padding: "16px", right: 0 }}>
                            <div style={{ fontSize: "11px", fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", marginBottom: "12px", letterSpacing: '0.05em' }}>Format</div>
                            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "8px", marginBottom: "20px" }}>
                               {['CSV', 'PDF', 'HTML', 'TXT', 'JSON', 'XML'].map(fmt => (
                                 <button type="button" key={fmt} className={`btn small ${exportFormat === fmt ? 'pri' : 'outline'}`} style={{ fontSize: '11px', height: '32px', padding: 0 }} onClick={(e) => { e.stopPropagation(); setExportFormat(fmt); }}>{fmt}</button>
                               ))}
                            </div>
                            <div style={{ height: '1px', background: 'var(--border)', marginBottom: '16px' }}></div>
                            <div style={{ fontSize: "11px", fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", marginBottom: "12px", letterSpacing: '0.05em' }}>Scope</div>
                            <button type="button" className="item" onClick={() => handleManageExport('page')}>Current Page</button>
                            <button type="button" className="item" onClick={() => handleManageExport('filtered')}>Filtered Data</button>
                            <button type="button" className="item" onClick={() => handleManageExport('all')}>All Data</button>
                        </div>
                    )}
                </div>
            </div>
          </div>
          
          <div className="tableWrap h-400 border-top" style={{ borderRadius: 0, borderLeft: 'none', borderRight: 'none' }}>
             <ManageGroupsTable 
               fetchingManage={fetchingManage} 
               paginatedManageGroups={paginatedManageGroups} 
               manageCols={manageCols} 
               handleManageSort={handleManageSort} 
               getManageSortIcon={getManageSortIcon} 
               isMO={isMO} 
               handleEditClick={handleEditClick} 
             />
          </div>

          <Paginator total={sortedManageGroups.length} rpp={manageRpp} setRpp={setManageRpp} page={managePage} setPage={setManagePage} edgeToEdge={false} />
        </div>
        
        <FilterDrawer isOpen={manageDrawerOpen} onClose={() => setManageDrawerOpen(false)} filters={manageFilters} setFilters={setManageFilters} globalLogic={manageGlobalLogic} setGlobalLogic={setManageGlobalLogic} propertyOptions={managePropertyOptions} />
      </div>
    );
  }

  // --- CREATE / EDIT GROUP FALLBACK VIEW ---
  return (
    <div className="mgmt">
      <div className="topbar" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div className="left" style={{ display: 'flex', flexDirection: 'column' }}>
            <h2 style={{ margin: 0, fontSize: "22px", fontWeight: 600, color: "var(--text)" }}>{isEditing ? "Edit Computer Group" : "Create Computer Group"}</h2>
            <div className="sub mt-4 text-13 muted-text">Updated: {lastUpdated || "—"}</div>
        </div>
        <div className="right flex-row gap-12 items-center">
            {groupType === 'Manual' && (
              <>
                <div style={{ position: 'relative' }}>
                    <button type="button" className="iconbtn" onClick={() => setDrawerOpen(true)} title="Filter Data">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16"><line x1="4" y1="21" x2="4" y2="14"></line><line x1="4" y1="10" x2="4" y2="3"></line><line x1="12" y1="21" x2="12" y2="12"></line><line x1="12" y1="8" x2="12" y2="3"></line><line x1="20" y1="21" x2="20" y2="16"></line><line x1="20" y1="12" x2="20" y2="3"></line><line x1="1" y1="14" x2="7" y2="14"></line><line x1="9" y1="8" x2="15" y2="8"></line><line x1="17" y1="16" x2="23" y2="16"></line></svg>
                    </button>
                    {activeFilterCount > 0 && <span className="pill blue" style={{ position: 'absolute', top: -8, right: -8, padding: '2px 6px', fontSize: 10 }}>{activeFilterCount}</span>}
                </div>
                <button type="button" className="iconbtn" onClick={fetchComputers} title="Refresh Data">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16"><path d="M23 4v6h-6"></path><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path></svg>
                </button>
              </>
            )}
        </div>
      </div>

      <div className="section overflow-visible">
        <div className="section-head"><span className="title">1. Group Settings</span></div>
        <div className="controls-grid auto-1fr">
          <div className="field min-w-200">
            <span className="label">Group Type</span>
            <div className={`toggle-bg ${isEditing ? 'disabled' : ''}`}>
              <button type="button" disabled={isEditing} className={`toggle-btn ${groupType === "Automatic" ? "active" : ""}`} onClick={() => setGroupType("Automatic")}>Automatic</button>
              {isMO && <button type="button" disabled={isEditing} className={`toggle-btn ${groupType === "Manual" ? "active" : ""}`} onClick={() => setGroupType("Manual")}>Manual</button>}
              <button type="button" disabled={isEditing} className={`toggle-btn ${groupType === "ServerBased" ? "active" : ""}`} onClick={() => setGroupType("ServerBased")}>Server Based</button>
            </div>
          </div>
          <div className="field">
            <span className="label">Group Name</span>
            <div className="inputwrap">
              <input type="text" className="control" placeholder="e.g., Windows 10 Patch Group" value={groupName} onChange={(e) => { setGroupName(e.target.value); }} disabled={creating} />
            </div>
          </div>
        </div>
      </div>

      {(groupType === "Automatic" || groupType === "ServerBased") && (
        <div className="section overflow-visible">
          <div className="section-head"><span className="title">2. Define Property Criteria</span></div>
          <div className="flex-row items-end p-20 gap-16 wrap">
            <div className="flex-1 min-w-200">
              <FancySelect label="Property" options={properties} value={selectedProperty} onChange={setSelectedProperty} placeholder="— Select Property —" isLoading={loadingProps} searchable={true} />
            </div>
            <div style={{ flex: 0.7, minWidth: 140 }}>
              <FancySelect label="Comparison" options={operators} value={selectedOperator} onChange={setSelectedOperator} placeholder="Contains" />
            </div>
            <div className="field flex-1 min-w-200">
              <span className="label">Search Text</span>
              <div className="inputwrap">
                <input type="text" className="control" placeholder="e.g., rhel" value={valueInput} onChange={(e) => setValueInput(e.target.value)} />
              </div>
            </div>
            <div className="pb-0"><button type="button" className="btn outline small" style={{ height: '32px' }} onClick={addCondition}>Add</button></div>
          </div>
          <div className="flex-row" style={{ padding: '0 20px 20px 20px' }}>
             <div className="flex-1">
               <FancySelect 
                  label="Target Site (Custom)" 
                  options={customSites} 
                  value={selectedTargetSite} 
                  onChange={setSelectedTargetSite} 
                  placeholder="— Select Target Site —" 
                  isLoading={loadingSites} 
                  searchable={true} 
                  disabled={isEditing} 
               />
             </div>
          </div>
          <ConditionsTable 
            conditions={conditions} 
            logicOptions={logicOptions} 
            groupLogic={groupLogic} 
            setGroupLogic={setGroupLogic} 
            selectedTargetSite={selectedTargetSite} 
            removeCondition={removeCondition} 
          />
        </div>
      )}

      {groupType === "Manual" && (
        <div className="section overflow-visible">
          {activeFilterCount > 0 && (
              <div className="p-0-20-20">
                  <div className="active-filter-banner active">
                    <div className="filter-tags">
                      {filters.map((b) => {
                        const validConds = b.conds.filter(c => c.value);
                        if (!validConds.length) return null;
                        const blockKey = b.conds.map(c => `${c.column}-${c.operator}-${c.value}`).join('|');
                        return (
                          <div key={blockKey} style={{display:'inline-flex', alignItems:'center'}}>
                            <span style={{fontSize:12, fontWeight:600, color:'var(--primary)', margin:'0 8px'}}>{globalLogic}</span>
                            {validConds.map((c) => {
                              const condKey = `${c.column}-${c.operator}-${c.value}`;
                              return (
                                <span key={condKey} style={{display:'inline-flex', alignItems:'center'}}>
                                  <span style={{fontSize:11, fontWeight:600, color:'var(--primary)', margin:'0 6px'}}>AND</span>
                                  <span className="filter-tag"><strong>{propertyOptions.find(o => o.value === c.column)?.label || c.column}</strong>&nbsp;{c.operator}&nbsp;<strong>'{c.value}'</strong></span>
                                </span>
                              );
                            })}
                          </div>
                        );
                      })}
                    </div>
                    <button type="button" className="btn outline" onClick={() => setFilters([])}>Clear Filters</button>
                  </div>
              </div>
          )}

          <div className="section-head" style={{ paddingBottom: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span className="title">2. Select Computers</span>
              <span className="pill soft">Selected: {selectedCompIds.size}</span>
            </div>
            <div style={{ display: 'flex', gap: '12px' }}>
                <div className="dropdown" ref={colRef}>
                    <button type="button" className="btn outline sec small" onClick={() => { setShowColDrop(!showColDrop); setShowExpDrop(false); }}>
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16"><line x1="8" y1="6" x2="21" y2="6"></line><line x1="8" y1="12" x2="21" y2="12"></line><line x1="8" y1="18" x2="21" y2="18"></line><line x1="3" y1="6" x2="3.01" y2="6"></line><line x1="3" y1="12" x2="3.01" y2="12"></line><line x1="3" y1="18" x2="3.01" y2="18"></line></svg>
                        &nbsp; Columns
                    </button>
                    {showColDrop && (
                        <div className="dropdown-menu show" style={{ minWidth: "220px", padding: "12px", right: 0 }}>
                            <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                                {cols.map((col, i) => (
                                    <label key={col.id} style={{ display: "flex", alignItems: "center", gap: "10px", cursor: "pointer", padding: "6px 12px", borderRadius: "4px", transition: "0.2s" }} onMouseOver={e=>e.currentTarget.style.background="#f8fafc"} onFocus={e=>e.currentTarget.style.background="#f8fafc"} onMouseOut={e=>e.currentTarget.style.background="transparent"} onBlur={e=>e.currentTarget.style.background="transparent"}>
                                        <input type="checkbox" className="custom-checkbox" checked={col.show} onChange={e => {
                                            const next = [...cols]; next[i].show = e.target.checked; setCols(next);
                                        }} />
                                        <span style={{ fontSize: "13px", fontWeight: 500 }}>{col.label}</span>
                                    </label>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
                <div className="dropdown" ref={expRef}>
                    <button type="button" className="btn outline small" onClick={() => { setShowExpDrop(!showExpDrop); setShowColDrop(false); }}>
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16"><path d="M23 4v6h-6"></path><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path></svg>
                        &nbsp; Export
                    </button>
                    {showExpDrop && (
                        <div className="dropdown-menu show" style={{ width: "280px", padding: "16px", right: 0 }}>
                            <div style={{ fontSize: "11px", fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", marginBottom: "12px", letterSpacing: '0.05em' }}>Format</div>
                            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "8px", marginBottom: "20px" }}>
                               {['CSV', 'PDF', 'HTML', 'TXT', 'JSON', 'XML'].map(fmt => (
                                 <button type="button" key={fmt} className={`btn small ${exportFormat === fmt ? 'pri' : 'outline'}`} style={{ fontSize: '11px', height: '32px', padding: 0 }} onClick={(e) => { e.stopPropagation(); setExportFormat(fmt); }}>{fmt}</button>
                               ))}
                            </div>
                            <div style={{ height: '1px', background: 'var(--border)', marginBottom: '16px' }}></div>
                            <div style={{ fontSize: "11px", fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", marginBottom: "12px", letterSpacing: '0.05em' }}>Scope</div>
                            <button type="button" className="item" onClick={() => handleExport('page')}>Current Page</button>
                            <button type="button" className="item" onClick={() => handleExport('filtered')}>Filtered Data</button>
                            <button type="button" className="item" onClick={() => handleExport('all')}>All Data</button>
                        </div>
                    )}
                </div>
            </div>
          </div>
          
          <div className="tableWrap h-400 border-top" style={{ borderRadius: 0, borderLeft: 'none', borderRight: 'none' }}>
             <ComputerSelectionTable 
               fetchingComp={fetchingComp} 
               paginatedComputers={paginatedComputers} 
               cols={cols} 
               handleSort={handleSort} 
               getSortIcon={getSortIcon} 
               toggleAllVisible={toggleAllVisible} 
               toggleComputer={toggleComputer} 
               selectedCompIds={selectedCompIds} 
             />
          </div>

          <Paginator total={sortedComputers.length} rpp={rowsPerPage} setRpp={setRowsPerPage} page={currentPage} setPage={setCurrentPage} edgeToEdge={false} />
        </div>
      )}

      <div className="action-bar" style={{ borderTop: '1px solid var(--border)' }}>
        <div className="spacer"></div>
        {isEditing && (
            <button type="button" className="btn outline min-w-140 mr-12" onClick={() => { resetForm(); setActiveTab('MANAGE'); }}>
                Cancel Edit
            </button>
        )}
        <button 
          type="button"
          className="btn pri min-w-140" 
          onClick={handleSaveGroup} 
          disabled={creating || !groupName || ((groupType==='Automatic' || groupType === 'ServerBased') && !conditions.length) || (groupType==='Manual' && !selectedCompIds.size)}
        >
          {saveBtnContent}
        </button>
      </div>

      {groupType === 'Manual' && (
         <FilterDrawer isOpen={drawerOpen} onClose={() => setDrawerOpen(false)} filters={filters} setFilters={setFilters} globalLogic={globalLogic} setGlobalLogic={setGlobalLogic} propertyOptions={propertyOptions} />
      )}
    </div>
  );
}

GroupManager.propTypes = {
  onClose: PropTypes.func.isRequired
};