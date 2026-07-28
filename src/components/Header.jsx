// src/components/Header.jsx
import { useEffect, useState, useRef } from "react";
import PropTypes from "prop-types";
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
const IconPolicy = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
  </svg>
);

const MenuButton = ({ className = "menu-item", active, style, onClick, children }) => {
    const combinedClassName = `${className} ${active ? 'active' : ''}`.trim();
    const defaultStyles = { background: 'transparent', border: 'none', textAlign: 'left', width: '100%', font: 'inherit', cursor: 'pointer', outline: 'none' };
    return (
        <button type="button" className={combinedClassName} style={{ ...defaultStyles, ...style }} onClick={onClick}>
            {children}
        </button>
    );
};
MenuButton.propTypes = { className: PropTypes.string, active: PropTypes.bool, style: PropTypes.object, onClick: PropTypes.func, children: PropTypes.node };

const getRiskSubTabLabel = (sub) => {
    const labels = { cve: 'CVEs', computer: 'Computers', baseline: 'Baselines', overview: 'Overview' };
    return labels[sub] || 'Overview';
};

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

const navMgr = globalThis.__navMgr = globalThis.__navMgr || new NavManager();
let isRestoring = false;

export function Sidebar({ activeMenu, onNavigate, flowState, riskTab, setRiskTab, riskSubTab, setRiskSubTab, kpiTab, setKpiTab }) {
  const { env } = useEnvironment();
  const isMO = sessionStorage.getItem("isMO") === "true";

  const [localSnapTab, setLocalSnapTab] = useState('TARGETS');
  const [localCloneTab, setLocalCloneTab] = useState('TARGETS');
  const [localRoleTab, setLocalRoleTab] = useState('LIST');
  const [localPolicyTab, setLocalPolicyTab] = useState('LIST');
  const [roleMode, setRoleMode] = useState(sessionStorage.getItem('role_mode') || 'LIST');
  const [localGroupTab, setLocalGroupTab] = useState('COMPUTERS');

  useEffect(() => {
      const handleRoleMode = () => setRoleMode(sessionStorage.getItem('role_mode') || 'LIST');
      globalThis.addEventListener('sync:roles_mode', handleRoleMode);
      return () => globalThis.removeEventListener('sync:roles_mode', handleRoleMode);
  }, []);

  useEffect(() => {
    if (!isRestoring) {
        navMgr.push({ activeMenu, flowState: flowState?.current, riskTab, riskSubTab, kpiTab, localSnapTab, localCloneTab, localRoleTab, localGroupTab });
    }
  }, [activeMenu, flowState?.current, riskTab, riskSubTab, kpiTab, localSnapTab, localCloneTab, localRoleTab, localGroupTab]);

  useEffect(() => {
    const handleRestore = (e) => {
        const state = e.detail;
        if (!state) return;
        
        if (state.activeMenu !== activeMenu && onNavigate) onNavigate(state.activeMenu);
        if (state.flowState !== flowState?.current) globalThis.dispatchEvent(new CustomEvent('flow:request_stage', { detail: { stage: state.flowState } }));
        if (state.riskTab !== riskTab && setRiskTab) setRiskTab(state.riskTab);
        if (state.riskSubTab !== riskSubTab && setRiskSubTab) setRiskSubTab(state.riskSubTab);
        if (state.kpiTab !== kpiTab && setKpiTab) setKpiTab(state.kpiTab);
        if (state.localSnapTab !== localSnapTab) globalThis.dispatchEvent(new CustomEvent('nav:snapshot', { detail: state.localSnapTab }));
        if (state.localCloneTab !== localCloneTab) globalThis.dispatchEvent(new CustomEvent('nav:clone', { detail: state.localCloneTab }));
        if (state.localRoleTab !== localRoleTab) globalThis.dispatchEvent(new CustomEvent('nav:roles', { detail: state.localRoleTab }));
        if (state.localGroupTab !== localGroupTab) globalThis.dispatchEvent(new CustomEvent('nav:group', { detail: state.localGroupTab }));
        if (state.localPolicyTab !== localPolicyTab) globalThis.dispatchEvent(new CustomEvent('nav:policy', { detail: state.localPolicyTab })); 
    };
    globalThis.addEventListener('nav:restore', handleRestore);
    return () => globalThis.removeEventListener('nav:restore', handleRestore);
  });

  useEffect(() => {
    const handleSnap = (e) => setLocalSnapTab(e.detail);
    const handleClone = (e) => setLocalCloneTab(e.detail);
    const handleRole = (e) => setLocalRoleTab(e.detail);
    const handleGroup = (e) => setLocalGroupTab(e.detail);
    const handlePolicy = (e) => setLocalPolicyTab(e.detail);

    globalThis.addEventListener('sync:snapshot_tab', handleSnap);
    globalThis.addEventListener('sync:clone_tab', handleClone);
    globalThis.addEventListener('sync:roles_tab', handleRole);
    globalThis.addEventListener('sync:group_tab', handleGroup);
    globalThis.addEventListener('nav:policy', handlePolicy);

    return () => {
        globalThis.removeEventListener('sync:snapshot_tab', handleSnap);
        globalThis.removeEventListener('sync:clone_tab', handleClone);
        globalThis.removeEventListener('sync:roles_tab', handleRole);
        globalThis.removeEventListener('sync:group_tab', handleGroup);
        globalThis.removeEventListener('nav:policy', handlePolicy);
    };
  }, []);

  const renderStage = (stageCode, label) => {
    if (!flowState) return null;
    const isHold = flowState.current === stageCode;
    const isAccessible = flowState.accessible.includes(stageCode);

    let cls = "menu-item sub-item step";
    if (!isAccessible) cls += " disabled";

    return (
        <MenuButton className={cls} 
           style={{ fontWeight: isHold ? 'bold' : 'normal', color: 'inherit' }}
           onClick={() => {
            if (isAccessible) {
                globalThis.dispatchEvent(new CustomEvent('flow:request_stage', { detail: { stage: stageCode } }));
            }
        }}>
            {label}
        </MenuButton>
    );
  };

  const renderOrchestrationSubMenu = () => (
    <div className="sidebar-sub-menu">
        <MenuButton className="menu-item sub-item step" 
            style={{ fontWeight: flowState?.current === 'HISTORY' ? 'bold' : 'normal', color: 'inherit' }}
            onClick={() => globalThis.dispatchEvent(new CustomEvent('flow:request_stage', { detail: { stage: 'HISTORY' } }))}>
            Deployment History
        </MenuButton>
        {renderStage('CONFIG', 'Configuration')}
        {env.enableSandbox && renderStage('SANDBOX', 'Sandbox')}
        {env.enablePilot && renderStage('PILOT', 'Pilot')}
        {renderStage('PRODUCTION', 'Production')}
        {renderStage('FINAL RESULT', 'Final Result')}
    </div>
  );

  const renderRiskSubMenu = () => (
    <div className="sidebar-sub-menu">
        <MenuButton className="menu-item sub-item step" style={{ fontWeight: riskTab === 'patches' ? 'bold' : 'normal', color: 'inherit' }} onClick={() => setRiskTab('patches')}>
            Patches
        </MenuButton>
        <MenuButton className="menu-item sub-item step" style={{ fontWeight: riskTab === 'baseline' ? 'bold' : 'normal', color: 'inherit' }} onClick={() => setRiskTab('baseline')}>
            Manage Baselines
        </MenuButton>
        <MenuButton className="menu-item sub-item step" style={{ fontWeight: riskTab === 'dashboard' ? 'bold' : 'normal', color: 'inherit' }} onClick={() => { setRiskTab('dashboard'); setRiskSubTab('overview'); }}>
            Dashboard
        </MenuButton>
        {riskTab === 'dashboard' && (
            <div style={{ marginLeft: '40px', display: 'flex', flexDirection: 'column' }}>
                {['overview', 'cve', 'computer', 'baseline'].map(sub => (
                    <MenuButton key={sub} className="menu-item sub-item step" style={{ padding: '6px 20px 6px 24px', fontSize: '13px', borderLeft: 'none', fontWeight: riskSubTab === sub ? 'bold' : 'normal', color: 'inherit' }} onClick={() => setRiskSubTab(sub)}>
                        {getRiskSubTabLabel(sub)}
                    </MenuButton>
                ))}
            </div>
        )}
    </div>
  );

  const renderKpiSubMenu = () => (
    <div className="sidebar-sub-menu">
        <MenuButton className="menu-item sub-item step" style={{ fontWeight: kpiTab === 'health' ? 'bold' : 'normal', color: 'inherit' }} onClick={() => { if(setKpiTab) setKpiTab('health'); }}>
            Critical Health
        </MenuButton>
        <MenuButton className="menu-item sub-item step" style={{ fontWeight: kpiTab === 'reboot' ? 'bold' : 'normal', color: 'inherit' }} onClick={() => { if(setKpiTab) setKpiTab('reboot'); }}>
            Pending Reboots
        </MenuButton>
    </div>
  );

  const renderGroupSubMenu = () => (
    <div className="sidebar-sub-menu">
        <MenuButton className="menu-item sub-item step" style={{ fontWeight: localGroupTab === 'COMPUTERS' ? 'bold' : 'normal', color: 'inherit' }} onClick={() => globalThis.dispatchEvent(new CustomEvent('nav:group', {detail: 'COMPUTERS'}))}>
            Computer List
        </MenuButton>
        <MenuButton className="menu-item sub-item step" style={{ fontWeight: localGroupTab === 'CREATE' ? 'bold' : 'normal', color: 'inherit' }} onClick={() => globalThis.dispatchEvent(new CustomEvent('nav:group', {detail: 'CREATE'}))}>
            Create Group
        </MenuButton>
        <MenuButton className="menu-item sub-item step" style={{ fontWeight: localGroupTab === 'MANAGE' ? 'bold' : 'normal', color: 'inherit' }} onClick={() => globalThis.dispatchEvent(new CustomEvent('nav:group', {detail: 'MANAGE'}))}>
            Manage Groups
        </MenuButton>
    </div>
  );

  // S3776 Fix: Extracted style resolution logic out of inline conditional blocks
  const getRoleTabStyle = (expectedMode) => {
      const isListMode = roleMode === 'LIST';
      const isEditMode = roleMode === 'EDIT';
      
      let isEnabled = false;
      if (expectedMode === 'ALL') isEnabled = true;
      else if (expectedMode === 'NOT_LIST') isEnabled = !isListMode;
      else if (expectedMode === 'EDIT') isEnabled = isEditMode;

      return {
          fontWeight: 'normal',
          color: 'inherit',
          pointerEvents: isEnabled ? 'auto' : 'none',
          opacity: isEnabled ? 1 : 0.4,
          cursor: isEnabled ? 'pointer' : 'default'
      };
  };

  const renderRolesSubMenu = () => {
    const listActive = localRoleTab === 'LIST';
    const detailsActive = localRoleTab === 'DETAILS';
    const compActive = localRoleTab === 'COMPUTERS';
    const sitesActive = localRoleTab === 'SITES';
    const opActive = localRoleTab === 'OPERATORS';

    return (
      <div className="sidebar-sub-menu">
          <MenuButton className={`menu-item sub-item step ${listActive ? 'active' : ''}`} style={{ fontWeight: listActive ? 'bold' : 'normal', color: 'inherit' }} onClick={() => globalThis.dispatchEvent(new CustomEvent('nav:roles', {detail: 'LIST'}))}>
              Role List
          </MenuButton>
          <MenuButton className={`menu-item sub-item step ${detailsActive ? 'active' : ''}`} style={{ ...getRoleTabStyle('NOT_LIST'), fontWeight: detailsActive ? 'bold' : 'normal' }} onClick={() => globalThis.dispatchEvent(new CustomEvent('nav:roles', {detail: 'DETAILS'}))}>
              Details
          </MenuButton>
          <MenuButton className={`menu-item sub-item step ${compActive ? 'active' : ''}`} style={{ ...getRoleTabStyle('EDIT'), fontWeight: compActive ? 'bold' : 'normal' }} onClick={() => globalThis.dispatchEvent(new CustomEvent('nav:roles', {detail: 'COMPUTERS'}))}>
              Computer Assignments
          </MenuButton>
          <MenuButton className={`menu-item sub-item step ${sitesActive ? 'active' : ''}`} style={{ ...getRoleTabStyle('EDIT'), fontWeight: sitesActive ? 'bold' : 'normal' }} onClick={() => globalThis.dispatchEvent(new CustomEvent('nav:roles', {detail: 'SITES'}))}>
              Sites
          </MenuButton>
          <MenuButton className={`menu-item sub-item step ${opActive ? 'active' : ''}`} style={{ ...getRoleTabStyle('EDIT'), fontWeight: opActive ? 'bold' : 'normal' }} onClick={() => globalThis.dispatchEvent(new CustomEvent('nav:roles', {detail: 'OPERATORS'}))}>
              Operators
          </MenuButton>
      </div>
    );
  };

  return (
    <nav className="sidebar">
      <div className="sidebar-logo">
        <img src={logo} alt="HCL" style={{height: 28, borderRadius: 4}} />
        <span> BigFix Patch Setu</span>
      </div>
      
      <div className="sidebar-menu">
        <div className="menu-label">Dashboards</div>
        
        <MenuButton active={activeMenu === 'orchestration'} onClick={() => onNavigate('orchestration')}>
           <IconFlow /> Orchestration Flow
        </MenuButton>
        {activeMenu === 'orchestration' && renderOrchestrationSubMenu()}

        <MenuButton active={activeMenu === 'risk'} onClick={() => onNavigate('risk')}>
           <IconShield /> Risk Prioritization
        </MenuButton>
        {activeMenu === 'risk' && renderRiskSubMenu()}

        <MenuButton active={activeMenu === 'kpi-details'} onClick={() => { onNavigate('kpi-details'); if(setKpiTab) setKpiTab('health'); }}>
           <IconDashboard /> KPI Details
        </MenuButton>
        {activeMenu === 'kpi-details' && renderKpiSubMenu()}

        <div className="menu-label">Patch Management</div>
        <MenuButton active={activeMenu === 'calendar'} onClick={() => onNavigate('calendar')}>
           <IconCalendar /> Patch Calendar
        </MenuButton>

        {/* <MenuButton active={activeMenu === 'policy'} onClick={() => onNavigate('policy')}>
           <IconPolicy /> Patch Policy
        </MenuButton> */}

        {activeMenu === 'policy' && (
           <div className="sidebar-sub-menu">
               <MenuButton className="menu-item sub-item step" 
                  style={{ fontWeight: localPolicyTab === 'LIST' ? 'bold' : 'normal', color: 'inherit' }} 
                  onClick={() => globalThis.dispatchEvent(new CustomEvent('nav:policy', {detail: 'LIST'}))}>
                     Patch Policy List
               </MenuButton>
               <MenuButton className="menu-item sub-item step" 
                  style={{ fontWeight: localPolicyTab === 'CREATE' ? 'bold' : 'normal', color: 'inherit' }} 
                  onClick={() => globalThis.dispatchEvent(new CustomEvent('nav:policy', {detail: 'CREATE'}))}>
                     Create Patch Policy
               </MenuButton>
           </div>
        )}

        <div className="menu-label">Infrastructure</div>
        <MenuButton active={activeMenu === 'group'} onClick={() => onNavigate('group')}>
           <IconGroup /> Group Management
        </MenuButton>
        {activeMenu === 'group' && renderGroupSubMenu()}
        
        <MenuButton active={activeMenu === 'snapshot'} onClick={() => onNavigate('snapshot')}>
           <IconFolder /> Take Snapshot
        </MenuButton>
        {activeMenu === 'snapshot' && (
           <div className="sidebar-sub-menu">
               <MenuButton className="menu-item sub-item step" style={{ fontWeight: localSnapTab === 'TARGETS' ? 'bold' : 'normal', color: 'inherit' }} onClick={() => globalThis.dispatchEvent(new CustomEvent('nav:snapshot', {detail: 'TARGETS'}))}>
                     Targets
               </MenuButton>
               <MenuButton className="menu-item sub-item step" style={{ fontWeight: localSnapTab === 'SETTINGS' ? 'bold' : 'normal', color: 'inherit' }} onClick={() => globalThis.dispatchEvent(new CustomEvent('nav:snapshot', {detail: 'SETTINGS'}))}>
                    Settings
               </MenuButton>
               <MenuButton className="menu-item sub-item step" style={{ fontWeight: localSnapTab === 'EXECUTION' ? 'bold' : 'normal', color: 'inherit' }} onClick={() => globalThis.dispatchEvent(new CustomEvent('nav:snapshot', {detail: 'EXECUTION'}))}>
                    Execution
               </MenuButton>
           </div>
        )}

        <MenuButton active={activeMenu === 'clone'} onClick={() => onNavigate('clone')}>
           <IconFolder /> Clone VM
        </MenuButton>
        {activeMenu === 'clone' && (
           <div className="sidebar-sub-menu">
               <MenuButton className="menu-item sub-item step" style={{ fontWeight: localCloneTab === 'TARGETS' ? 'bold' : 'normal', color: 'inherit' }} onClick={() => globalThis.dispatchEvent(new CustomEvent('nav:clone', {detail: 'TARGETS'}))}>
                     Targets
               </MenuButton>
               <MenuButton className="menu-item sub-item step" style={{ fontWeight: localCloneTab === 'SETTINGS' ? 'bold' : 'normal', color: 'inherit' }} onClick={() => globalThis.dispatchEvent(new CustomEvent('nav:clone', {detail: 'SETTINGS'}))}>
                     Settings
               </MenuButton>
               <MenuButton className="menu-item sub-item step" style={{ fontWeight: localCloneTab === 'EXECUTION' ? 'bold' : 'normal', color: 'inherit' }} onClick={() => globalThis.dispatchEvent(new CustomEvent('nav:clone', {detail: 'EXECUTION'}))}>
                     Execution
               </MenuButton>
           </div>
        )}

        <div className="menu-label">Administration</div>
        
        {isMO && (
          <>
            <MenuButton active={activeMenu === 'users'} onClick={() => onNavigate('users')}>
               <IconGroup /> User Management
            </MenuButton>
            
            <MenuButton active={activeMenu === 'roles'} onClick={() => onNavigate('roles')}>
               <IconShield /> Role Management
            </MenuButton>
            {activeMenu === 'roles' && renderRolesSubMenu()}
          </>
        )}
        
        <MenuButton active={activeMenu === 'settings'} onClick={() => onNavigate('settings')}>
           <IconSettings /> Environment Settings
        </MenuButton>
      </div>
    </nav>
  );
}

Sidebar.propTypes = {
  activeMenu: PropTypes.string,
  onNavigate: PropTypes.func,
  flowState: PropTypes.shape({
    current: PropTypes.string,
    accessible: PropTypes.arrayOf(PropTypes.string)
  }),
  riskTab: PropTypes.string,
  setRiskTab: PropTypes.func,
  riskSubTab: PropTypes.string,
  setRiskSubTab: PropTypes.func,
  kpiTab: PropTypes.string,
  setKpiTab: PropTypes.func
};

export function Topbar({ onNavHistory, username, onLogout }) {
  const [roles, setRoles] = useState([]);
  const [isMO, setIsMO] = useState(false);
  const [activeRole, setActiveRole] = useState(sessionStorage.getItem('user_role') || '');
  const [showDropdown, setShowDropdown] = useState(false);
  const [hasBfCreds, setHasBfCreds] = useState(true); 
  const dropdownRef = useRef(null);

  // S3776 Fix: Flattened massive useEffect logic out into a clear sync function
  const syncRoleState = (data) => {
    let currentSessionRole = sessionStorage.getItem('user_role');
    
    if (currentSessionRole === 'null' || currentSessionRole === 'undefined') {
        currentSessionRole = '';
    }

    const userIsAdmin = currentSessionRole === 'Admin';
    setIsMO(userIsAdmin);
    sessionStorage.setItem('isMO', userIsAdmin ? 'true' : 'false');
    
    const fetchedRoles = Array.isArray(data.roles) ? data.roles.map(r => r.trim()) : [];
    setRoles(fetchedRoles);
    
    if (!userIsAdmin) {
        if (fetchedRoles.length > 0) {
            const isCurrentInvalid = !currentSessionRole || 
                                     currentSessionRole === 'No Role Assigned' || 
                                     !fetchedRoles.includes(currentSessionRole.trim());
            if (isCurrentInvalid) {
                currentSessionRole = fetchedRoles[0];
                sessionStorage.setItem('user_role', currentSessionRole);
                
                fetch(`/api/auth/team-state?role=${encodeURIComponent(currentSessionRole)}`, {
                    method: 'GET',
                    headers: { "Content-Type": "application/json", "x-user-role": currentSessionRole }
                }).catch(() => {});
            }
        } else {
            currentSessionRole = 'No Role Assigned';
            sessionStorage.setItem('user_role', currentSessionRole);
        }
    }

    setActiveRole(currentSessionRole || 'No Role Assigned');
    globalThis.dispatchEvent(new CustomEvent('role:changed', { detail: currentSessionRole || 'No Role Assigned' }));
  };

  useEffect(() => {
    fetch('/api/auth/roles')
      .then(r => r.json())
      .then(data => {
        if (data.ok) syncRoleState(data);
      });
  }, []);

  useEffect(() => {
    const checkCreds = () => {
      const API = globalThis.env?.VITE_API_BASE || "";
      fetch(`${API}/api/auth/my-bigfix-creds`, { credentials: 'include' })
        .then(r => r.json())
        .then(data => {
          if (data.ok) {
            setHasBfCreds(data.hasCreds);
          }
        }).catch(() => {});
    };
    
    checkCreds();

    const onCredsUpdated = () => {
      setHasBfCreds(true);
    };

    globalThis.addEventListener('bf-creds-updated', onCredsUpdated);
    return () => globalThis.removeEventListener('bf-creds-updated', onCredsUpdated);
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
    
    fetch(`/api/auth/team-state?role=${encodeURIComponent(newRole)}`, {
        method: 'GET',
        headers: { "Content-Type": "application/json", "x-user-role": newRole }
    }).then(() => {
        globalThis.location.reload(); 
    }).catch(() => {
        globalThis.location.reload(); 
    });
  };

  const handleBack = () => {
    const state = navMgr.back();
    if (state) {
        isRestoring = true;
        globalThis.dispatchEvent(new CustomEvent('nav:restore', { detail: state }));
        setTimeout(() => { isRestoring = false; }, 100);
    } else {
        onNavHistory(-1); 
    }
  };

  const handleForward = () => {
    const state = navMgr.forward();
    if (state) {
        isRestoring = true;
        globalThis.dispatchEvent(new CustomEvent('nav:restore', { detail: state }));
        setTimeout(() => { isRestoring = false; }, 100);
    } else {
        onNavHistory(1); 
    }
  };

  const userRoleDisplay = activeRole || (roles.length > 0 ? roles[0] : 'No Role Assigned');
  const hasMultipleRoles = !isMO && roles.length > 1;

  return (
   <div className="topbar-main" style={{ position: 'relative', zIndex: 999, justifyContent: 'space-between' }}>

      <div style={{ display: 'flex', gap: '8px' }}>
          <button className="iconbtn" onClick={handleBack} title="Go Back">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"></polyline></svg>
          </button>
          <button className="iconbtn" onClick={handleForward} title="Go Forward">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>
          </button>
      </div>

      {!hasBfCreds && (
         <div style={{ flex: 1, display: 'flex', justifyContent: 'center', margin: '0 16px' }}>
            <div style={{ background: '#fff3e0', color: '#e65100', padding: '6px 16px', borderRadius: '6px', fontSize: '10px', fontWeight: 600, border: '1px solid #ffcc80', display: 'flex', alignItems: 'center', gap: '8px', boxShadow: '0 2px 4px rgba(0,0,0,0.05)' }}>
               <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>
               <span>Action Required: Missing BigFix Credentials. Please Update BigFix Credentials in Environment Settings.</span>
            </div>
         </div>
      )}

      <div className="flex-row items-center gap-16">

        <div ref={dropdownRef} style={{ position: 'relative' }}>
          {/* S6819 & S6848 Fix: Native HTML button automatically provides correct keyboard support! */}
          <button
            type="button"
            onClick={() => { if (hasMultipleRoles) setShowDropdown(!showDropdown); }}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              padding: '6px 12px',
              borderRadius: '10px',
              border: showDropdown ? '1px solid var(--primary)' : '1px solid var(--border)',
              background: 'var(--panel)',
              cursor: hasMultipleRoles ? 'pointer' : 'default',
              outline: 'none',
              textAlign: 'left',
              font: 'inherit'
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
             </button>

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
                    zIndex: 1000, 
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
                            // S6819 & S6848 Fix: Used native HTML button to safely supply ARIA keyboard events
                            return (
                                <button type="button" key={r} 
                                     onClick={() => handleRoleChange(r)} 
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
                                         transition: 'all 0.15s ease',
                                         outline: 'none',
                                         border: 'none',
                                         textAlign: 'left',
                                         width: '100%',
                                         font: 'inherit'
                                     }}
                                     onMouseOver={(e) => { if (!isActive) e.currentTarget.style.background = 'var(--bg)' }}
                                     onFocus={(e) => { if (!isActive) e.currentTarget.style.background = 'var(--bg)' }}
                                     onMouseOut={(e) => { if (!isActive) e.currentTarget.style.background = 'transparent' }}
                                     onBlur={(e) => { if (!isActive) e.currentTarget.style.background = 'transparent' }}
                                >
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '18px' }}>
                                        {isActive ? (
                                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg>
                                        ) : (
                                            <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'var(--border)' }} />
                                        )}
                                    </div>
                                    <span style={{ flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r}</span>
                                </button>
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

Topbar.propTypes = {
  onNavHistory: PropTypes.func,
  username: PropTypes.string,
  onLogout: PropTypes.func
};