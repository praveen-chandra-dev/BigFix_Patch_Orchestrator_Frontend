// src/components/UserManagement.jsx
import { useEffect, useState, useRef, useMemo } from "react";
import FilterDrawer from "./FilterDrawer";

const API = window.env?.VITE_API_BASE || "http://localhost:5174";

async function apiFetch(url, options = {}) {
  const r = await fetch(`${API}${url}`, options);
  let j;
  try { j = await r.json(); } catch (e) { j = { ok: false, error: "Failed to parse server response." }; }
  if (!r.ok || j.ok === false) throw new Error(j.error || j.message || `HTTP ${r.status}`);
  return j;
}

function fmtDate(iso) { try { return new Date(iso).toLocaleString(); } catch { return iso; } }

function performExport(dataToExport, columns, format, filenamePrefix, getVal = (row, colId) => row[colId]) {
    const visibleCols = columns.filter(c => c.show);
    const headers = visibleCols.map(c => c.label);
    const triggerDownload = (content, type, ext) => {
        const blob = new Blob([content], { type });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url; a.download = `${filenamePrefix}.${ext}`;
        a.click(); URL.revokeObjectURL(url);
    };
    if (format === 'JSON') {
        const json = dataToExport.map(row => { let obj = {}; visibleCols.forEach(c => obj[c.label] = getVal(row, c.id)); return obj; });
        triggerDownload(JSON.stringify(json, null, 2), "application/json", "json");
    } else if (format === 'XML') {
        let xml = '<?xml version="1.0" encoding="UTF-8"?><rows>\n';
        dataToExport.forEach(row => {
            xml += '  <row>\n';
            visibleCols.forEach(c => { const tag = c.label.replace(/[^a-zA-Z0-9]/g, '_'); xml += `    <${tag}>${getVal(row, c.id) || ''}</${tag}>\n`; });
            xml += '  </row>\n';
        });
        xml += '</rows>'; triggerDownload(xml, "application/xml", "xml");
    } else if (format === 'HTML') {
        let html = '<table border="1"><thead><tr>'; headers.forEach(h => html += `<th>${h}</th>`); html += '</tr></thead><tbody>';
        dataToExport.forEach(row => { html += '<tr>'; visibleCols.forEach(c => html += `<td>${getVal(row, c.id) || ''}</td>`); html += '</tr>'; });
        html += '</tbody></table>'; triggerDownload(html, "text/html", "html");
    } else if (format === 'TXT') {
        const txt = [headers.join('\t'), ...dataToExport.map(r => visibleCols.map(c => getVal(r, c.id) || '').join('\t'))].join('\n');
        triggerDownload(txt, "text/plain", "txt");
    } else if (format === 'PDF') {
        const loadScript = (src) => new Promise(resolve => {
            if (document.querySelector(`script[src="${src}"]`)) return resolve();
            const script = document.createElement('script'); script.src = src; script.onload = resolve; document.body.appendChild(script);
        });
        Promise.all([
            loadScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js'),
            loadScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.5.31/jspdf.plugin.autotable.min.js')
        ]).then(() => {
            const { jsPDF } = window.jspdf; const doc = new jsPDF();
            doc.text(`Export: ${filenamePrefix}`, 14, 15);
            const body = dataToExport.map(row => visibleCols.map(c => getVal(row, c.id) || ''));
            doc.autoTable({ head: [headers], body: body, startY: 20 }); doc.save(`${filenamePrefix}.pdf`);
        });
    } else { 
        const csv = [headers.join(','), ...dataToExport.map(r => visibleCols.map(c => `"${String(getVal(r, c.id) || '').replace(/"/g, '""')}"`).join(','))].join('\n');
        triggerDownload(csv, "text/csv", "csv");
    }
}

const FancySelect = ({ label, options, value, onChange, disabled, placeholder }) => {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef(null);

  useEffect(() => {
    function handleClickOutside(event) { if (wrapperRef.current && !wrapperRef.current.contains(event.target)) setOpen(false); }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const selectedOption = options.find(o => o === value);
  const displayText = selectedOption || placeholder;
  const isPlaceholder = !selectedOption;

  return (
    <div className="field w-full">
      {label && <div className="meta"><label>{label}</label></div>}
      <div className="inputwrap">
        <div className={`fx-wrap ${open ? "fx-open" : ""} ${disabled ? "disabled" : ""}`} ref={wrapperRef}>
          <button type="button" className="fx-trigger" onClick={() => setOpen(!open)}>
            <span className={`fx-value ${isPlaceholder ? "fx-placeholder" : ""}`}>{displayText}</span>
            <span className="fx-chevron">▾</span>
          </button>
          {open && (
            <div className="fx-menu">
              <div className="fx-menu-inner">
                {options.map((opt) => (
                  <div key={opt} className={`fx-item ${opt === value ? "fx-active" : ""}`} onClick={() => { onChange(opt); setOpen(false); }}>
                    <span className="fx-label">{opt}</span>
                    {opt === value && <span className="fx-tick">✓</span>}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default function UserManagement({ onClose, currentUserId }) {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [lastUpdated, setLastUpdated] = useState("");

  const currentRole = sessionStorage.getItem("user_role") || "Windows";
  const isAdmin = currentRole === "Admin";

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPass, setConfirmPass] = useState("");
  const [role, setRole] = useState("Windows"); 
  const [formError, setFormError] = useState("");
  const [formBusy, setFormBusy] = useState(false);
  
  const [userType, setUserType] = useState("Local"); 

  const [editingId, setEditingId] = useState(null);
  const [editRole, setEditRole] = useState("");
  const [editBusy, setEditBusy] = useState(false);

  const [currentPage, setCurrentPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [sortConfig, setSortConfig] = useState({ key: null, direction: "asc" });
  const [showColDrop, setShowColDrop] = useState(false);
  const [showExpDrop, setShowExpDrop] = useState(false);
  const [exportFormat, setExportFormat] = useState('CSV');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [globalLogic, setGlobalLogic] = useState("AND");
  const [filters, setFilters] = useState([]);
  
  const colRef = useRef(null);
  const expRef = useRef(null);

  const [cols, setCols] = useState([
    { id: 'LoginName', label: 'Username', show: true },
    { id: 'Role', label: 'Role', show: true },
    { id: 'CreatedAt', label: 'Created At', show: true }
  ]);

  const propertyOptions = [
    { value: "LoginName", label: "Username" },
    { value: "Role", label: "Role" },
    { value: "CreatedAt", label: "Created At" }
  ];

  const roleOptions = ["Windows", "Linux", "EUC", "Admin"];

  useEffect(() => {
    const handleOutside = (e) => {
      if (colRef.current && !colRef.current.contains(e.target)) setShowColDrop(false);
      if (expRef.current && !expRef.current.contains(e.target)) setShowExpDrop(false);
    };
    document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, []);

  async function fetchUsers() {
    if (!isAdmin) {
      setLoading(false);
      return;
    }
    
    setLoading(true); setError("");
    try { 
      const data = await apiFetch("/api/auth/users"); 
      setUsers(data.users || []); 
      setLastUpdated(new Date().toLocaleString());
    } 
    catch (e) { setError(e.message); } 
    finally { setLoading(false); }
  }

  useEffect(() => { fetchUsers(); }, [isAdmin]);

  async function handleCreateUser(e) {
    e.preventDefault(); setFormError("");
    if (!isAdmin) { setFormError("Permission Denied: Only Admins can create users."); return; }
    if (!username || !password) { setFormError("Username and password are required."); return; }
    if (password !== confirmPass) { setFormError("Passwords do not match."); return; }
    
    setFormBusy(true);
    try {
      const data = await apiFetch("/api/auth/signup", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username, password, role }), });
      const newUser = data.userData ? { ...data.userData, Role: role } : { UserID: data.userId, LoginName: username, Role: role, CreatedAt: new Date().toISOString() };
      setUsers([...users, newUser]);
      setUsername(""); setPassword(""); setConfirmPass(""); setRole("Windows"); 
    } catch (e) {
      setFormError(e.message === 'user_exists' ? 'User already exists.' : 'Failed to create user.');
    } finally { setFormBusy(false); }
  }

  async function handleCreateADUser(e) {
    e.preventDefault(); 
    setFormError("");
    
    if (!isAdmin) { setFormError("Permission Denied: Only Admins can add AD users."); return; }
    if (!username) { setFormError("Username is required."); return; }
    
    setFormBusy(true);
    try {
      const response = await apiFetch("/api/auth/admin/add-user", { 
        method: "POST", 
        headers: { "Content-Type": "application/json" }, 
        body: JSON.stringify({ username, role }) 
      });
      
      await fetchUsers(); 
      setUsername(""); 
      setRole("Windows"); 
      alert(response.message || "AD User added successfully!");
    } catch (e) {
      setFormError(e.message === 'user_exists' ? 'User already exists.' : 'Failed to add AD user: ' + e.message);
    } finally { 
      setFormBusy(false); 
    }
  }

  async function handleDeleteUser(userId) {
    if (!isAdmin) { alert("Permission Denied: Only Admins can delete users."); return; }
    if (Number(userId) === Number(currentUserId)) { alert("Error: You cannot delete your own account."); return; }
    if (!window.confirm("Are you sure you want to delete this user? This action cannot be undone.")) return;

    try {
      await apiFetch(`/api/auth/users/${userId}`, { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ currentUserId: currentUserId }) });
      setUsers(users.filter(u => u.UserID !== userId));
    } catch (e) { setError(`Failed to delete user: ${e.message}`); }
  }

  const startEditing = (user) => { setEditingId(user.UserID); setEditRole(user.Role); };
  const cancelEditing = () => { setEditingId(null); setEditRole(""); };

  const saveRole = async (userId) => {
    if (!editRole) return;
    setEditBusy(true);
    try {
      await apiFetch(`/api/auth/users/${userId}/role`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ role: editRole }) });
      setUsers(users.map(u => u.UserID === userId ? { ...u, Role: editRole } : u));
      setEditingId(null);
    } catch (e) { alert(`Failed to update role: ${e.message}`); } 
    finally { setEditBusy(false); }
  };

  const getPillClass = (r) => {
      if (r === 'Admin') return 'red';
      if (r === 'Linux') return 'amber';
      if (r === 'EUC') return 'blue'; 
      return 'green'; 
  };

  const applyFilters = (user) => {
    if (!filters.length) return true;
    let globalMatch = globalLogic === "OR" ? false : true;
    for (let b of filters) {
      let blockMatch = true; let validConds = 0;
      for (let c of b.conds) {
        if (!c.value) continue;
        validConds++; let condition = true;
        const search = String(c.value).toLowerCase();
        let field = String(user[c.column] || "").toLowerCase();
        if (c.operator === "contains") condition = field.includes(search);
        else if (c.operator === "=") condition = field === search;
        else if (c.operator === "!=") condition = field !== search;
        blockMatch = blockMatch && condition;
      }
      if (validConds > 0) globalMatch = globalLogic === "OR" ? (globalMatch || blockMatch) : (globalMatch && blockMatch);
    }
    return globalMatch;
  };

  const visibleUsers = users.filter(u => ![9002, 9003, 9004].includes(Number(u.UserID)));
  const filteredUsers = useMemo(() => visibleUsers.filter(applyFilters), [visibleUsers, filters, globalLogic]);

  const sortedUsers = useMemo(() => {
    let sortableItems = [...filteredUsers];
    if (sortConfig.key) {
      sortableItems.sort((a, b) => {
        let aVal = a[sortConfig.key];
        let bVal = b[sortConfig.key];

        if (sortConfig.key === 'CreatedAt') {
          aVal = new Date(aVal || 0).getTime();
          bVal = new Date(bVal || 0).getTime();
        } else {
          aVal = String(aVal || "").toLowerCase();
          bVal = String(bVal || "").toLowerCase();
        }

        if (aVal < bVal) return sortConfig.direction === "asc" ? -1 : 1;
        if (aVal > bVal) return sortConfig.direction === "asc" ? 1 : -1;
        return 0;
      });
    }
    return sortableItems;
  }, [filteredUsers, sortConfig]);

  const totalPages = Math.ceil(sortedUsers.length / rowsPerPage);
  const paginatedUsers = sortedUsers.slice((currentPage - 1) * rowsPerPage, currentPage * rowsPerPage);

  const handleSort = (key) => setSortConfig(prev => ({ key, direction: prev.key === key && prev.direction === "asc" ? "desc" : "asc" }));
  const getSortIcon = (key) => {
    if (sortConfig.key !== key) return <span className="muted-text ml-6">↕</span>;
    return <span className="ml-6">{sortConfig.direction === "asc" ? "↑" : "↓"}</span>;
  };

  const activeFilterCount = filters.reduce((acc, b) => acc + b.conds.filter(c => c.value).length, 0);

  const handleExport = (scope) => { 
    setShowExpDrop(false); 
    let dataToExport = [];
    if (scope === 'page') dataToExport = paginatedUsers;
    else if (scope === 'filtered') dataToExport = sortedUsers;
    else dataToExport = visibleUsers;
    
    performExport(dataToExport, cols, exportFormat, "users_export", (r, cId) => {
        if (cId === 'CreatedAt') return fmtDate(r[cId]);
        return r[cId];
    });
  };

  return (
    <div className="mgmtenv">
      {!isAdmin ? (
        <div style={{ padding: '60px 20px', textAlign: 'center' }}>
            <div className="banner error" style={{ display: 'inline-flex', alignItems: 'center', fontSize: '16px', padding: '20px', gap: '12px' }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="24" height="24"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>
              <strong>Security Violation:</strong> You do not have Administrator privileges to view this page.
            </div>
            <div className="mt-20">
                <button className="btn outline" onClick={onClose}>Close and Go Back</button>
            </div>
        </div>
      ) : (
        <>
          <div className="topbar" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div className="left" style={{ display: 'flex', flexDirection: 'column' }}>
                <h2 className="clickable" style={{ margin: 0, fontSize: "22px", fontWeight: 600, color: "var(--text)" }} onClick={onClose} title="Go back">User Management</h2>
                <div className="sub mt-4 text-13 muted-text">Updated: {lastUpdated || "—"}</div>
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
            </div>
          </div>

          {error && <div className="banner error">{error}</div>}

          <div className="section overflow-visible">
            <div className="section-head"><span className="title">Create / Add New User</span></div>
            
            <form onSubmit={userType === "Local" ? handleCreateUser : handleCreateADUser}>
              <div className="grid">
                
                <div className="field" style={{ gridColumn: '1 / -1' }}>
                  <div className="meta"><label>User Type</label></div>
                  <div style={{ display: 'flex', gap: '20px', marginTop: '8px' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                      <input type="radio" name="userType" value="Local" checked={userType === "Local"} onChange={() => { setUserType("Local"); setFormError(""); }} /> 
                      <span style={{ fontSize: '13px', fontWeight: 500 }}>Local User</span>
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                      <input type="radio" name="userType" value="AD" checked={userType === "AD"} onChange={() => { setUserType("AD"); setFormError(""); setPassword(""); setConfirmPass(""); }} /> 
                      <span style={{ fontSize: '13px', fontWeight: 500 }}>AD / LDAP User</span>
                    </label>
                  </div>
                </div>

                <div className="field">
                  <div className="meta"><label htmlFor="new_username">Username</label></div>
                  <div className="inputwrap">
                    <input id="new_username" type="text" value={username} onChange={(e) => setUsername(e.target.value)} placeholder={userType === "AD" ? "Enter AD username (e.g. jdoe)" : "Enter username"} autoComplete="off" />
                  </div>
                </div>
                
                <FancySelect label="Role" options={roleOptions} value={role} onChange={setRole} placeholder="Select Role" />
                
                {userType === "Local" && (
                  <>
                    <div className="field">
                      <div className="meta"><label htmlFor="new_password">Password</label></div>
                      <div className="inputwrap">
                        <input id="new_password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Enter new password" autoComplete="new-password" />
                      </div>
                    </div>
                    <div className="field">
                      <div className="meta"><label htmlFor="confirm_password">Confirm Password</label></div>
                      <div className="inputwrap">
                        <input id="confirm_password" type="password" value={confirmPass} onChange={(e) => setConfirmPass(e.target.value)} placeholder="Confirm new password" autoComplete="new-password" />
                      </div>
                    </div>
                  </>
                )}
              </div>
              
              {formError && <div className="alert error small" style={{ margin: '0 20px 20px' }}>{formError}</div>}
              
              <div className="action-bar">
                <div className="spacer"></div>
                <button type="submit" className="btn outline small" disabled={formBusy}>
                  {formBusy ? "Processing..." : (userType === "AD" ? "Add AD User" : "Create Local User")}
                </button>
              </div>
            </form>
          </div>

          {activeFilterCount > 0 && (
              <div className="p-0-20-20" style={{ padding: '0 20px 20px' }}>
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

          <div className="section">
            <div className="section-head" style={{ paddingBottom: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span className="title">Existing Users</span>
              
              <div style={{ display: 'flex', gap: '12px' }}>
                  <div className="dropdown" ref={colRef}>
                      <button className="btn outline sec small" onClick={() => { setShowColDrop(!showColDrop); setShowExpDrop(false); }}>
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16"><line x1="8" y1="6" x2="21" y2="6"></line><line x1="8" y1="12" x2="21" y2="12"></line><line x1="8" y1="18" x2="21" y2="18"></line><line x1="3" y1="6" x2="3.01" y2="6"></line><line x1="3" y1="12" x2="3.01" y2="12"></line><line x1="3" y1="18" x2="3.01" y2="18"></line></svg>
                          &nbsp; Columns
                      </button>
                      {showColDrop && (
                          <div className="dropdown-menu show" style={{ minWidth: "220px", padding: "12px", right: 0 }}>
                              <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                                  {cols.map((col, i) => (
                                      <label key={col.id} style={{ display: "flex", alignItems: "center", gap: "10px", cursor: "pointer", padding: "6px 12px", borderRadius: "4px" }} onMouseOver={e=>e.currentTarget.style.background="#f8fafc"} onMouseOut={e=>e.currentTarget.style.background="transparent"}>
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

            <div className="gridusr">
              {loading ? (
                <p className="sub mgmt-loading">Loading users...</p>
              ) : (
                <>
                  <div className="tableWrap h-400 border-top" style={{ borderRadius: 0, borderLeft: 'none', borderRight: 'none' }}>
                    {filteredUsers.length === 0 ? (
                      <div className="sub empty-state" style={{ padding: '40px', textAlign: 'center' }}>No users found matching filters.</div>
                    ) : (
                      <table className="user-table">
                        <thead className="kpi-th-sticky">
                          <tr>
                            {cols.find(c=>c.id==='LoginName')?.show && <th className="cursor-pointer" onClick={() => handleSort('LoginName')}>Username{getSortIcon('LoginName')}</th>}
                            {cols.find(c=>c.id==='Role')?.show && <th className="cursor-pointer" onClick={() => handleSort('Role')}>Role{getSortIcon('Role')}</th>}
                            {cols.find(c=>c.id==='CreatedAt')?.show && <th className="cursor-pointer" onClick={() => handleSort('CreatedAt')}>Created At{getSortIcon('CreatedAt')}</th>}
                            <th className="text-center w-100">Action</th>
                          </tr>
                        </thead>
                        <tbody>
                          {paginatedUsers.map(user => {
                            const isEditing = editingId === user.UserID;
                            const isSelf = user.UserID === currentUserId;
                            return (
                             <tr key={user.UserID}>
                                {cols.find(c=>c.id==='LoginName')?.show && <td>{user.LoginName}{isSelf && <span className="you-pill"> (You)</span>}</td>}
                                
                                {cols.find(c=>c.id==='Role')?.show && (
                                  <td className="min-w-140">
                                    {isEditing ? (
                                      <div style={{width: 140}}>
                                        <FancySelect options={roleOptions} value={editRole} onChange={setEditRole} placeholder="Select Role" disabled={editBusy} />
                                      </div>
                                    ) : (
                                      <span className={`pill ${getPillClass(user.Role)}`}>{user.Role || 'Windows'}</span>
                                    )}
                                  </td>
                                )}

                                {cols.find(c=>c.id==='CreatedAt')?.show && <td>{fmtDate(user.CreatedAt)}</td>}
                                
                                <td className="text-center">
                                  <div className="action-btns-center">
                                    {isEditing ? (
                                      <>
                                        <button className="btn-icon save" title="Save Role" onClick={() => saveRole(user.UserID)} disabled={editBusy}>✓</button>
                                        <button className="btn-icon cancel" title="Cancel" onClick={cancelEditing} disabled={editBusy}>✕</button>
                                      </>
                                    ) : (
                                      <>
                                        <button className="btn-icon edit" title="Edit Role" onClick={() => startEditing(user)} disabled={!isAdmin}>✎</button>
                                        <button className="btn-icon delete" title="Delete User" onClick={() => handleDeleteUser(user.UserID)} disabled={isSelf || !isAdmin}>🗑</button>
                                      </>
                                    )}
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    )}
                  </div>

                  {filteredUsers.length > 0 && (
                    <div className="pagination" style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", padding: "16px 20px", gap: "24px", background: 'var(--panel)' }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                            <span className="pager-info" style={{ fontSize: "13px", color: "var(--muted)" }}>Rows per page:</span>
                            <select className="control" style={{ width: "70px", height: "32px", padding: '0 8px' }} value={rowsPerPage} onChange={(e) => { setRowsPerPage(Number(e.target.value)); setCurrentPage(1); }}>
                                <option value={10}>10</option><option value={20}>20</option><option value={50}>50</option><option value={10000}>All</option>
                            </select>
                        </div>
                        <span className="pager-info" style={{ fontSize: "13px", color: "var(--muted)" }}>
                            {filteredUsers.length > 0 ? (currentPage - 1) * rowsPerPage + 1 : 0}-{Math.min(currentPage * rowsPerPage, filteredUsers.length)} of {filteredUsers.length}
                        </span>
                        <div className="pager-btns" style={{ display: "flex", gap: "4px" }}>
                            <button className="pager-btn" disabled={currentPage === 1} onClick={() => setCurrentPage(p => p - 1)}>&lt;</button>
                            <button className={`pager-btn ${currentPage === 1 ? 'active' : ''}`} onClick={() => setCurrentPage(1)}>1</button>
                            {totalPages > 1 && <button className={`pager-btn ${currentPage === 2 ? 'active' : ''}`} onClick={() => setCurrentPage(2)}>2</button>}
                            {totalPages > 2 && <span style={{ padding: '0 4px', color: 'var(--muted)' }}>..</span>}
                            {totalPages > 2 && currentPage > 2 && currentPage < totalPages && <button className="pager-btn active">{currentPage}</button>}
                            {totalPages > 2 && <button className={`pager-btn ${currentPage === totalPages ? 'active' : ''}`} onClick={() => setCurrentPage(totalPages)}>{totalPages}</button>}
                            <button className="pager-btn" disabled={currentPage === totalPages || totalPages === 0} onClick={() => setCurrentPage(p => p + 1)}>&gt;</button>
                        </div>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>

          <FilterDrawer isOpen={drawerOpen} onClose={() => setDrawerOpen(false)} filters={filters} setFilters={setFilters} globalLogic={globalLogic} setGlobalLogic={setGlobalLogic} propertyOptions={propertyOptions} />
        </>
      )}
    </div>
  );
}