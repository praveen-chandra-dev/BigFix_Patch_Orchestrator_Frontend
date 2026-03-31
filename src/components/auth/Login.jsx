// src/components/auth/Login.jsx
import { useState, useEffect } from "react";

const API_BASE = window.env.VITE_API_BASE;

export default function Login({ onSuccess }) {
  const [u, setU] = useState("");
  const [p, setP] = useState("");
  
  const [isSetup, setIsSetup] = useState(false);
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
        throw new Error(j.message || "Login failed. Please verify your credentials.");
    }
      
    const userRole = j.role || "User";
    sessionStorage.setItem("username", j.username);
    sessionStorage.setItem("user_role", userRole); 
    
    onSuccess?.({ username: j.username, userId: j.userId, role: userRole, timeoutMins: j.timeoutMins });
    setBusy(false);
  }

  return (
    <div className="login-outer">
      <div className="login-card">
        <h2 className="login-title">
            {isSetup ? "Create Admin Account" : "Login"}
        </h2>
        
        {isSetup && <p className="intro-text">Welcome! Please create the first Administrator account.</p>}
        
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
              <span>Password</span>
              <input
                type="password"
                value={p}
                onChange={(e) => setP(e.target.value)}
                placeholder="Enter password"
                autoComplete={isSetup ? "new-password" : "current-password"}
                required
              />
            </label>

          {isSetup && (
             <label>
                <span>Confirm Password</span>
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

          <button type="submit" className="btn-primary" disabled={busy}>
            {busy ? "Processing..." : (isSetup ? "Create Admin" : "Login")}
          </button>
        </form>
      </div>
    </div>
  );
}