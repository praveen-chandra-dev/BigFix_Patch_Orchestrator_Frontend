
// src/App.jsx
import { useState, useMemo, useCallback, useEffect, Suspense, lazy } from "react";
import "./styles/Style.css";
import DeploymentHistory, { Stage } from "./components/FlowCard.jsx";
import Environment, { EnvironmentProvider, useEnvironment } from "./components/Environment.jsx";
import DecisionEngine from "./components/DecisionEngine.jsx";
import Configuration from "./components/Configuration.jsx";
import Login from "./components/auth/Login.jsx";
import { Sidebar, Topbar } from "./components/Header.jsx";
import { useTeamState } from "./hooks/useTeamState.js";


const PilotEnvironment = lazy(() => import("./components/pilot/PilotEnvironment.jsx"));
const PilotSandboxResult = lazy(() => import("./components/pilot/PilotSandboxResult.jsx"));
const PilotKPI = lazy(() => import("./components/pilot/PilotKPI.jsx"));
const PilotDecisionEngine = lazy(() => import("./components/pilot/PilotDecisionEngine.jsx"));
const Management = lazy(() => import("./components/Management.jsx"));
const UserManagement = lazy(() => import("./components/UserManagement.jsx"));
const RoleManagement = lazy(() => import("./components/RoleManagement.jsx")); 
const GroupManager = lazy(() => import("./components/GroupManager.jsx"));
const SnapshotManager = lazy(() => import("./components/SnapshotSelector.jsx"));
const CloneManager = lazy(() => import("./components/CloneSelector.jsx"));
const PatchCalendar = lazy(() => import("./components/PatchCalendar.jsx"));
const RiskModule = lazy(() => import("./modules/risk/RiskModule.jsx"));
const KpiDashboard = lazy(() => import("./components/KpiDetails.jsx"));
const PatchPolicy = lazy(() => import("./modules/policy/PatchPolicy.jsx"));

const API = window.env?.VITE_API_BASE || "http://localhost:5174";

async function getJSON(url) { const r = await fetch(url, { headers: { Accept: "application/json" } }); return r.json(); }
async function postJSON(url, body) { const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }); return r.json(); }

function Main({ username, onOpenSnapshot, onOpenClone, onFlowUpdate, onNavigate }) {
  const { env, setEnv } = useEnvironment();
  const { state: teamState, saveState: updateTeamState, loading: stateLoading } = useTeamState();
  const apiBase = useMemo(() => API, []);

  useEffect(() => {
    getJSON(`${apiBase}/api/config`).then(res => {
        if(res.ok) setEnv(prev => ({...prev, enableSandbox: res.enableSandbox ?? true, enablePilot: res.enablePilot ?? true }));
    }).catch(console.error);
  }, [apiBase, setEnv]);

  const s = teamState || {};
  const currentStage = s.currentStage || Stage.CONFIG;
  const completedStages = s.completedStages || [];
  const configSaved = !!s.configSaved;
  const configLocked = !!s.configLocked;
  const sandboxTriggered = !!s.sandboxTriggered;
  const pilotTriggered = !!s.pilotTriggered;
  const productionTriggered = !!s.productionTriggered;
  const sandboxFinished = completedStages.includes(Stage.SANDBOX);
  const pilotFinished = completedStages.includes(Stage.PILOT);
  const productionFinished = completedStages.includes(Stage.PRODUCTION);
  const lastActions = s.lastActions || {};


  useEffect(() => {
    if (s.pilotUnlocked !== undefined || s.productionUnlocked !== undefined) {
      setEnv(p => {
         const pu = s.pilotUnlocked ?? p.pilotUnlocked;
         const pr = s.productionUnlocked ?? p.productionUnlocked;
         // 🚀 FIX: Prevent loop by safely returning existing state if nothing changed
         if (p.pilotUnlocked === pu && p.productionUnlocked === pr) return p;
         return { ...p, pilotUnlocked: pu, productionUnlocked: pr };
      });
    }
  }, [s.pilotUnlocked, s.productionUnlocked, setEnv]);

  const postStageSignal = async (stage, status) => { try { await fetch(`${apiBase}/orchestrator/stages/${stage}`, { method: "POST", body: JSON.stringify({ status }) }); } catch {} };



  const canGotoStage = useCallback((next) => {
    if (next === Stage.HISTORY) return true;
    if (next === Stage.CONFIG) return true;
    if (next === Stage.SANDBOX && !env.enableSandbox) return false;
    if (next === Stage.PILOT && !env.enablePilot) return false;
    
    if (next === Stage.SANDBOX) return (configSaved || completedStages.includes(Stage.CONFIG));
    
    // 🚀 FIX: Must click "Finish" (completedStages) to access the next tab
    if (next === Stage.PILOT) {
        if (!env.enableSandbox) return configSaved || completedStages.includes(Stage.CONFIG);
        return sandboxFinished;
    }
    
    if (next === Stage.PRODUCTION) {
        if (env.enablePilot) return pilotFinished;
        if (env.enableSandbox) return sandboxFinished;
        return configSaved || completedStages.includes(Stage.CONFIG);
    }
    
    if (next === Stage.FinalResult) return productionFinished;
    return false;
  }, [configSaved, sandboxFinished, pilotFinished, productionFinished, completedStages, env.enableSandbox, env.enablePilot]);

  const accessibleStages = useMemo(() => Object.values(Stage).filter(canGotoStage), [canGotoStage]);
  


  useEffect(() => {
    if (onFlowUpdate) {
        onFlowUpdate(prev => {
            // FIX: Deep compare arrays to prevent infinite re-rendering loops
            if (prev.current === currentStage && 
                JSON.stringify(prev.completed) === JSON.stringify(completedStages) && 
                JSON.stringify(prev.accessible) === JSON.stringify(accessibleStages)) {
                return prev;
            }
            return { current: currentStage, completed: completedStages, accessible: accessibleStages };
        });
    }
  }, [currentStage, completedStages, accessibleStages, onFlowUpdate]);

  const handleStageChange = useCallback((next) => { 
      if (canGotoStage(next)) { 
          updateTeamState({ currentStage: next }); 
          postStageSignal(next, "active"); 
      } 
  }, [canGotoStage, updateTeamState]);
  
  useEffect(() => {
    const onReq = (e) => handleStageChange(e.detail.stage);
    window.addEventListener('flow:request_stage', onReq);
    return () => window.removeEventListener('flow:request_stage', onReq);
  }, [handleStageChange]);

  function handleConfigSaved(newConfig) {
    const sbxEnabled = newConfig?.enableSandbox ?? env.enableSandbox;
    const pilotEnabled = newConfig?.enablePilot ?? env.enablePilot;
    
    let next = Stage.PRODUCTION;
    if (sbxEnabled) next = Stage.SANDBOX;
    else if (pilotEnabled) next = Stage.PILOT;

    const newCompleted = completedStages.includes(Stage.CONFIG) ? completedStages : [...completedStages, Stage.CONFIG];

    updateTeamState({ configSaved: true, configLocked: true, completedStages: newCompleted, currentStage: next });
    postStageSignal(Stage.CONFIG, "completed"); postStageSignal(next, "active");
  }

  

  // STAGE 1: SANDBOX HANDLERS
  const handleSandboxDone = async (result) => {
    if (!result?.ok) return;
    let newActions = lastActions;
    if (result?.actions) newActions = { ...lastActions, [Stage.SANDBOX]: { actions: result.actions, ts: Date.now() } };
    
    // Just save the state, DO NOT advance the stage yet
    updateTeamState({ sandboxTriggered: true, lastActions: newActions });
  };

  const handleFinishSandbox = () => {
    const newCompleted = completedStages.includes(Stage.SANDBOX) ? completedStages : [...completedStages, Stage.SANDBOX];
    const next = env.enablePilot ? Stage.PILOT : Stage.PRODUCTION;
    updateTeamState({ completedStages: newCompleted, currentStage: next });
    postStageSignal(Stage.SANDBOX, "completed"); postStageSignal(next, "active");
  };

  const handleResetSandbox = () => {
    const newActions = { ...lastActions };
    delete newActions[Stage.SANDBOX];
    updateTeamState({ sandboxTriggered: false, lastActions: newActions });
  };

 
//  STAGE 2 & 3: PILOT / PROD HANDLERS
  useEffect(() => {
    const onPilotTrig = (e) => { 
        if(!e?.detail?.actions) return;
        // 🚀 FIX: Pass standard object to updateTeamState so the database saves it correctly
        const newActions = { ...lastActions, [Stage.PILOT]: { actions: e.detail.actions, ts: Date.now() } };
        updateTeamState({ pilotTriggered: true, lastActions: newActions });
    };

    const onProdTrig = (e) => { 
        if(!e?.detail?.actions) return;
        // 🚀 FIX: Pass standard object to updateTeamState
        const newActions = { ...lastActions, [Stage.PRODUCTION]: { actions: e.detail.actions, ts: Date.now() } };
        updateTeamState({ productionTriggered: true, lastActions: newActions });
    };
    
    window.addEventListener("pilot:triggered", onPilotTrig); 
    window.addEventListener("production:triggered", onProdTrig);
    return () => { window.removeEventListener("pilot:triggered", onPilotTrig); window.removeEventListener("production:triggered", onProdTrig); };
  }, [lastActions, updateTeamState]);

  const handleFinishPilot = () => {
    const newCompleted = completedStages.includes(Stage.PILOT) ? completedStages : [...completedStages, Stage.PILOT];
    updateTeamState({ completedStages: newCompleted, currentStage: Stage.PRODUCTION });
    postStageSignal(Stage.PILOT, "completed"); postStageSignal(Stage.PRODUCTION, "active");
  };

  const handleResetPilot = () => {
    const newActions = { ...lastActions };
    delete newActions[Stage.PILOT];
    updateTeamState({ pilotTriggered: false, lastActions: newActions });
  };

  const handleFinishProduction = () => {
    let newCompleted = completedStages.includes(Stage.PRODUCTION) ? completedStages : [...completedStages, Stage.PRODUCTION];
    if (!newCompleted.includes(Stage.FinalResult)) newCompleted = [...newCompleted, Stage.FinalResult];
    updateTeamState({ completedStages: newCompleted, currentStage: Stage.FinalResult });
    postStageSignal(Stage.PRODUCTION, "completed");
  };

  const handleResetProduction = () => {
    const newActions = { ...lastActions };
    delete newActions[Stage.PRODUCTION];
    updateTeamState({ productionTriggered: false, lastActions: newActions });
  };

  useEffect(() => {
    const onResetSbx = () => {
      updateTeamState({ sandboxTriggered: false, pilotTriggered: false, completedStages: completedStages.filter(st => st !== Stage.SANDBOX && st !== Stage.PILOT && st !== Stage.PRODUCTION && st !== Stage.FinalResult), pilotUnlocked: false, productionUnlocked: false, currentStage: Stage.SANDBOX });
      setEnv(p => ({ ...p, pilotEvaluated: false, prodEvaluated: false, pilotUnlocked: false, prodUnlocked: false }));
      postStageSignal(Stage.SANDBOX, "active");
    };
    const onResetPilot = () => {
      updateTeamState({ pilotTriggered: false, completedStages: completedStages.filter(st => st !== Stage.PILOT && st !== Stage.PRODUCTION && st !== Stage.FinalResult), productionUnlocked: false, currentStage: Stage.PILOT });
      setEnv(p => ({ ...p, prodEvaluated: false, prodUnlocked: false }));
      postStageSignal(Stage.PILOT, "active");
    };
    const onResetAll = () => {
      updateTeamState({ sandboxTriggered: false, pilotTriggered: false, configSaved: false, configLocked: false, completedStages: [], lastActions: {}, pilotUnlocked: false, productionUnlocked: false, currentStage: Stage.CONFIG });
      setEnv(p => ({ ...p, pilotEvaluated: false, prodEvaluated: false, pilotUnlocked: false, prodUnlocked: false }));
      postStageSignal(Stage.CONFIG, "active");
    };

    window.addEventListener("orchestrator:resetToSandbox", onResetSbx); window.addEventListener("orchestrator:resetToPilot", onResetPilot); window.addEventListener("orchestrator:resetAll", onResetAll);
    return () => { window.removeEventListener("orchestrator:resetToSandbox", onResetSbx); window.removeEventListener("orchestrator:resetToPilot", onResetPilot); window.removeEventListener("orchestrator:resetAll", onResetAll); };
  }, [completedStages, updateTeamState, setEnv]);

  if (stateLoading) return <div className="app-loading-content">Loading Orchestration Flow...</div>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', animation: 'fadeIn 0.3s ease', minHeight: '100%' }}>
      {currentStage === Stage.HISTORY && <DeploymentHistory />}
      {currentStage === Stage.CONFIG && <Configuration onSaved={handleConfigSaved} />}


      {currentStage === Stage.SANDBOX && env.enableSandbox && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <div className="stage-cards-row">
              <Environment />
              {/* <DecisionEngine apiBase={apiBase} autoMail={env.autoMail} onDone={handleSandboxDone} disabled={sandboxTriggered} username={username} onFinish={handleFinishSandbox} onReset={handleResetSandbox} /> */}
<DecisionEngine apiBase={apiBase} autoMail={env.autoMail} onDone={handleSandboxDone} disabled={sandboxTriggered} username={username} onFinish={handleFinishSandbox} onReset={handleResetSandbox} currentActions={lastActions?.SANDBOX?.actions || []} stageFinished={sandboxFinished} />            </div>
            {/* 🚀 Show results instantly in the Sandbox stage */}
            {sandboxTriggered && lastActions?.SANDBOX?.actions && (
              <Suspense fallback={<div className="app-loading-content">Loading Results...</div>}>
                 <div className="stage-cards-row">
                   <PilotSandboxResult title="Sandbox Result" actions={lastActions.SANDBOX.actions} onViewDetails={(actId) => onNavigate('kpi-details', { type: 'success', id: actId })} />
                 </div>
              </Suspense>
            )}
        </div>
      )}

      {currentStage === Stage.PILOT && env.enablePilot && (
        <Suspense fallback={<div className="app-loading-content">Loading Pilot Data...</div>}>
          <div className="stage-cards-row">
            <PilotEnvironment mode="pilot" lastActions={lastActions} />
            {env.enableSandbox && (
              <PilotSandboxResult title="Sandbox Result" actions={lastActions?.SANDBOX?.actions} onViewDetails={(actId) => onNavigate('kpi-details', { type: 'success', id: actId })} />
            )}
            <PilotKPI title="Pilot KPI" lastActions={lastActions} onKpiClick={(type) => onNavigate('kpi-details', type)} />
          </div>
          <div className="stage-cards-row mt-20">
            <PilotDecisionEngine sbxDone={!env.enableSandbox || sandboxFinished} mode="pilot" autoMail={env.autoMail} readOnly={pilotTriggered} lastActions={lastActions} username={username} onOpenSnapshot={onOpenSnapshot} onOpenClone={onOpenClone} onFinish={handleFinishPilot} onResetStage={handleResetPilot} stageFinished={pilotFinished} />
            {/* <PilotDecisionEngine sbxDone={!env.enableSandbox || sandboxTriggered} mode="pilot" autoMail={env.autoMail} readOnly={pilotTriggered} lastActions={lastActions} username={username} onOpenSnapshot={onOpenSnapshot} onOpenClone={onOpenClone} onFinish={handleFinishPilot} onResetStage={handleResetPilot} /> */}
          </div>
          {/*  Show Pilot results instantly inside the Pilot stage */}
          {pilotTriggered && lastActions?.PILOT?.actions && (
              <div className="stage-cards-row mt-20">
                 <PilotSandboxResult title="Pilot Result" actions={lastActions.PILOT.actions} onViewDetails={(actId) => onNavigate('kpi-details', { type: 'success', id: actId })} />
              </div>
          )}
        </Suspense>
      )}

      {currentStage === Stage.PRODUCTION && (
        <Suspense fallback={<div className="app-loading-content">Loading Production Data...</div>}>
          <div className="stage-cards-row">
            <PilotEnvironment mode="production" lastActions={lastActions} />
            {env.enablePilot && (
              <PilotSandboxResult title="Pilot Result" actions={lastActions?.PILOT?.actions} onViewDetails={(actId) => onNavigate('kpi-details', { type: 'success', id: actId })} />
            )}
            {!env.enablePilot && env.enableSandbox && (
                <PilotSandboxResult title="Sandbox Result" actions={lastActions?.SANDBOX?.actions} onViewDetails={(actId) => onNavigate('kpi-details', { type: 'success', id: actId })} />
            )}
            <PilotKPI title="Production KPI" lastActions={lastActions} onKpiClick={(type) => onNavigate('kpi-details', type)} />
          </div>
          <div className="stage-cards-row mt-20">
            <PilotDecisionEngine sbxDone={true} pilotDone={true} mode="production" autoMail={env.autoMail} lastActions={lastActions} readOnly={productionTriggered} username={username} onOpenSnapshot={onOpenSnapshot} onOpenClone={onOpenClone} onFinish={handleFinishProduction} onResetStage={handleResetProduction} stageFinished={productionFinished} />
            {/* <PilotDecisionEngine sbxDone={true} pilotDone={true} mode="production" autoMail={env.autoMail} lastActions={lastActions} readOnly={productionTriggered} username={username} onOpenSnapshot={onOpenSnapshot} onOpenClone={onOpenClone} onFinish={handleFinishProduction} onResetStage={handleResetProduction} /> */}
          </div>
          
          {/* Render the Production Result HERE once it's triggered */}
          {productionTriggered && lastActions?.PRODUCTION?.actions && (
              <div className="stage-cards-row mt-20">
                 <PilotSandboxResult title="Production Result" actions={lastActions.PRODUCTION.actions} onViewDetails={(actId) => onNavigate('kpi-details', { type: 'success', id: actId })} />
              </div>
          )}
        </Suspense>
      )}

      {currentStage === Stage.FinalResult && (
        <Suspense fallback={null}>
          <div className="stage-cards-row">
             {env.enableSandbox && (
               <PilotSandboxResult title="Sandbox Result" actions={lastActions?.SANDBOX?.actions} onViewDetails={(actId) => onNavigate('kpi-details', { type: 'success', id: actId })} />
             )}
             {env.enablePilot && (
               <PilotSandboxResult title="Pilot Result" actions={lastActions?.PILOT?.actions} onViewDetails={(actId) => onNavigate('kpi-details', { type: 'success', id: actId })} />
             )}
             <PilotSandboxResult title="Production Result" actions={lastActions?.PRODUCTION?.actions} onViewDetails={(actId) => onNavigate('kpi-details', { type: 'success', id: actId })} />
          </div>
        </Suspense>
      )}
    </div>
  );
}

export default function App() {
  const [activeMenu, setActiveMenu] = useState('orchestration'); 
  const [riskTab, setRiskTab] = useState('patches');
  const [riskSubTab, setRiskSubTab] = useState('overview');
  const [kpiTab, setKpiTab] = useState('health'); 
  const [navHistory, setNavHistory] = useState(['orchestration']);
  const [historyIdx, setHistoryIdx] = useState(0);
  const [kpiContext, setKpiContext] = useState(null);
  const [session, setSession] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [flowState, setFlowState] = useState({ current: 'CONFIG', completed: [], accessible: ['CONFIG'] });
  const [timeoutModal, setTimeoutModal] = useState(false);

  const handleNavigate = (route, context = null) => {
    setKpiContext(context);
    if (context && route === 'kpi-details') {
        const cType = typeof context === 'string' ? context : context.type;
        if (cType) setKpiTab(cType);
    }
    const newHistory = navHistory.slice(0, historyIdx + 1);
    newHistory.push(route);
    setNavHistory(newHistory);
    setHistoryIdx(newHistory.length - 1);
    setActiveMenu(route);
  };

  const handleHistory = (dir) => {
    const nextIdx = historyIdx + dir;
    if (nextIdx >= 0 && nextIdx < navHistory.length) {
      setHistoryIdx(nextIdx);
      setActiveMenu(navHistory[nextIdx]);
    }
  };
  
  const handleLogout = async () => { 
    try { await postJSON(`${API}/api/auth/logout`, {}); } catch {} 
    setSession(null); sessionStorage.clear(); localStorage.clear();
    window.location.href = '/'; 
  };

  useEffect(() => {
    if (!session) return; 
    let timeoutId;
    const TIMEOUT_MINS = session.timeoutMins || 15;
    const TIMEOUT_MS = TIMEOUT_MINS * 60 * 1000;

    const resetTimer = () => {
        clearTimeout(timeoutId);
        timeoutId = setTimeout(() => {
            postJSON(`${API}/api/auth/logout`, {}).catch(()=>{});
            setTimeoutModal(true);
        }, TIMEOUT_MS);
    };

    let lastCall = Date.now();
    const handleActivity = () => {
        const now = Date.now();
        if (now - lastCall > 1000) { lastCall = now; resetTimer(); }
    };

    const events = ['mousemove', 'keydown', 'mousedown', 'scroll', 'touchstart'];
    events.forEach(event => window.addEventListener(event, handleActivity));
    resetTimer(); 

    return () => { clearTimeout(timeoutId); events.forEach(event => window.removeEventListener(event, handleActivity)); };
  }, [session]);

  useEffect(() => {
    setAuthLoading(true);
    getJSON(`${API}/api/auth/status`).then(d => {
       if(d.ok && d.authed && sessionStorage.getItem('BPS_SESSION_ACTIVE')) {
           sessionStorage.setItem("user_role", d.userData.role); 
           setSession({ ...d.userData, timeoutMins: d.timeoutMins });
       }
       else { setSession(null); sessionStorage.removeItem('BPS_SESSION_ACTIVE'); }
    }).finally(() => setAuthLoading(false));
  }, []);

  if (authLoading) return <div className="app-loading-full">Loading...</div>;

  if (!session) {
    return (
      <EnvironmentProvider>
        <Login onSuccess={(u)=>{sessionStorage.setItem('BPS_SESSION_ACTIVE','true');setSession(u)}} />
      </EnvironmentProvider>
    );
  }

  return (
    <EnvironmentProvider>
      <div style={{ display: "flex", height: "100vh", width: "100vw", overflow: "hidden", backgroundColor: "var(--bg)" }}>
        <Sidebar activeMenu={activeMenu} onNavigate={(route) => handleNavigate(route, null)} flowState={flowState} riskTab={riskTab} setRiskTab={setRiskTab} riskSubTab={riskSubTab} setRiskSubTab={setRiskSubTab} kpiTab={kpiTab} setKpiTab={(tab) => { setKpiTab(tab); setKpiContext(null); }} />
        
        <div className="main-wrapper">
          <Topbar onNavHistory={handleHistory} username={session?.username} onLogout={handleLogout} />

          <div className="app-content">
            {activeMenu === 'risk' ? <Suspense fallback={null}><RiskModule onClose={()=>handleNavigate('orchestration')} activeTab={riskTab} activeSubTab={riskSubTab} setRiskTab={setRiskTab} setRiskSubTab={setRiskSubTab} onSetPending={() => setRiskTab('baseline')}/></Suspense> :
             activeMenu === 'group' ? <Suspense fallback={null}><GroupManager onClose={()=>handleNavigate('orchestration')}/></Suspense> :
             activeMenu === 'snapshot' ? <Suspense fallback={null}><SnapshotManager onClose={()=>handleNavigate('orchestration')} groupName="All Computers"/></Suspense> :
             activeMenu === 'clone' ? <Suspense fallback={null}><CloneManager onClose={()=>handleNavigate('orchestration')} groupName="All Computers"/></Suspense> :
             activeMenu === 'calendar' ? <Suspense fallback={null}><PatchCalendar onClose={()=>handleNavigate('orchestration')} userRole={session?.role} /></Suspense> :
             activeMenu === 'settings' ? <Suspense fallback={null}><Management onClose={()=>handleNavigate('orchestration')} role={session?.role} /></Suspense> :
             activeMenu === 'users' ? <Suspense fallback={null}><UserManagement onClose={()=>handleNavigate('orchestration')} currentUserId={session?.userId}/></Suspense> :
             activeMenu === 'roles' ? <Suspense fallback={null}><RoleManagement onClose={()=>handleNavigate('orchestration')} role={session?.role} username={session?.username} /></Suspense> :
             activeMenu === 'kpi-details' ? <Suspense fallback={null}><KpiDashboard context={kpiContext} activeTab={kpiTab} /></Suspense> :
             activeMenu === 'orchestration' ? <Main username={session?.username} onOpenSnapshot={()=>handleNavigate('snapshot')} onOpenClone={()=>handleNavigate('clone')} onFlowUpdate={setFlowState} onNavigate={handleNavigate} /> :
             activeMenu === 'policy' ? <Suspense fallback={null}><PatchPolicy onClose={()=>handleNavigate('orchestration')}/></Suspense> : null
            }
          </div>
        </div>
      </div>
      
      {timeoutModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', backgroundColor: 'rgba(0,0,0,0.65)', zIndex: 9999999, display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(4px)' }}>
            <div style={{ backgroundColor: 'var(--panel)', padding: '32px', borderRadius: '12px', boxShadow: '0 20px 40px rgba(0,0,0,0.2)', maxWidth: '420px', width: '90%', textAlign: 'center', border: '1px solid var(--border)' }}>
                <div style={{ width: '56px', height: '56px', borderRadius: '50%', backgroundColor: '#fff3e0', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
                    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#f57c00" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>
                </div>
                <h2 style={{ margin: '0 0 12px 0', fontSize: '20px', fontWeight: 600, color: 'var(--text)' }}>Session Expired</h2>
                <p style={{ margin: '0 0 28px 0', color: 'var(--muted)', fontSize: '14px', lineHeight: '1.6' }}>For your security, you have been automatically logged out due to inactivity. Please log back in to continue where you left off.</p>
                <button className="btn primary" style={{ width: '100%', padding: '12px', fontSize: '15px', fontWeight: 500, borderRadius: '8px' }} onClick={() => { sessionStorage.clear(); localStorage.clear(); window.location.href = '/'; }}>Log Back In</button>
            </div>
        </div>
      )}
    </EnvironmentProvider>
  );
}