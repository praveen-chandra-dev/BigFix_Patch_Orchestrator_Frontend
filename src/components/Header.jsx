// src/components/Header.jsx
import { useEffect, useState, useRef } from "react";
import logo from "../assets/bigfix-logo.jpg";
import { useEnvironment } from "./Environment.jsx";

const IconDashboard = () => (<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="9"/><rect x="14" y="3" width="7" height="5"/><rect x="14" y="12" width="7" height="9"/><rect x="3" y="16" width="7" height="5"/></svg>);
const IconDevice = () => (<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="3" width="20" height="14" rx="2" ry="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>);
const IconShield = () => (<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>);
const IconFlow = () => (<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="9" y1="21" x2="9" y2="9"/></svg>);
const IconFolder = () => (<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>);
const IconGroup = () => (<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>);
const IconCalendar = () => (<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>);
const IconSettings = () => (<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 0 2.83 2 2 0 0 1 0-2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>);
const IconLogout = () => (<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>);

export function Sidebar({ activeMenu, onNavigate, flowState, role, riskTab, setRiskTab, riskSubTab, setRiskSubTab }) {
  const { env } = useEnvironment();
  const isEUC = role === 'EUC';

  const renderStage = (stageCode, label) => {
    if (!flowState) return null;
    const isHold = flowState.current === stageCode;
    const isPass = flowState.completed.includes(stageCode);
    const isAccessible = flowState.accessible.includes(stageCode);

    let cls = "menu-item sub-item step";
    if (isHold) cls += " hold";
    else if (isPass) cls += " pass";
    if (!isAccessible) cls += " disabled";

    return (
        <a className={cls} onClick={() => {
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
               <a className={`menu-item sub-item step ${flowState?.current === 'HISTORY' ? 'hold' : ''}`} 
                  onClick={() => window.dispatchEvent(new CustomEvent('flow:request_stage', { detail: { stage: 'HISTORY' } }))}>
                  Deployment History
               </a>
               {renderStage('CONFIG', 'Configuration')}
               {env.enableSandbox && !isEUC && renderStage('SANDBOX', 'Sandbox')}
               {env.enablePilot && !isEUC && renderStage('PILOT', 'Pilot')}
               {renderStage('PRODUCTION', 'Production')}
               {renderStage('FINAL RESULT', 'Final Result')}
           </div>
        )}

        <a className={`menu-item ${activeMenu === 'risk' ? 'active' : ''}`} onClick={() => onNavigate('risk')}>
           <IconShield /> Risk Prioritization
        </a>

        {activeMenu === 'risk' && (
           <div className="sidebar-sub-menu">
               <a className={`menu-item sub-item step ${riskTab === 'patches' ? 'hold' : 'pass'}`} onClick={() => setRiskTab('patches')}>
                    Patches
               </a>
               <a className={`menu-item sub-item step ${riskTab === 'baseline' ? 'hold' : 'pass'}`} onClick={() => setRiskTab('baseline')}>
                    Baseline
               </a>
               <a className={`menu-item sub-item step ${riskTab === 'dashboard' ? 'hold' : 'pass'}`} onClick={() => { setRiskTab('dashboard'); setRiskSubTab('overview'); }}>
                    Dashboard
               </a>
               {/* Nested Dashboard Tabs */}
               {riskTab === 'dashboard' && (
                   <div style={{ marginLeft: '24px', display: 'flex', flexDirection: 'column', marginTop: '4px' }}>
                       {['overview', 'cve', 'patch', 'computer', 'baseline'].map(sub => (
                           <a key={sub} className={`menu-item sub-item step ${riskSubTab === sub ? 'hold' : 'pass'}`} style={{ padding: '6px 20px 6px 24px', fontSize: '13px', borderLeft: 'none' }} onClick={() => setRiskSubTab(sub)}>
                               {sub === 'cve' ? 'CVEs' : sub === 'computer' ? 'Computers' : sub === 'patch' ? 'Patches' : sub === 'baseline' ? 'Baselines' : 'Overview'}
                           </a>
                       ))}
                   </div>
               )}
           </div>
        )}

        <a className={`menu-item ${activeMenu === 'kpi-details' ? 'active' : ''}`} onClick={() => onNavigate('kpi-details')}>
           <IconDashboard /> KPI Details
        </a>

        <div className="menu-label">Patch Management</div>
        <a className={`menu-item ${activeMenu === 'baseline' ? 'active' : ''}`} onClick={() => onNavigate('baseline')}>
           <IconFolder /> Baselines
        </a>
        <a className={`menu-item ${activeMenu === 'calendar' ? 'active' : ''}`} onClick={() => onNavigate('calendar')}>
           <IconCalendar /> Patch Calendar
        </a>

        <div className="menu-label">Infrastructure</div>
        <a className={`menu-item ${activeMenu === 'group' ? 'active' : ''}`} onClick={() => onNavigate('group')}>
           <IconGroup /> Group Management
        </a>
        {role !== 'EUC' && (
          <>
            <a className={`menu-item ${activeMenu === 'snapshot' ? 'active' : ''}`} onClick={() => onNavigate('snapshot')}>
               <IconFolder /> Take Snapshot
            </a>
            <a className={`menu-item ${activeMenu === 'clone' ? 'active' : ''}`} onClick={() => onNavigate('clone')}>
               <IconFolder /> Clone VM
            </a>
          </>
        )}

        {role === 'Admin' && (
          <>
            <div className="menu-label">Administration</div>
            <a className={`menu-item ${activeMenu === 'users' ? 'active' : ''}`} onClick={() => onNavigate('users')}>
               <IconGroup /> User Management
            </a>
            <a className={`menu-item ${activeMenu === 'settings' ? 'active' : ''}`} onClick={() => onNavigate('settings')}>
               <IconSettings /> Environment Settings
            </a>
          </>
        )}
      </div>
    </nav>
  );
}

export function Topbar({ onNavHistory, username, role, onLogout }) {
  return (
    <div className="topbar-main">
       <div className="flex-row items-center gap-12">
           <div style={{ display: 'flex', gap: 4 }}>
             <button className="iconbtn" onClick={() => onNavHistory(-1)}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 18l-6-6 6-6"/></svg></button>
             <button className="iconbtn" onClick={() => onNavHistory(1)}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 18l6-6-6-6"/></svg></button>
           </div>
       </div>
       <div className="flex-row items-center gap-16">
          <div className="user-info-top">
             <div className="user-avatar">{username ? username[0].toUpperCase() : 'U'}</div>
             <div className="user-details">
                <div className="user-name" title={username || 'User'}>{username || 'User'}</div>
                <div className="user-role">{role || 'Guest'}</div>
             </div>
          </div>
          <button className="btn outline dan" onClick={onLogout} style={{height: 32, padding: "0 12px"}}>
             <IconLogout /> Logout
          </button>
       </div>
    </div>
  );
}