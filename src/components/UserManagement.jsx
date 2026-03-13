// src/components/UserManagement.jsx
import { useEffect, useState, useRef } from "react";

const API = window.env?.VITE_API_BASE || "http://localhost:5174";

async function apiFetch(url, options = {}) {
  const r = await fetch(`${API}${url}`, options);
  let j;
  try { j = await r.json(); } catch (e) { j = { ok: false, error: "Failed to parse server response." }; }
  if (!r.ok || j.ok === false) throw new Error(j.error || j.message || `HTTP ${r.status}`);
  return j;
}

function fmtDate(iso) { try { return new Date(iso).toLocaleString(); } catch { return iso; } }

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

  const currentRole = sessionStorage.getItem("user_role") || "Windows";
  const isAdmin = currentRole === "Admin";

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPass, setConfirmPass] = useState("");
  const [role, setRole] = useState("Windows"); 
  const [formError, setFormError] = useState("");
  const [formBusy, setFormBusy] = useState(false);

  const [editingId, setEditingId] = useState(null);
  const [editRole, setEditRole] = useState("");
  const [editBusy, setEditBusy] = useState(false);

  const roleOptions = ["Windows", "Linux", "EUC", "Admin"];
  const visibleUsers = users.filter(u => ![9002, 9003, 9004].includes(Number(u.UserID)));

  async function fetchUsers() {
    setLoading(true); setError("");
    try { const data = await apiFetch("/api/auth/users"); setUsers(data.users || []); } 
    catch (e) { setError(e.message); } 
    finally { setLoading(false); }
  }

  useEffect(() => { fetchUsers(); }, []);

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

  return (
    <div className="mgmtenv">
      <div className="topbar">
        <div className="left"><h2 className="clickable" onClick={onClose} title="Go back">User Management</h2></div>
        <div className="right"><button className="btn" onClick={onClose}>Close</button></div>
      </div>

      {error && <div className="banner error">{error}</div>}

      {!isAdmin && (
        <div className="banner warning admin-warning">Only Admins can create or delete users.</div>
      )}

      {isAdmin && (
        <div className="section overflow-visible">
          <div className="section-head"><span className="title">Create New User</span></div>
          <form onSubmit={handleCreateUser}>
            <div className="grid">
              <div className="field">
                <div className="meta"><label htmlFor="new_username">Username</label></div>
                <div className="inputwrap">
                  <input id="new_username" type="text" value={username} onChange={(e) => setUsername(e.target.value)} placeholder="Enter username" autoComplete="off" />
                </div>
              </div>
              <FancySelect label="Role" options={roleOptions} value={role} onChange={setRole} placeholder="Select Role" />
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
            </div>
            {formError && <div className="alert error small" style={{ margin: '0 20px 20px' }}>{formError}</div>}
            <div className="action-bar">
              <div className="spacer"></div>
              <button type="submit" className="btn outline small" disabled={formBusy}>
                {formBusy ? "Creating..." : "Create User"}
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="section">
        <div className="section-head"><span className="title">Existing Users</span></div>
        <div className="gridusr">
          {loading ? (
            <p className="sub mgmt-loading">Loading users...</p>
          ) : (
            <div className="tableWrap">
              <table className="user-table">
                <thead>
                  <tr><th>Username</th><th>Role</th><th>Created At</th><th className="text-center w-100">Action</th></tr>
                </thead>
                <tbody>
                  {visibleUsers.map(user => {
                    const isEditing = editingId === user.UserID;
                    const isSelf = user.UserID === currentUserId;
                    return (
                     <tr key={user.UserID}>
                        <td>{user.LoginName}{isSelf && <span className="you-pill"> (You)</span>}</td>
                        <td className="min-w-140">
                          {isEditing ? (
                            <div style={{width: 140}}>
                              <FancySelect options={roleOptions} value={editRole} onChange={setEditRole} placeholder="Select Role" disabled={editBusy} />
                            </div>
                          ) : (
                            <span className={`pill ${getPillClass(user.Role)}`}>{user.Role || 'Windows'}</span>
                          )}
                        </td>
                        <td>{fmtDate(user.CreatedAt)}</td>
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
            </div>
          )}
        </div>
      </div>
    </div>
  );
}