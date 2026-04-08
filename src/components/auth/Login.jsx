// // src/components/auth/Login.jsx
// import { useState, useEffect } from "react";

// const API_BASE = window.env.VITE_API_BASE;

// export default function Login({ onSuccess }) {
//   const [u, setU] = useState("");
//   const [p, setP] = useState("");
  
//   const [isSetup, setIsSetup] = useState(false);
//   const [setupConfirm, setSetupConfirm] = useState("");
  
//   const [err, setErr] = useState("");
//   const [info, setInfo] = useState("");
//   const [busy, setBusy] = useState(false);

//   useEffect(() => {
//     fetch(`${API_BASE}/api/auth/setup-required`)
//       .then(res => res.json())
//       .then(data => {
//         if (data.ok && data.requiresSetup) {
//           setIsSetup(true);
//         }
//       })
//       .catch(() => {});
//   }, []);

//   async function handleAction(e) {
//     e.preventDefault();
//     setErr("");
//     setInfo("");
//     setBusy(true);

//     try {
//       if (isSetup) {
//         if (p !== setupConfirm) throw new Error("Passwords do not match.");
//         const r = await fetch(`${API_BASE}/api/auth/signup`, {
//             method: "POST",
//             headers: { "Content-Type": "application/json" },
//             body: JSON.stringify({ username: u.trim(), password: p, role: 'Admin' }), 
//         });
        
//         const text = await r.text();
//         let j;
//         try { j = JSON.parse(text); } catch (e) { throw new Error(text || "Setup failed."); }
        
//         if (!r.ok || !j.ok) throw new Error(j.message || "Setup failed.");

//         setInfo("Admin account created successfully! Please login.");
//         setIsSetup(false); setP(""); setSetupConfirm(""); setBusy(false); 

//       } else {
//         await performLogin();
//       }
//     } catch (e2) {
//       setErr(e2.message || "An unexpected error occurred.");
//       setBusy(false);
//     }
//   }

//   async function performLogin() {
//     const r = await fetch(`${API_BASE}/api/auth/login`, {
//         method: "POST",
//         headers: { "Content-Type": "application/json" },
//         body: JSON.stringify({ username: u.trim(), password: p }),
//     });
      
//     const text = await r.text();
//     let j;
//     try { 
//         j = JSON.parse(text); 
//     } catch (err) { 
//         throw new Error(text || "Invalid response from server."); 
//     }

//     if (!r.ok || !j.ok) {
//         throw new Error(j.message || "Login failed. Please verify your credentials.");
//     }
      
//     const userRole = j.role || "User";
//     sessionStorage.setItem("username", j.username);
//     sessionStorage.setItem("user_role", userRole); 
    
//     onSuccess?.({ username: j.username, userId: j.userId, role: userRole, timeoutMins: j.timeoutMins });
//     setBusy(false);
//   }

//   return (
//     <div className="login-outer">
//       <div className="login-card">
//         <h2 className="login-title">
//             {isSetup ? "Create Admin Account" : "Login"}
//         </h2>
        
//         {isSetup && <p className="intro-text">Welcome! Please create the first Administrator account.</p>}
        
//         <form onSubmit={handleAction}>
//              <label>
//                 <span>Username</span>
//                 <input
//                   value={u}
//                   onChange={(e) => setU(e.target.value)}
//                   placeholder="Enter username"
//                   autoComplete="username"
//                   required
//                 />
//              </label>
          
//             <label>
//               <span>Password</span>
//               <input
//                 type="password"
//                 value={p}
//                 onChange={(e) => setP(e.target.value)}
//                 placeholder="Enter password"
//                 autoComplete={isSetup ? "new-password" : "current-password"}
//                 required
//               />
//             </label>

//           {isSetup && (
//              <label>
//                 <span>Confirm Password</span>
//                 <input
//                   type="password"
//                   value={setupConfirm}
//                   onChange={(e) => setSetupConfirm(e.target.value)}
//                   placeholder="Confirm password"
//                   autoComplete="new-password"
//                   required
//                 />
//              </label>
//           )}

//           {!!err && (
//             <div 
//               className="alert error" 
//               style={{ 
//                 color: '#d32f2f', 
//                 backgroundColor: '#fdecea', 
//                 border: '1px solid #f5c2c7', 
//                 padding: '12px', 
//                 borderRadius: '4px', 
//                 marginBottom: '16px', 
//                 fontSize: '13px', 
//                 fontWeight: 500 
//               }}
//             >
//               {err}
//             </div>
//           )}
          
//           {!!info && <div className="alert success">{info}</div>}

//           <button type="submit" className="btn-primary" disabled={busy}>
//             {busy ? "Processing..." : (isSetup ? "Create Admin" : "Login")}
//           </button>
//         </form>
//       </div>
//     </div>
//   );
// }


// src/components/auth/Login.jsx
import { useState, useEffect } from "react";

const API_BASE = window.env.VITE_API_BASE;

export default function Login({ onSuccess }) {
  const [u, setU] = useState("");
  const [p, setP] = useState("");
  
  const [isSetup, setIsSetup] = useState(false);
  const [setupConfirm, setSetupConfirm] = useState("");
  
  //  State for SAML/Okta Configuration
  const [samlEnabled, setSamlEnabled] = useState(false);
  const [forceSso, setForceSso] = useState(false);
  
  const [err, setErr] = useState("");
  const [info, setInfo] = useState("");
  const [busy, setBusy] = useState(false);
  const [loadingSettings, setLoadingSettings] = useState(true);

  // useEffect(() => {
  //   // 1. Check if Setup is required
  //   fetch(`${API_BASE}/api/auth/setup-required`)
  //     .then(res => res.json())
  //     .then(data => {
  //       if (data.ok && data.requiresSetup) {
  //         setIsSetup(true);
  //       }
  //     })
  //     .catch(() => {});

  //   //  2. Check if SAML/Okta is enabled in Environment Settings
  //   //  2. Check if SAML/Okta is enabled in Environment Settings
  //   fetch(`${API_BASE}/api/env`)
  //     .then(res => res.json())
  //     .then(data => {
  //       if (data.ok && data.values) {
  //          // Safely handle both boolean true and string "true"
  //          const isSamlOn = String(data.values.SAML_ENABLED).toLowerCase() === "true";
  //          const isForceSso = String(data.values.FORCE_SSO).toLowerCase() === "true";
           
  //          setSamlEnabled(isSamlOn);
  //          setForceSso(isForceSso);
  //       }
  //     })
  //     .catch(() => {});
  // }, []);
  useEffect(() => {
    // 1. Check if Setup is required
    fetch(`${API_BASE}/api/auth/setup-required`)
      .then(res => res.json())
      .then(data => {
        if (data.ok && data.requiresSetup) {
          setIsSetup(true);
        }
      })
      .catch(() => {});

    //  NEW: Check if we just returned from a successful SSO login
    // We check the backend status using credentials: 'include' to send the cookie
    fetch(`${API_BASE}/api/auth/status`, { credentials: 'include' })
      .then(res => res.json())
      .then(data => {
        if (data.ok && data.authed) {
           // Sync the cookie session to the app's sessionStorage state
           sessionStorage.setItem("username", data.userData.username);
           sessionStorage.setItem("user_role", data.userData.role); 
           
           // Trigger the app's login success logic
           onSuccess?.({ 
             username: data.userData.username, 
             userId: data.userData.userId, 
             role: data.userData.role, 
             timeoutMins: data.timeoutMins 
           });
        }
      })
      .catch(() => {});

    // 2. Check if SAML/Okta is enabled (Existing code...)
    fetch(`${API_BASE}/api/env`)
      .then(res => res.json())
      .then(data => {
        if (data.ok && data.values) {
           const isSamlOn = String(data.values.SAML_ENABLED).toLowerCase() === "true";
           const isForceSso = String(data.values.FORCE_SSO).toLowerCase() === "true";
           setSamlEnabled(isSamlOn);
           setForceSso(isForceSso);
        }
      })
      .catch(() => {})
      .finally(() => setLoadingSettings(false));
  }, [onSuccess]);

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

  const handleOktaLogin = () => {
      
      const link = document.createElement('a');
      link.href = `${API_BASE}/api/auth/saml/login`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
  };


  return (
    <div className="login-outer">
      <div className="login-card">
        <h2 className="login-title">
            {isSetup ? "Create Admin Account" : "Login"}
        </h2>
        
        {isSetup && <p className="intro-text">Welcome! Please create the first Administrator account.</p>}
        {forceSso && !isSetup && samlEnabled && <p className="intro-text" style={{ textAlign: 'center', marginBottom: '24px' }}>Single Sign-On is required for this environment.</p>}
        
        {/* LOGIC: Only show local login form if NOT forcing SSO, OR if we are doing the initial Admin setup */}
        {/* {(!forceSso || isSetup) && ( */}
        {!loadingSettings && (!forceSso || isSetup) && (
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
                    color: '#d32f2f', backgroundColor: '#fdecea', border: '1px solid #f5c2c7', 
                    padding: '12px', borderRadius: '4px', marginBottom: '16px', fontSize: '13px', fontWeight: 500 
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
        )}

        {/*  OKTA SSO BUTTON: Show if SAML is enabled and we are not in setup mode */}
        {samlEnabled && !isSetup && (
            <div style={{ marginTop: forceSso ? '10px' : '24px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                
                {/* Show the 'OR' divider only if local login is also visible */}
                {!forceSso && (
                    <div style={{ width: '100%', height: '1px', background: '#e2e8f0', position: 'relative', marginBottom: '24px', marginTop: '8px' }}>
                        <span style={{ position: 'absolute', top: '-10px', left: '50%', transform: 'translateX(-50%)', background: 'white', padding: '0 10px', color: '#64748b', fontSize: '12px', fontWeight: 600 }}>OR</span>
                    </div>
                )}
                
                <button 
                    type="button" 
                    className="btn outline" 
                    style={{ 
                        width: "100%", height: '44px', fontWeight: 600, display: 'flex', alignItems: 'center', 
                        justifyContent: 'center', gap: '10px', border: '1px solid #cbd5e1', backgroundColor: '#f8fafc', 
                        color: '#0f172a', borderRadius: '6px', cursor: 'pointer', transition: 'background-color 0.2s' 
                    }}
                    onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#f1f5f9'}
                    onMouseOut={(e) => e.currentTarget.style.backgroundColor = '#f8fafc'}
                    onClick={handleOktaLogin}
                >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#2563eb" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><polyline points="10 17 15 12 10 7"/><line x1="15" y1="12" x2="3" y2="12"/>
                    </svg>
                    Sign in with Okta SSO
                </button>
            </div>
        )}

      </div>
    </div>
  );
}