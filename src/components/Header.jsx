// src/components/Header.jsx
import { useEffect, useState, useRef } from "react";
import logo from "../assets/bigfix-logo.jpg";
import { useEnvironment } from "./Environment.jsx";

const IconDashboard = () => (<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="9"/><rect x="14" y="3" width="7" height="5"/><rect x="14" y="12" width="7" height="9"/><rect x="3" y="16" width="7" height="5"/></svg>);
const IconShield = () => (<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>);
const IconFlow = () => (<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="9" y1="21" x2="9" y2="9"/></svg>);
const IconFolder = () => (<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>);
const IconGroup = () => (<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>);
const IconCalendar = () => (<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>);
const IconSettings = () => (<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 0 2.83 2 2 0 0 1 0-2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>);
const IconLogout = () => (<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>);

class NavManager {
    constructor() {
        this.past = [];
        this.future = [];
        this.current = null;
    }
    push(state) {
        if (this.current) {
            if (
                this.current.activeMenu === state.activeMenu &&
                this.current.flowState === state.flowState &&
                this.current.riskTab === state.riskTab &&
                this.current.riskSubTab === state.riskSubTab &&
                this.current.kpiTab === state.kpiTab &&
                this.current.localSnapTab === state.localSnapTab &&
                this.current.localCloneTab === state.localCloneTab &&
                this.current.localRoleTab === state.localRoleTab
            ) return; 
            this.past.push(this.current);
        }
        this.current = state;
        this.future = [];
    }
    back() {
        if (this.past.length > 0) {
            this.future.push(this.current);
            this.current = this.past.pop();
            return this.current;
        }
        return null;
    }
    forward() {
        if (this.future.length > 0) {
            this.past.push(this.current);
            this.current = this.future.pop();
            return this.current;
        }
        return null;
    }
}
const navMgr = window.__navMgr = window.__navMgr || new NavManager();
let isRestoring = false;

export function Sidebar({ activeMenu, onNavigate, flowState, riskTab, setRiskTab, riskSubTab, setRiskSubTab, kpiTab, setKpiTab }) {
  const { env } = useEnvironment();
  const isMO = sessionStorage.getItem("isMO") === "true";

  const [localSnapTab, setLocalSnapTab] = useState('TARGETS');
  const [localCloneTab, setLocalCloneTab] = useState('TARGETS');
  const [localRoleTab, setLocalRoleTab] = useState('LIST');

  useEffect(() => {
    if (!isRestoring) {
        navMgr.push({ activeMenu, flowState: flowState?.current, riskTab, riskSubTab, kpiTab, localSnapTab, localCloneTab, localRoleTab });
    }
  }, [activeMenu, flowState?.current, riskTab, riskSubTab, kpiTab, localSnapTab, localCloneTab, localRoleTab]);

  useEffect(() => {
    const handleRestore = (e) => {
        const state = e.detail;
        if (!state) return;
        
        if (state.activeMenu !== activeMenu && onNavigate) onNavigate(state.activeMenu);
        if (state.flowState !== flowState?.current) window.dispatchEvent(new CustomEvent('flow:request_stage', { detail: { stage: state.flowState } }));
        if (state.riskTab !== riskTab && setRiskTab) setRiskTab(state.riskTab);
        if (state.riskSubTab !== riskSubTab && setRiskSubTab) setRiskSubTab(state.riskSubTab);
        if (state.kpiTab !== kpiTab && setKpiTab) setKpiTab(state.kpiTab);
        if (state.localSnapTab !== localSnapTab) window.dispatchEvent(new CustomEvent('nav:snapshot', { detail: state.localSnapTab }));
        if (state.localCloneTab !== localCloneTab) window.dispatchEvent(new CustomEvent('nav:clone', { detail: state.localCloneTab }));
        if (state.localRoleTab !== localRoleTab) window.dispatchEvent(new CustomEvent('nav:roles', { detail: state.localRoleTab }));
    };
    window.addEventListener('nav:restore', handleRestore);
    return () => window.removeEventListener('nav:restore', handleRestore);
  });

  useEffect(() => {
    const handleSnap = (e) => setLocalSnapTab(e.detail);
    const handleClone = (e) => setLocalCloneTab(e.detail);
    const handleRole = (e) => setLocalRoleTab(e.detail);
    window.addEventListener('sync:snapshot_tab', handleSnap);
    window.addEventListener('sync:clone_tab', handleClone);
    window.addEventListener('sync:roles_tab', handleRole);
    return () => {
        window.removeEventListener('sync:snapshot_tab', handleSnap);
        window.removeEventListener('sync:clone_tab', handleClone);
        window.removeEventListener('sync:roles_tab', handleRole);
    };
  }, []);

  const renderStage = (stageCode, label) => {
    if (!flowState) return null;
    const isHold = flowState.current === stageCode;
    const isAccessible = flowState.accessible.includes(stageCode);

    let cls = "menu-item sub-item step";
    if (!isAccessible) cls += " disabled";

    return (
        <a className={cls} 
           style={{ fontWeight: isHold ? 'bold' : 'normal', color: 'inherit' }}
           onClick={() => {
            if (isAccessible) {
                window.dispatchEvent(new CustomEvent('flow:request_stage', { detail: { stage: stageCode } }));
            }
        }}>
            {label}
        </a>
    );
  };

  return (
    <nav className="sidebar">
      <div className="sidebar-logo">
        <img src={logo} alt="HCL" style={{height: 28, borderRadius: 4}} />
        BigFix Patch Setu
      </div>
      
      <div className="sidebar-menu">
        <div className="menu-label">Dashboards</div>
        
        <a className={`menu-item ${activeMenu === 'orchestration' ? 'active' : ''}`} onClick={() => onNavigate('orchestration')}>
           <IconFlow /> Orchestration Flow
        </a>
        
        {activeMenu === 'orchestration' && (
           <div className="sidebar-sub-menu">
               <a className="menu-item sub-item step" 
                  style={{ fontWeight: flowState?.current === 'HISTORY' ? 'bold' : 'normal', color: 'inherit' }}
                  onClick={() => window.dispatchEvent(new CustomEvent('flow:request_stage', { detail: { stage: 'HISTORY' } }))}>
                  Deployment History
               </a>
               {renderStage('CONFIG', 'Configuration')}
               {env.enableSandbox && renderStage('SANDBOX', 'Sandbox')}
               {env.enablePilot && renderStage('PILOT', 'Pilot')}
               {renderStage('PRODUCTION', 'Production')}
               {renderStage('FINAL RESULT', 'Final Result')}
           </div>
        )}

        <a className={`menu-item ${activeMenu === 'risk' ? 'active' : ''}`} onClick={() => onNavigate('risk')}>
           <IconShield /> Risk Prioritization
        </a>

        {activeMenu === 'risk' && (
           <div className="sidebar-sub-menu">
               <a className="menu-item sub-item step" style={{ fontWeight: riskTab === 'patches' ? 'bold' : 'normal', color: 'inherit' }} onClick={() => setRiskTab('patches')}>
                    Patches
               </a>
               <a className="menu-item sub-item step" style={{ fontWeight: riskTab === 'baseline' ? 'bold' : 'normal', color: 'inherit' }} onClick={() => setRiskTab('baseline')}>
                    Baseline
               </a>
               <a className="menu-item sub-item step" style={{ fontWeight: riskTab === 'dashboard' ? 'bold' : 'normal', color: 'inherit' }} onClick={() => { setRiskTab('dashboard'); setRiskSubTab('overview'); }}>
                    Dashboard
               </a>
               {riskTab === 'dashboard' && (
                   <div style={{ marginLeft: '40px', display: 'flex', flexDirection: 'column', }}>
                       {['overview', 'cve', 'patch', 'computer', 'baseline'].map(sub => (
                           <a key={sub} className="menu-item sub-item step" style={{ padding: '6px 20px 6px 24px', fontSize: '13px', borderLeft: 'none', fontWeight: riskSubTab === sub ? 'bold' : 'normal', color: 'inherit' }} onClick={() => setRiskSubTab(sub)}>
                               {sub === 'cve' ? 'CVEs' : sub === 'computer' ? 'Computers' : sub === 'patch' ? 'Patches' : sub === 'baseline' ? 'Baselines' : 'Overview'}
                           </a>
                       ))}
                   </div>
               )}
           </div>
        )}

        <a className={`menu-item ${activeMenu === 'kpi-details' ? 'active' : ''}`} onClick={() => { onNavigate('kpi-details'); if(setKpiTab) setKpiTab('health'); }}>
           <IconDashboard /> KPI Details
        </a>

        {activeMenu === 'kpi-details' && (
           <div className="sidebar-sub-menu">
               <a className="menu-item sub-item step" style={{ fontWeight: kpiTab === 'health' ? 'bold' : 'normal', color: 'inherit' }} onClick={() => { if(setKpiTab) setKpiTab('health'); }}>
                    Critical Health
               </a>
               <a className="menu-item sub-item step" style={{ fontWeight: kpiTab === 'reboot' ? 'bold' : 'normal', color: 'inherit' }} onClick={() => { if(setKpiTab) setKpiTab('reboot'); }}>
                    Pending Reboots
               </a>
           </div>
        )}

        <div className="menu-label">Patch Management</div>
        <a className={`menu-item ${activeMenu === 'calendar' ? 'active' : ''}`} onClick={() => onNavigate('calendar')}>
           <IconCalendar /> Patch Calendar
        </a>

        <div className="menu-label">Infrastructure</div>
        <a className={`menu-item ${activeMenu === 'group' ? 'active' : ''}`} onClick={() => onNavigate('group')}>
           <IconGroup /> Group Management
        </a>
        
        <a className={`menu-item ${activeMenu === 'snapshot' ? 'active' : ''}`} onClick={() => onNavigate('snapshot')}>
           <IconFolder /> Take Snapshot
        </a>
        {activeMenu === 'snapshot' && (
           <div className="sidebar-sub-menu">
               <a className="menu-item sub-item step" style={{ fontWeight: localSnapTab === 'TARGETS' ? 'bold' : 'normal', color: 'inherit' }} onClick={() => window.dispatchEvent(new CustomEvent('nav:snapshot', {detail: 'TARGETS'}))}>
                     Targets
               </a>
               <a className="menu-item sub-item step" style={{ fontWeight: localSnapTab === 'SETTINGS' ? 'bold' : 'normal', color: 'inherit' }} onClick={() => window.dispatchEvent(new CustomEvent('nav:snapshot', {detail: 'SETTINGS'}))}>
                    Settings
               </a>
               <a className="menu-item sub-item step" style={{ fontWeight: localSnapTab === 'EXECUTION' ? 'bold' : 'normal', color: 'inherit' }} onClick={() => window.dispatchEvent(new CustomEvent('nav:snapshot', {detail: 'EXECUTION'}))}>
                    Execution
               </a>
           </div>
        )}

        <a className={`menu-item ${activeMenu === 'clone' ? 'active' : ''}`} onClick={() => onNavigate('clone')}>
           <IconFolder /> Clone VM
        </a>
        {activeMenu === 'clone' && (
           <div className="sidebar-sub-menu">
               <a className="menu-item sub-item step" style={{ fontWeight: localCloneTab === 'TARGETS' ? 'bold' : 'normal', color: 'inherit' }} onClick={() => window.dispatchEvent(new CustomEvent('nav:clone', {detail: 'TARGETS'}))}>
                     Targets
               </a>
               <a className="menu-item sub-item step" style={{ fontWeight: localCloneTab === 'SETTINGS' ? 'bold' : 'normal', color: 'inherit' }} onClick={() => window.dispatchEvent(new CustomEvent('nav:clone', {detail: 'SETTINGS'}))}>
                     Settings
               </a>
               <a className="menu-item sub-item step" style={{ fontWeight: localCloneTab === 'EXECUTION' ? 'bold' : 'normal', color: 'inherit' }} onClick={() => window.dispatchEvent(new CustomEvent('nav:clone', {detail: 'EXECUTION'}))}>
                     Execution
               </a>
           </div>
        )}

        <div className="menu-label">Administration</div>
        
        {isMO && (
          <>
            <a className={`menu-item ${activeMenu === 'users' ? 'active' : ''}`} onClick={() => onNavigate('users')}>
               <IconGroup /> User Management
            </a>
            
            <a className={`menu-item ${activeMenu === 'roles' ? 'active' : ''}`} onClick={() => onNavigate('roles')}>
               <IconShield /> Role Management
            </a>
            {activeMenu === 'roles' && (
               <div className="sidebar-sub-menu">
                   <a className="menu-item sub-item step" style={{ fontWeight: localRoleTab === 'LIST' ? 'bold' : 'normal', color: 'inherit' }} onClick={() => window.dispatchEvent(new CustomEvent('nav:roles', {detail: 'LIST'}))}>
                         Role List
                   </a>
                   <a className="menu-item sub-item step" style={{ fontWeight: localRoleTab === 'DETAILS' ? 'bold' : 'normal', color: 'inherit' }} onClick={() => window.dispatchEvent(new CustomEvent('nav:roles', {detail: 'DETAILS'}))}>
                         Details
                   </a>
                   <a className="menu-item sub-item step" style={{ fontWeight: localRoleTab === 'COMPUTERS' ? 'bold' : 'normal', color: 'inherit' }} onClick={() => window.dispatchEvent(new CustomEvent('nav:roles', {detail: 'COMPUTERS'}))}>
                         Computer Assignments
                   </a>
                   <a className="menu-item sub-item step" style={{ fontWeight: localRoleTab === 'SITES' ? 'bold' : 'normal', color: 'inherit' }} onClick={() => window.dispatchEvent(new CustomEvent('nav:roles', {detail: 'SITES'}))}>
                         Sites
                   </a>
                   <a className="menu-item sub-item step" style={{ fontWeight: localRoleTab === 'OPERATORS' ? 'bold' : 'normal', color: 'inherit' }} onClick={() => window.dispatchEvent(new CustomEvent('nav:roles', {detail: 'OPERATORS'}))}>
                         Operators
                   </a>
               </div>
            )}
          </>
        )}
        
        <a className={`menu-item ${activeMenu === 'settings' ? 'active' : ''}`} onClick={() => onNavigate('settings')}>
           <IconSettings /> Environment Settings
        </a>
      </div>
    </nav>
  );
}

export function Topbar({ onNavHistory, username, onLogout }) {
  const [roles, setRoles] = useState([]);
  const [isMO, setIsMO] = useState(false);
  const [activeRole, setActiveRole] = useState(sessionStorage.getItem('user_role') || '');
  const [showDropdown, setShowDropdown] = useState(false);
  const dropdownRef = useRef(null);

  useEffect(() => {
    fetch('/api/auth/roles')
      .then(r => r.json())
      .then(data => {
        if (data.ok) {
          setIsMO(data.isMO);
          sessionStorage.setItem('isMO', data.isMO ? 'true' : 'false');
          setRoles(data.roles || []);
          
          if (data.isMO) {
            setActiveRole('Master Operator');
            sessionStorage.setItem('user_role', 'Admin');
            window.dispatchEvent(new CustomEvent('role:changed', { detail: 'Admin' }));
          } else if (data.roles && data.roles.length > 0) {
            const current = sessionStorage.getItem('user_role');
            if (!data.roles.includes(current)) {
              setActiveRole(data.roles[0]);
              sessionStorage.setItem('user_role', data.roles[0]);
              window.dispatchEvent(new CustomEvent('role:changed', { detail: data.roles[0] }));
            } else {
              setActiveRole(current);
            }
          } else {
             setActiveRole('No Role Assigned');
             sessionStorage.setItem('user_role', 'No Role Assigned');
          }
        }
      });
  }, []);

  useEffect(() => {
      const handleOutside = (e) => {
          if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
              setShowDropdown(false);
          }
      };
      document.addEventListener('mousedown', handleOutside);
      return () => document.removeEventListener('mousedown', handleOutside);
  }, []);

  const handleRoleChange = (newRole) => {
    setActiveRole(newRole);
    sessionStorage.setItem('user_role', newRole);
    setShowDropdown(false);
    window.location.reload();
  };

  const handleBack = () => {
    const state = navMgr.back();
    if (state) {
        isRestoring = true;
        window.dispatchEvent(new CustomEvent('nav:restore', { detail: state }));
        setTimeout(() => { isRestoring = false; }, 100);
    } else {
        onNavHistory(-1); 
    }
  };

  const handleForward = () => {
    const state = navMgr.forward();
    if (state) {
        isRestoring = true;
        window.dispatchEvent(new CustomEvent('nav:restore', { detail: state }));
        setTimeout(() => { isRestoring = false; }, 100);
    } else {
        onNavHistory(1); 
    }
  };

  const userRoleDisplay = activeRole || (roles.length > 0 ? roles[0] : 'No Role Assigned');
  const hasMultipleRoles = !isMO && roles.length > 1;

  return (
   <div className="topbar-main" style={{ position: 'relative', zIndex: 99999, justifyContent: 'space-between' }}>

      {/* ✅ RESTORED ARROWS BLOCK */}
      <div style={{ display: 'flex', gap: '8px' }}>
          <button className="iconbtn" onClick={handleBack} title="Go Back">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"></polyline></svg>
          </button>
          <button className="iconbtn" onClick={handleForward} title="Go Forward">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>
          </button>
      </div>

      <div className="flex-row items-center gap-16">

        {/* ✅ ENTERPRISE USER BLOCK FIX */}
        <div ref={dropdownRef} style={{ position: 'relative' }}>
          <div
            onClick={() => { if (hasMultipleRoles) setShowDropdown(!showDropdown); }}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              padding: '6px 12px',
              borderRadius: '10px',
              border: showDropdown ? '1px solid var(--primary)' : '1px solid var(--border)',
              background: 'var(--panel)',
              cursor: hasMultipleRoles ? 'pointer' : 'default'
            }}
          >
            <div style={{
              width: 34,
              height: 34,
              borderRadius: '50%',
              background: 'var(--primary-light)',
              color: 'var(--primary)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 600
            }}>
              {username ? username[0].toUpperCase() : 'U'}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <div style={{ fontWeight: 600, fontSize: 13 }}>
                {username || 'User'}
              </div>

              <div style={{
                fontSize: 11,
                fontWeight: 600,
                color: 'var(--primary)',
                background: 'var(--primary-light)',
                borderRadius: 6,
                marginTop: 2
              }}>
                {userRoleDisplay}
              </div>
            </div>
                {hasMultipleRoles && (
                    <div style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        color: showDropdown ? 'var(--primary)' : 'var(--muted)',
                        transition: 'color 0.2s ease'
                    }}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ transform: showDropdown ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s ease' }}>
                            <polyline points="6 9 12 15 18 9"></polyline>
                        </svg>
                    </div>
                )}
             </div>

             {/* UPGRADED UX: Modern Role Dropdown Menu */}
             {showDropdown && (
                <div style={{ 
                    position: 'absolute', 
                    top: 'calc(100% + 8px)', 
                    left: 0,
                    width: '100%',              
                    background: 'var(--panel)', 
                    border: '1px solid var(--border)', 
                    borderRadius: '10px', 
                    boxShadow: '0 8px 24px rgba(0,0,0,0.12)', 
                    zIndex: 99999, 
                    overflow: 'hidden',
                    boxSizing: 'border-box'     
                }}>
                    <div style={{ padding: '12px 16px', background: 'var(--bg)', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--muted)" strokeWidth="2.5"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
                        <span style={{ fontSize: '8px', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                            Select Workspace Role
                        </span>
                    </div>
                    <div style={{ padding: '8px' }}>
                        {roles.map(r => {
                            const isActive = activeRole === r;
                            return (
                                <div key={r} onClick={() => handleRoleChange(r)} 
                                     style={{ 
                                         padding: '10px 12px', 
                                         fontSize: '10px', 
                                         fontWeight: isActive ? 600 : 500,
                                         cursor: 'pointer', 
                                         display: 'flex', 
                                         alignItems: 'center', 
                                         gap: '10px',
                                         borderRadius: '6px',
                                         background: isActive ? 'var(--primary-light)' : 'transparent', 
                                         color: isActive ? 'var(--primary)' : 'var(--text)',
                                         transition: 'all 0.15s ease'
                                     }}
                                     onMouseOver={(e) => { if (!isActive) e.currentTarget.style.background = 'var(--bg)' }}
                                     onMouseOut={(e) => { if (!isActive) e.currentTarget.style.background = 'transparent' }}
                                >
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '18px' }}>
                                        {isActive ? (
                                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg>
                                        ) : (
                                            <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'var(--border)' }} />
                                        )}
                                    </div>
                                    <span style={{ flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r}</span>
                                </div>
                            );
                        })}
                    </div>
                </div>
             )}
          </div>

          <button className="btn outline dan" onClick={onLogout} style={{height: 45, padding: "0 12px"}}>
             <IconLogout /> Logout
          </button>
       </div>
    </div>
  );
}