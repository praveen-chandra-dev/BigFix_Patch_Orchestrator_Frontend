// src/components/UserManagement.jsx
import { useEffect, useState, useRef, useMemo } from "react";
import FilterDrawer from "./FilterDrawer";
import { performExport } from "../utils/exportUtils";
import FancySelect from "./common/FancySelect";
import Paginator from "./common/Paginator";
import InlineSpinner from "./common/InlineSpinner";

const API = window.env?.VITE_API_BASE || "http://localhost:5174";

async function apiFetch(url, options = {}) {
  const headers = {
    "Content-Type": "application/json",
    "x-user-role": sessionStorage.getItem("user_role") || "Admin",
    "x-active-user": sessionStorage.getItem("username"),
    ...(options.headers || {})
  };
  
  const r = await fetch(`${API}${url}`, { ...options, headers });
  let j;
  try { j = await r.json(); } catch (e) { j = { ok: false, error: "Failed to parse server response." }; }
  if (!r.ok || j.ok === false) throw new Error(j.error || j.message || `HTTP ${r.status}`);
  return j;
}

function fmtDate(iso) { try { return new Date(iso).toLocaleString(); } catch { return iso; } }

export default function UserManagement({ onClose, currentUserId }) {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [success, setSuccess] = useState("");
  
  const [addOpen, setAddOpen] = useState(false);
  const [newU, setNewU] = useState("");
  const [newP, setNewP] = useState("");
  const [newR, setNewR] = useState("Admin");
  const [adding, setAdding] = useState(false);
  const [availableRoles, setAvailableRoles] = useState([]);

  const isLdapUser = newU.includes("@");

  

  const [editingUserId, setEditingUserId] = useState(null);
  // const [editRoleValue, setEditRoleValue] = useState("");
  const [editRoleValue, setEditRoleValue] = useState([]);

  const [isUpdating, setIsUpdating] = useState(false);
  const [isRoleMenuOpen, setIsRoleMenuOpen] = useState(false);

  const [currentPage, setCurrentPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [sortConfig, setSortConfig] = useState({ key: null, direction: "asc" });
  const [showColDrop, setShowColDrop] = useState(false);
  const [showExpDrop, setShowExpDrop] = useState(false);
  const [exportFormat, setExportFormat] = useState('CSV');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [globalLogic, setGlobalLogic] = useState("AND");
  const [filters, setFilters] = useState([]);

  // NEW STATE FOR PASSWORD RESET MODAL
  const [resetModal, setResetModal] = useState({ open: false, user: '' });
  const [resetPass, setResetPass] = useState("");
  const [resetOptLocal, setResetOptLocal] = useState(true);
  const [resetOptBF, setResetOptBF] = useState(true);
  const [resetting, setResetting] = useState(false);

  const colRef = useRef(null);
  const expRef = useRef(null);



  const [cols, setCols] = useState([
    { id: 'UserID', label: 'User ID', show: true },
    { id: 'LoginName', label: 'Login Name', show: true },
    { id: 'Role', label: 'Current Role', show: true },
    { id: 'UpdateRole', label: 'Change Role', show: true }, // NEW COLUMN
    { id: 'CreatedAt', label: 'Created At', show: true }
  ]);

  const propertyOptions = useMemo(() => [
    { value: "UserID", label: "User ID" },
    { value: "LoginName", label: "Login Name" },
    { value: "Role", label: "Role" },
    { value: "CreatedAt", label: "Created At" }
  ], []);

  const roleOptions = useMemo(() => {
    return [
      { value: "Admin", label: "Admin (Patch Setu)" },
      ...availableRoles.filter(r => r !== 'Admin').map(r => ({ value: r, label: r }))
    ];
  }, [availableRoles]);

  useEffect(() => {
    fetchUsers();
    apiFetch("/api/auth/all-roles").then(d => {
        if (d.ok && d.roles) {
            setAvailableRoles(d.roles);
        }
    }).catch(() => {});
  }, []);

  useEffect(() => {
    const handleOutside = (e) => {
      if (colRef.current && !colRef.current.contains(e.target)) setShowColDrop(false);
      if (expRef.current && !expRef.current.contains(e.target)) setShowExpDrop(false);
    };
    document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, []);

  function fetchUsers() {
    setLoading(true); setErr("");
    apiFetch('/api/auth/users').then(d => { setUsers(d.users || []); setLoading(false); }).catch(e => { setErr(e.message); setLoading(false); });
  }

  async function handleDelete(id) {
    if (!window.confirm("Are you sure you want to delete this user?")) return;
    setErr("");
    try {
      await apiFetch(`/api/auth/users/${id}`, { method: 'DELETE', body: JSON.stringify({ currentUserId }) });
      setUsers(u => u.filter(x => x.UserID !== id));
      setSuccess("User deleted successfully.");
      setTimeout(() => setSuccess(""), 3000);
    } catch (e) { setErr(e.message); }
  }

async function submitPasswordReset(e) {
    e.preventDefault();
    if (!resetOptLocal && !resetOptBF) return setErr("Please select at least one system to reset.");
    if (!resetPass) return setErr("New password is required.");

    setErr("");
    setResetting(true);
    try {
      const res = await apiFetch(`/api/auth/reset-password`, {
        method: 'POST',
        body: JSON.stringify({ 
            username: resetModal.user, 
            newPassword: resetPass,
            resetLocal: resetOptLocal,
            resetBigFix: resetOptBF
        })
      });
      setSuccess(res.message || `Password for ${resetModal.user} reset successfully.`);
      setTimeout(() => setSuccess(""), 4000);
      
      // Close and clear modal
      setResetModal({ open: false, user: '' });
      setResetPass("");
    } catch (e) {
      setErr(e.message);
    } finally {
      setResetting(false);
    }
  }


  async function handleRoleUpdate(userId, newRole) {
    if (!window.confirm(`Are you sure you want to change this user's role to ${newRole}?`)) return;
    
    setErr("");
    try {
      const res = await apiFetch(`/api/auth/users/${userId}/role`, { 
          method: 'PUT', 
          body: JSON.stringify({ role: newRole }) 
      });
      
      // Update the local state so the UI reflects the change immediately
      setUsers(u => u.map(x => x.UserID === userId ? { ...x, Role: newRole } : x));
      
      setSuccess(res.message || `Role updated to ${newRole} successfully.`);
      setTimeout(() => setSuccess(""), 4000);
    } catch (e) { 
      setErr(e.message); 
    }
  }

 async function submitRoleUpdate(userId) {
    const originalRoleStr = users.find(u => u.UserID === userId)?.Role || "";
    const originalRoles = originalRoleStr !== 'No Role Assigned' ? originalRoleStr.split(',').map(r => r.trim()) : [];
    
    const selectedRoles = editRoleValue; 

    const sortedOriginal = [...originalRoles].sort().join(',');
    const sortedNew = [...selectedRoles].sort().join(',');

    if (sortedOriginal === sortedNew) {
      setEditingUserId(null);
      return; 
    }
    
    setErr("");
    setIsUpdating(true); // START LOADING
    
    try {
      const res = await apiFetch(`/api/auth/users/${userId}/role`, { 
          method: 'PUT', 
          body: JSON.stringify({ roles: selectedRoles }) 
      });
      
      const updatedRoleString = selectedRoles.length > 0 ? selectedRoles.join(', ') : 'No Role Assigned';

      setUsers(u => u.map(x => x.UserID === userId ? { ...x, Role: updatedRoleString } : x));
      setSuccess(res.message || `Roles updated successfully.`);
      setTimeout(() => setSuccess(""), 4000);
      setEditingUserId(null); // Close editor on success
    } catch (e) { 
      setErr(e.message); 
    } finally {
      setIsUpdating(false); // STOP LOADING
    }
  }

  async function handleAdd(e) {
    e.preventDefault();
    setErr(""); setSuccess("");
    if (!newU.trim()) return setErr("Username required.");
    if (!isLdapUser && !newP) return setErr("Password is required for local users.");

    setAdding(true);
    try {
      const res = await apiFetch('/api/auth/admin/add-user', { 
          method: 'POST', 
          body: JSON.stringify({ username: newU.trim(), role: newR, password: newP }) 
      });
      setNewU(""); setNewP(""); setNewR("Admin"); setAddOpen(false); fetchUsers();
      setSuccess(res.message || "User added successfully.");
      setTimeout(() => setSuccess(""), 4000);
    } catch (e) { setErr(e.message); } finally { setAdding(false); }
  }

  const applyFilters = (row) => {
    if (!filters.length) return true;
    let globalMatch = globalLogic === "OR" ? false : true;
    for (let b of filters) {
      let blockMatch = true; let validConds = 0;
      for (let c of b.conds) {
        if (!c.value) continue;
        validConds++; let condition = true;
        const search = String(c.value).toLowerCase();
        let field = "";
        
        if (c.column === "CreatedAt") field = fmtDate(row.CreatedAt).toLowerCase();
        else field = String(row[c.column] || "").toLowerCase();

        if (c.operator === "contains") condition = field.includes(search);
        else if (c.operator === "=") condition = field === search;
        else if (c.operator === "!=") condition = field !== search;
        blockMatch = blockMatch && condition;
      }
      if (validConds > 0) globalMatch = globalLogic === "OR" ? (globalMatch || blockMatch) : (globalMatch && blockMatch);
    }
    return globalMatch;
  };

  const visibleData = useMemo(() => users.filter(applyFilters), [users, filters, globalLogic]);

  const sortedData = useMemo(() => {
    let sortableItems = [...visibleData];
    if (sortConfig.key) {
      sortableItems.sort((a, b) => {
        let aVal = a[sortConfig.key] || "";
        let bVal = b[sortConfig.key] || "";
        
        if (sortConfig.key === 'UserID') {
            return sortConfig.direction === "asc" ? Number(aVal) - Number(bVal) : Number(bVal) - Number(aVal);
        }
        
        if (sortConfig.key === 'CreatedAt') {
            aVal = new Date(aVal).getTime();
            bVal = new Date(bVal).getTime();
        } else {
            aVal = String(aVal).toLowerCase();
            bVal = String(bVal).toLowerCase();
        }

        if (aVal < bVal) return sortConfig.direction === "asc" ? -1 : 1;
        if (aVal > bVal) return sortConfig.direction === "asc" ? 1 : -1;
        return 0;
      });
    }
    return sortableItems;
  }, [visibleData, sortConfig]);

  const paginatedData = sortedData.slice((currentPage - 1) * rowsPerPage, currentPage * rowsPerPage);

  const handleSort = (key) => setSortConfig(prev => ({ key, direction: prev.key === key && prev.direction === "asc" ? "desc" : "asc" }));
  const getSortIcon = (key) => {
    if (sortConfig.key !== key) return <span className="muted-text ml-6">↕</span>;
    return <span className="ml-6">{sortConfig.direction === "asc" ? "↑" : "↓"}</span>;
  };

  const activeFilterCount = filters.reduce((acc, b) => acc + b.conds.filter(c => c.value).length, 0);

  const handleExport = (scope) => { 
    setShowExpDrop(false); 
    let dataToExport = [];
    if (scope === 'page') dataToExport = paginatedData;
    else if (scope === 'filtered') dataToExport = sortedData;
    else dataToExport = users;

    performExport(dataToExport, cols, exportFormat, "users_export", (r, c) => {
        if (c === 'CreatedAt') return fmtDate(r[c]);
        return r[c];
    });
  };

  return (
    <div className="mgmt">
      <div className="topbar" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div className="left" style={{ display: 'flex', flexDirection: 'column' }}>
            <h2 style={{ margin: 0, fontSize: "22px", fontWeight: 600, color: "var(--text)" }}>User Management</h2>
        </div>
        <div className="right flex-row gap-12 items-center">
            <div style={{ position: 'relative' }}>
                <button className="iconbtn" onClick={() => setDrawerOpen(true)} title="Filter Data">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16"><line x1="4" y1="21" x2="4" y2="14"></line><line x1="4" y1="10" x2="4" y2="3"></line><line x1="12" y1="21" x2="12" y2="12"></line><line x1="12" y1="8" x2="12" y2="3"></line><line x1="20" y1="21" x2="20" y2="16"></line><line x1="20" y1="12" x2="20" y2="3"></line><line x1="1" y1="14" x2="7" y2="14"></line><line x1="9" y1="8" x2="15" y2="8"></line><line x1="17" y1="16" x2="23" y2="16"></line></svg>
                </button>
                {activeFilterCount > 0 && <span className="pill blue" style={{ position: 'absolute', top: -8, right: -8, padding: '2px 6px', fontSize: 10 }}>{activeFilterCount}</span>}
            </div>
            <button className="iconbtn" onClick={fetchUsers} title="Refresh Data">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16"><path d="M23 4v6h-6"></path><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path></svg>
            </button>
            <button className="btn outline sec" onClick={onClose}>Close</button>
        </div>
      </div>

      <div className="p-0-20-10">
        {err && <div className="banner error">{err}</div>}
        {success && <div className="banner success">{success}</div>}
      </div>

      {/* NEW RESET PASSWORD MODAL */}
      {resetModal.open && (
        <div className="section mb-20" style={{ border: '1px solid var(--primary)', background: '#f8fafc' }}>
          <div className="section-head" style={{ background: '#e2e8f0' }}>
              <span className="title">Reset Password: <strong style={{ color: 'var(--primary)' }}>{resetModal.user}</strong></span>
          </div>
          <form onSubmit={submitPasswordReset} className="flex-col gap-16 p-20">
            <div className="field">
              <span className="label">New Password</span>
              <input 
                  className="control" 
                  type="text" 
                  value={resetPass} 
                  onChange={e => setResetPass(e.target.value)} 
                  disabled={resetting} 
                  placeholder="Enter new password" 
                  required 
              />
            </div>
            
            <div className="flex-row gap-20">
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                    <input 
                        type="checkbox" 
                        checked={resetOptLocal} 
                        onChange={e => setResetOptLocal(e.target.checked)} 
                        disabled={resetting} 
                    />
                    <span style={{ fontSize: '13px', fontWeight: 500 }}>Reset Patch Setu Login</span>
                </label>

                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                    <input 
                        type="checkbox" 
                        checked={resetOptBF} 
                        onChange={e => setResetOptBF(e.target.checked)} 
                        disabled={resetting} 
                    />
                    <span style={{ fontSize: '13px', fontWeight: 500 }}>Reset BigFix Operator Password</span>
                </label>
            </div>

            <div className="pb-0" style={{ display: 'flex', gap: '8px', marginTop: '10px' }}>
              <button type="submit" className="btn pri small min-w-100" style={{ height: '32px' }} disabled={resetting}>
                  {resetting ? "Resetting..." : "Confirm Reset"}
              </button>
              <button type="button" className="btn ghost small min-w-100" style={{ height: '32px' }} onClick={() => setResetModal({ open: false, user: '' })} disabled={resetting}>
                  Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {addOpen && (
        <div className="section mb-20">
          <div className="section-head"><span className="title">Add New User</span></div>
          <form onSubmit={handleAdd} className="flex-row gap-16 items-start p-20 wrap">
            <div className="field flex-1">
              <span className="label">BigFix / AD Username</span>
              <input className="control" type="text" value={newU} onChange={e=>setNewU(e.target.value)} disabled={adding} placeholder="e.g. jdoe@domain.com or localadmin" />
              <div className="text-11 muted-text mt-4" style={{ color: isLdapUser ? '#2e7d32' : 'var(--muted)' }}>
                  {isLdapUser ? "✓ LDAP User detected. Will link to Active Directory." : "Local User detected. Password required."}
              </div>
            </div>
            
            {!isLdapUser && newU.length > 0 && (
                <div className="field flex-1">
                    <span className="label">Local Password</span>
                    <input className="control" type="password" value={newP} onChange={e=>setNewP(e.target.value)} disabled={adding} placeholder="Enter password" required />
                </div>
            )}

            <div style={{ marginTop: '22px', flex: 1 }}>
                <FancySelect 
                   options={roleOptions}
                   value={newR}
                   onChange={setNewR}
                   disabled={adding}
                   searchable={true}
                />
            </div>
            
            <div className="pb-0" style={{ display: 'flex', gap: '8px', marginTop: '22px' }}>
              <button type="submit" className="btn pri small min-w-100" style={{ height: '32px' }} disabled={adding}>{adding?"Adding...":"Confirm"}</button>
              <button type="button" className="btn ghost small min-w-100" style={{ height: '32px' }} onClick={()=>{setAddOpen(false); setNewU(""); setNewP(""); setNewR("Admin");}} disabled={adding}>Cancel</button>
            </div>
          </form>
        </div>
      )}

      {/* <div className="section flex-col flex-1 overflow-hidden" style={{ borderRadius: '8px', border: '1px solid var(--border)' }}> */}
      <div className="section flex-col flex-1" style={{ borderRadius: '8px', border: '1px solid var(--border)', overflow: 'visible' }}>
          {activeFilterCount > 0 && (
              <div className="p-0-20-20 mt-20">
                  <div className="active-filter-banner active">
                    <div className="filter-tags">
                      {filters.map((b, bIdx) => {
                        const validConds = b.conds.filter(c => c.value);
                        if (!validConds.length) return null;
                        return (
                          <div key={bIdx} style={{display:'inline-flex', alignItems:'center'}}>
                            {bIdx > 0 && <span style={{fontSize:12, fontWeight:600, color:'var(--primary)', margin:'0 8px'}}>{globalLogic}</span>}
                            {validConds.map((c, cIdx) => (
                              <span key={cIdx} style={{display:'inline-flex', alignItems:'center'}}>
                                {cIdx > 0 && <span style={{fontSize:11, fontWeight:600, color:'var(--primary)', margin:'0 6px'}}>AND</span>}
                                <span className="filter-tag"><strong>{propertyOptions.find(o => o.value === c.column)?.label || c.column}</strong>&nbsp;{c.operator}&nbsp;<strong>'{c.value}'</strong></span>
                              </span>
                            ))}
                          </div>
                        );
                      })}
                    </div>
                    <button className="btn outline" onClick={() => setFilters([])}>Clear Filters</button>
                  </div>
              </div>
          )}

          <div className="section-head" style={{ padding: '16px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span className="title" style={{ fontSize: '15px' }}>Registered Users</span>
              <span className="pill soft">Total: {sortedData.length}</span>
            </div>
            <div style={{ display: 'flex', gap: '12px' }}>
                {!addOpen && <button className="btn pri small" onClick={()=>setAddOpen(true)}>+ Add User</button>}
                
                <div className="dropdown" ref={colRef}>
                    <button className="btn outline sec small" onClick={() => { setShowColDrop(!showColDrop); setShowExpDrop(false); }}>
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16"><line x1="8" y1="6" x2="21" y2="6"></line><line x1="8" y1="12" x2="21" y2="12"></line><line x1="8" y1="18" x2="21" y2="18"></line><line x1="3" y1="6" x2="3.01" y2="6"></line><line x1="3" y1="12" x2="3.01" y2="12"></line><line x1="3" y1="18" x2="3.01" y2="18"></line></svg>
                        &nbsp; Columns
                    </button>
                    {showColDrop && (
                        <div className="dropdown-menu show" style={{ minWidth: "220px", padding: "12px", right: 0 }}>
                            <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                                {cols.map((col, i) => (
                                    <label key={col.id} style={{ display: "flex", alignItems: "center", gap: "10px", cursor: "pointer", padding: "6px 12px", borderRadius: "4px", transition: "0.2s" }} onMouseOver={e=>e.currentTarget.style.background="#f8fafc"} onMouseOut={e=>e.currentTarget.style.background="transparent"}>
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
                    <button className="btn outline small" onClick={() => { setShowExpDrop(!showExpDrop); setShowColDrop(false); }}>
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"></path></svg>
                        &nbsp; Export
                    </button>
                    {showExpDrop && (
                        <div className="dropdown-menu show" style={{ width: "280px", padding: "16px", right: 0 }}>
                            <div style={{ fontSize: "11px", fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", marginBottom: "12px", letterSpacing: '0.05em' }}>Format</div>
                            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "8px", marginBottom: "20px" }}>
                               {['CSV', 'PDF', 'HTML', 'TXT', 'JSON', 'XML'].map(fmt => (
                                 <button key={fmt} className={`btn small ${exportFormat === fmt ? 'pri' : 'outline'}`} style={{ fontSize: '11px', height: '32px', padding: 0 }} onClick={(e) => { e.stopPropagation(); setExportFormat(fmt); }}>{fmt}</button>
                               ))}
                            </div>
                            <div style={{ height: '1px', background: 'var(--border)', marginBottom: '16px' }}></div>
                            <div style={{ fontSize: "11px", fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", marginBottom: "12px", letterSpacing: '0.05em' }}>Scope</div>
                            <button className="item" onClick={() => handleExport('page')}>Current Page</button>
                            <button className="item" onClick={() => handleExport('filtered')}>Filtered Data</button>
                            <button className="item" onClick={() => handleExport('all')}>All Data</button>
                        </div>
                    )}
                </div>
            </div>
          </div>

          {/* <div className="tableWrap flex-1 m-0 border-top border-bottom" style={{ borderRadius: 0, borderLeft: 'none', borderRight: 'none' }}> */}
          {/* <div className="tableWrap flex-1 m-0 border-top border-bottom" style={{ borderRadius: 0, borderLeft: 'none', borderRight: 'none', overflow: 'visible' }}> */}
              <div className="tableWrap flex-1 m-0 border-top border-bottom" style={{ borderRadius: 0, borderLeft: 'none', borderRight: 'none', overflow: 'auto', paddingBottom: editingUserId ? '200px' : '0' }}>            
                {loading ? (
                <div className="sub empty-state" style={{ padding: '40px', textAlign: 'center' }}>Loading users...</div>
            ) : paginatedData.length === 0 ? (
                <div className="sub empty-state" style={{ padding: '40px', textAlign: 'center' }}>No users found.</div>
            ) : (
              <table>
                {/* <thead className="kpi-th-sticky">
                  <tr>
                    {cols.find(c=>c.id==='UserID')?.show && <th className="cursor-pointer" onClick={() => handleSort('UserID')}>User ID{getSortIcon('UserID')}</th>}
                    {cols.find(c=>c.id==='LoginName')?.show && <th className="cursor-pointer" onClick={() => handleSort('LoginName')}>Login Name{getSortIcon('LoginName')}</th>}
                    {cols.find(c=>c.id==='Role')?.show && <th className="cursor-pointer" onClick={() => handleSort('Role')}>Role{getSortIcon('Role')}</th>}
                    {cols.find(c=>c.id==='CreatedAt')?.show && <th className="cursor-pointer" onClick={() => handleSort('CreatedAt')}>Created At{getSortIcon('CreatedAt')}</th>}
                    <th className="right">Actions</th>
                  </tr>
                </thead> */}
                <thead className="kpi-th-sticky">
                  <tr>
                    {cols.find(c=>c.id==='UserID')?.show && <th className="cursor-pointer" onClick={() => handleSort('UserID')}>User ID{getSortIcon('UserID')}</th>}
                    {cols.find(c=>c.id==='LoginName')?.show && <th className="cursor-pointer" onClick={() => handleSort('LoginName')}>Login Name{getSortIcon('LoginName')}</th>}
                    
                    {/* Updated Role Header */}
                    {cols.find(c=>c.id==='Role')?.show && <th className="cursor-pointer" onClick={() => handleSort('Role')}>Current Role{getSortIcon('Role')}</th>}
                    
                    {/* New Change Role Header */}
                    {cols.find(c=>c.id==='UpdateRole')?.show && <th>Change Role</th>}
                    {cols.find(c=>c.id==='CreatedAt')?.show && <th className="cursor-pointer" onClick={() => handleSort('CreatedAt')}>Created At{getSortIcon('CreatedAt')}</th>}
                    <th className="right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedData.map(u => (
                    <tr key={u.UserID}>
                      {cols.find(c=>c.id==='UserID')?.show && <td><b>{u.UserID}</b></td>}
                      {cols.find(c=>c.id==='LoginName')?.show && <td>{u.LoginName}</td>}
                      {/* {cols.find(c=>c.id==='Role')?.show && <td><span className={u.Role === 'Admin' ? 'pill purple' : 'pill soft'}>{u.Role}</span></td>} */}
                      {/* 1. The original display column (Restored to just show the pill) */}
                      {/* {cols.find(c=>c.id==='Role')?.show && <td>
                          <span className={u.Role === 'Admin' ? 'pill purple' : 'pill soft'}>{u.Role}</span>
                      </td>} */}
                      {cols.find(c=>c.id==='Role')?.show && <td>
                        <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                            {u.Role ? u.Role.split(',').map(r => r.trim()).map(r => (
                                <span key={r} className={r === 'Admin' ? 'pill purple' : 'pill soft'}>{r}</span>
                            )) : <span className="muted-text text-11">None</span>}
                        </div>
                    </td>}

                      
{/* 2. The interactive column using FancySelect for Multi-Select */}
{cols.find(c=>c.id==='UpdateRole')?.show && <td>
  {[9002, 9003, 9004].includes(u.UserID) || u.UserID === currentUserId ? (
    <span className="muted-text text-11" style={{ paddingLeft: '8px' }}>Cannot change</span>
  ) : editingUserId === u.UserID ? (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', minWidth: '320px' }}>
      
      {/* Use FancySelect exactly as you do in BaselineManager */}
      <div style={{ flex: 1, position: 'relative', zIndex: 9999 }}>
        <FancySelect 
          options={roleOptions.map(opt => opt.value)} // Extract just the string values for the options
          value={editRoleValue}                       // Pass the array of selected string values
          onChange={setEditRoleValue}                 // Updates the array state
          placeholder="— Select Roles —"
          multiSelect={true}      
          menuPlacement="bottom"                    // Enable checkbox mode!
        />
      </div>

      {/* Save and Cancel Buttons */}
      
      <div style={{ display: 'flex', gap: '6px', marginTop: '2px' }}>
        <button 
          className="btn pri small flex-row items-center justify-center" 
          style={{ width: '30px', height: '30px', padding: 0 }} 
          onClick={() => submitRoleUpdate(u.UserID)}
          disabled={isUpdating}
          title="Save"
        >
          {isUpdating ? <InlineSpinner size={14} variant="light" /> : "✓"}
        </button>
        <button 
          className="btn outline sec small flex-row items-center justify-center" 
          style={{ width: '30px', height: '30px', padding: 0 }} 
          onClick={() => setEditingUserId(null)}
          disabled={isUpdating}
          title="Cancel"
        >
          ✕
        </button>
      </div>
      
    </div>
  ) : (
    <button 
      className="btn outline sec small" 
      onClick={() => { 
          setEditingUserId(u.UserID); 
          // Pre-fill the state with an array of the current role strings
          const currentRoles = u.Role && u.Role !== 'No Role Assigned' ? u.Role.split(',').map(r => r.trim()) : [];
          setEditRoleValue(currentRoles); 
      }}
    >
      Change Role
    </button>
  )}
</td>}
                      {cols.find(c=>c.id==='CreatedAt')?.show && <td>{fmtDate(u.CreatedAt)}</td>}
                 
                      <td className="right">
                        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', alignItems: 'center' }}>
                          {[9002, 9003, 9004].includes(u.UserID) || u.UserID === currentUserId ? (
                            <span className="sub" style={{ paddingRight: '8px' }}>Protected</span>
                          ) : (
                            <>
                              {/* CHECK FOR LDAP USER HERE */}
                              {u.LoginName.includes('@') ? (
                                <button 
                                  className="btn outline sec small" 
                                  disabled 
                                  style={{ opacity: 0.5, cursor: 'not-allowed' }} 
                                  title="LDAP users must reset passwords via Active Directory"
                                >
                                  LDAP Sync
                                </button>
                              ) : (
                                  <button 
                                    className="btn outline sec small" 
                                    onClick={() => {
                                        setResetModal({ open: true, user: u.LoginName });
                                        setResetPass("");
                                        setResetOptLocal(true);
                                        setResetOptBF(true);
                                    }} 
                                    title="Reset Password"
                                  >
                                    Reset Pass
                                  </button>
                              )}

                              <button className="btn-icon-sm" onClick={() => handleDelete(u.UserID)} title="Delete User">✕</button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
          
          <Paginator total={sortedData.length} rpp={rowsPerPage} setRpp={setRowsPerPage} page={currentPage} setPage={setCurrentPage} edgeToEdge={false} />
      </div>
      
      <FilterDrawer isOpen={drawerOpen} onClose={() => setDrawerOpen(false)} filters={filters} setFilters={setFilters} globalLogic={globalLogic} setGlobalLogic={setGlobalLogic} propertyOptions={propertyOptions} />
    </div>
  );
}