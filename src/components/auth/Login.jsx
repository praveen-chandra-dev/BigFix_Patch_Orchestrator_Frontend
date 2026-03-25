// src/components/auth/Login.jsx
import { useState, useEffect } from "react";

const API_BASE = window.env.VITE_API_BASE;

export default function Login({ onSuccess }) {
  const [u, setU] = useState("");
  const [p, setP] = useState("");
  
  const [isSetup, setIsSetup] = useState(false);
  const [isResetMode, setIsResetMode] = useState(false); 
  
  const [setupConfirm, setSetupConfirm] = useState("");
  const [err, setErr] = useState("");
  const [info, setInfo] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch(`${API_BASE}/api/auth/setup-required`)
      .then(res => res.json())
      .then(data => {
        if (data.ok && data.requiresSetup) {
          setIsSetup(true);
        }
      })
      .catch(() => {});
  }, []);

  async function handleAction(e) {
    e.preventDefault();
    setErr("");
    setInfo("");
    setBusy(true);

    try {
      if (isSetup) {
        if (p !== setupConfirm) throw new Error("Passwords do not match.");
        const r = await fetch(`${API_BASE}/api/auth/signup`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ username: u.trim(), password: p, role: 'Admin' }), 
        });
        
        const text = await r.text();
        let j;
        try { j = JSON.parse(text); } catch (e) { throw new Error(text || "Setup failed."); }
        
        if (!r.ok || !j.ok) throw new Error(j.message || "Setup failed.");

        setInfo("Admin account created successfully! Please login.");
        setIsSetup(false); setP(""); setSetupConfirm(""); setBusy(false); 

      } else if (isResetMode) {
        if (p !== setupConfirm) throw new Error("Passwords do not match.");
        const r = await fetch(`${API_BASE}/api/auth/reset-password`, {
             method: "POST",
             headers: { "Content-Type": "application/json" },
             body: JSON.stringify({ username: u.trim(), newPassword: p })
        });
        
        const j = await r.json();
        if (!r.ok || !j.ok) throw new Error(j.message || "Reset failed. Please verify your username.");
        
        setInfo("Password successfully changed in Database! Please log in.");
        setIsResetMode(false);
        setP(""); setSetupConfirm("");
        setBusy(false);

      } else {
        await performLogin();
      }
    } catch (e2) {
      setErr(e2.message || "An unexpected error occurred.");
      setBusy(false);
    }
  }

  async function performLogin() {
    const r = await fetch(`${API_BASE}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: u.trim(), password: p }),
    });
      
    const text = await r.text();
    let j;
    try { 
        j = JSON.parse(text); 
    } catch (err) { 
        throw new Error(text || "Invalid response from server."); 
    }

    if (!r.ok || !j.ok) {
        if (j.error === 'invalid') {
             throw new Error("Invalid username or password. If you forgot your password, use the 'Forgot Password' button below.");
        }
        throw new Error(j.message || "Login failed. Please verify your credentials.");
    }
      
    const userRole = j.role || "User";
    sessionStorage.setItem("username", j.username);
    
    // 🚀 FIX: Instantly save the role to sessionStorage so the Topbar NEVER flickers!
    sessionStorage.setItem("user_role", userRole); 
    
    onSuccess?.({ username: j.username, userId: j.userId, role: userRole, timeoutMins: j.timeoutMins });
    setBusy(false);
  }

  return (
    <div className="login-outer">
      <div className="login-card">
        <h2 className="login-title">
            {isSetup ? "Create Admin Account" : isResetMode ? "Reset Password" : "Login"}
        </h2>
        
        {isSetup && <p className="intro-text">Welcome! Please create the first Administrator account.</p>}
        {isResetMode && <p className="intro-text">Enter your username and a new password to update the database.</p>}
        
        <form onSubmit={handleAction}>
             <label>
                <span>Username</span>
                <input
                  value={u}
                  onChange={(e) => setU(e.target.value)}
                  placeholder="Enter username"
                  autoComplete="username"
                  required
                />
             </label>
          
            <label>
              <span>{isResetMode ? "New Password" : "Password"}</span>
              <input
                type="password"
                value={p}
                onChange={(e) => setP(e.target.value)}
                placeholder={isResetMode ? "Enter new password" : "Enter password"}
                autoComplete={isSetup || isResetMode ? "new-password" : "current-password"}
                required
              />
            </label>

          {(isSetup || isResetMode) && (
             <label>
                <span>Confirm {isResetMode ? "New Password" : "Password"}</span>
                <input
                  type="password"
                  value={setupConfirm}
                  onChange={(e) => setSetupConfirm(e.target.value)}
                  placeholder="Confirm password"
                  autoComplete="new-password"
                  required
                />
             </label>
          )}

          {!!err && (
            <div 
              className="alert error" 
              style={{ 
                color: '#d32f2f', 
                backgroundColor: '#fdecea', 
                border: '1px solid #f5c2c7', 
                padding: '12px', 
                borderRadius: '4px', 
                marginBottom: '16px', 
                fontSize: '13px', 
                fontWeight: 500 
              }}
            >
              {err}
            </div>
          )}
          
          {!!info && <div className="alert success">{info}</div>}

          <button type="submit" className="btn-primary" disabled={busy} style={{ marginBottom: isResetMode || isSetup ? '0' : '12px' }}>
            {busy ? "Processing..." : (isSetup ? "Create Admin" : isResetMode ? "Reset & Update Database" : "Login")}
          </button>

          {!isSetup && !isResetMode && (
             <div style={{ textAlign: 'center', marginTop: '10px' }}>
                <button 
                  type="button" 
                  onClick={() => { setIsResetMode(true); setErr(""); setInfo(""); setP(""); setSetupConfirm(""); }} 
                  style={{ background: 'none', border: 'none', color: '#1976d2', textDecoration: 'underline', cursor: 'pointer', fontSize: '13px' }}>
                  Forgot Password?
                </button>
             </div>
          )}

          {isResetMode && (
             <div style={{ textAlign: 'center', marginTop: '15px' }}>
                <button 
                  type="button" 
                  onClick={() => { setIsResetMode(false); setErr(""); setInfo(""); setP(""); setSetupConfirm(""); }} 
                  style={{ background: 'none', border: 'none', color: '#555', cursor: 'pointer', fontSize: '13px' }}>
                  Cancel Reset / Back to Login
                </button>
             </div>
          )}
        </form>
      </div>
    </div>
  );
}