// src/App.jsx
import { useState, useMemo, useCallback, useEffect, Suspense, lazy } from "react";
import "./styles/Style.css";
import DeploymentHistory, { Stage } from "./components/FlowCard.jsx";
import Environment, { EnvironmentProvider, useEnvironment } from "./components/Environment.jsx";
import DecisionEngine from "./components/DecisionEngine.jsx";
import Configuration from "./components/Configuration.jsx";
import Login from "./components/auth/Login.jsx";

// Import new Sidebar/Topbar
import { Sidebar, Topbar } from "./components/Header.jsx";
// Import the new hook for DB state
import { useTeamState } from "./hooks/useTeamState.js";

const PilotEnvironment = lazy(() => import("./components/pilot/PilotEnvironment.jsx"));
const PilotSandboxResult = lazy(() => import("./components/pilot/PilotSandboxResult.jsx"));
const PilotKPI = lazy(() => import("./components/pilot/PilotKPI.jsx"));
const PilotDecisionEngine = lazy(() => import("./components/pilot/PilotDecisionEngine.jsx"));
const Management = lazy(() => import("./components/Management.jsx"));
const UserManagement = lazy(() => import("./components/UserManagement.jsx"));
const RoleManagement = lazy(() => import("./components/RoleManagement.jsx")); 
const BaselineManager = lazy(() => import("./components/BaselineManager.jsx"));
const GroupManager = lazy(() => import("./components/GroupManager.jsx"));
const SnapshotManager = lazy(() => import("./components/SnapshotSelector.jsx"));
const CloneManager = lazy(() => import("./components/CloneSelector.jsx"));
const PatchCalendar = lazy(() => import("./components/PatchCalendar.jsx"));
const RiskModule = lazy(() => import("./modules/risk/RiskModule.jsx"));
const KpiDashboard = lazy(() => import("./components/KpiDetails.jsx"));

const API = window.env?.VITE_API_BASE || "http://localhost:5174";

async function getJSON(url) { const r = await fetch(url, { headers: { Accept: "application/json" } }); return r.json(); }
async function postJSON(url, body) { const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }); return r.json(); }

function Main({ username, onOpenSnapshot, onOpenClone, onFlowUpdate, onNavigate }) {
  const { env, setEnv } = useEnvironment();
  
  // REPLACE OLD LOCAL STORAGE / DIRECT FETCH WITH DB HOOK
  const { state: teamState, saveState: updateTeamState, loading: stateLoading } = useTeamState();

  const apiBase = useMemo(() => API, []);

  useEffect(() => {
    getJSON(`${apiBase}/api/config`).then(res => {
        if(res.ok) setEnv(prev => ({...prev, enableSandbox: res.enableSandbox ?? true, enablePilot: res.enablePilot ?? true }));
    }).catch(console.error);
  }, [apiBase, setEnv]);

  // Extract fields from shared DB state
  const s = teamState || {};
  const currentStage = s.currentStage || Stage.CONFIG;
  const completedStages = s.completedStages || [];
  const configSaved = !!s.configSaved;
  const configLocked = !!s.configLocked;
  const sandboxTriggered = !!s.sandboxTriggered;
  const pilotTriggered = !!s.pilotTriggered;
  const lastActions = s.lastActions || {};

  // Sync unlocks from DB to local env state
  useEffect(() => {
    if (s.pilotUnlocked !== undefined || s.productionUnlocked !== undefined) {
      setEnv(p => ({ 
        ...p, 
        pilotUnlocked: s.pilotUnlocked ?? p.pilotUnlocked, 
        productionUnlocked: s.productionUnlocked ?? p.productionUnlocked 
      }));
    }
  }, [s.pilotUnlocked, s.productionUnlocked, setEnv]);

  const postStageSignal = async (stage, status) => { try { await fetch(`${apiBase}/orchestrator/stages/${stage}`, { method: "POST", body: JSON.stringify({ status }) }); } catch {} };

  const canGotoStage = useCallback((next) => {
    if (next === Stage.HISTORY) return true;
    if (next === Stage.CONFIG) return true;
    
    if (next === Stage.SANDBOX && !env.enableSandbox) return false;
    if (next === Stage.PILOT && !env.enablePilot) return false;
    
    if (next === Stage.SANDBOX) return (configSaved || completedStages.includes(Stage.CONFIG));
    if (next === Stage.PILOT) return env.enableSandbox ? completedStages.includes(Stage.SANDBOX) : (configSaved || completedStages.includes(Stage.CONFIG));
    if (next === Stage.PRODUCTION) {
        if (env.enablePilot) return completedStages.includes(Stage.PILOT);
        if (env.enableSandbox) return completedStages.includes(Stage.SANDBOX);
        return (configSaved || completedStages.includes(Stage.CONFIG));
    }
    if (next === Stage.FinalResult) return completedStages.includes(Stage.PRODUCTION);
    return false;
  }, [configSaved, completedStages, env.enableSandbox, env.enablePilot]);

  const accessibleStages = useMemo(() => Object.values(Stage).filter(canGotoStage), [canGotoStage]);
  
  useEffect(() => {
    if (onFlowUpdate) {
        onFlowUpdate({ current: currentStage, completed: completedStages, accessible: accessibleStages });
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

    updateTeamState({
        configSaved: true,
        configLocked: true,
        completedStages: newCompleted,
        currentStage: next
    });

    postStageSignal(Stage.CONFIG, "completed");
    postStageSignal(next, "active");
  }

  const handleSandboxDone = async (result) => {
    if (!result?.ok) return;
    
    let newActions = lastActions;
    if (result?.actionId) {
        newActions = { ...lastActions, [Stage.SANDBOX]: { id: result.actionId, group: env.sbxGroup, ts: Date.now() } };
    }
    
    const newCompleted = completedStages.includes(Stage.SANDBOX) ? completedStages : [...completedStages, Stage.SANDBOX];
    const next = env.enablePilot ? Stage.PILOT : Stage.PRODUCTION;

    updateTeamState({
        sandboxTriggered: true,
        completedStages: newCompleted,
        lastActions: newActions,
        currentStage: next
    });
    
    postStageSignal(Stage.SANDBOX, "completed");
    postStageSignal(next, "active");
  };

  useEffect(() => {
    const onPilotTrig = (e) => { 
        let newActions = lastActions;
        if(e?.detail?.actionId) {
            newActions = { ...lastActions, [Stage.PILOT]: { id: e.detail.actionId, group: e.detail.group, ts: Date.now() } };
        }
        const newCompleted = completedStages.includes(Stage.PILOT) ? completedStages : [...completedStages, Stage.PILOT];
        
        updateTeamState({
            pilotTriggered: true,
            lastActions: newActions,
            completedStages: newCompleted,
            currentStage: Stage.PRODUCTION
        });
        
        postStageSignal(Stage.PILOT, "completed");
        postStageSignal(Stage.PRODUCTION, "active");
    };

    const onProdTrig = (e) => { 
        let newActions = lastActions;
        if(e?.detail?.actionId) {
            newActions = { ...lastActions, [Stage.PRODUCTION]: { id: e.detail.actionId, group: e.detail.group, ts: Date.now() } };
        }
        let newCompleted = completedStages.includes(Stage.PRODUCTION) ? completedStages : [...completedStages, Stage.PRODUCTION];
        if (!newCompleted.includes(Stage.FinalResult)) newCompleted = [...newCompleted, Stage.FinalResult];

        updateTeamState({
            lastActions: newActions,
            completedStages: newCompleted,
            currentStage: Stage.FinalResult
        });
        
        postStageSignal(Stage.PRODUCTION, "completed");
    };
    
    window.addEventListener("pilot:triggered", onPilotTrig); 
    window.addEventListener("production:triggered", onProdTrig);
    
    return () => { 
        window.removeEventListener("pilot:triggered", onPilotTrig); 
        window.removeEventListener("production:triggered", onProdTrig); 
    };
  }, [lastActions, completedStages, updateTeamState]);

  useEffect(() => {
    const onResetSbx = () => {
      updateTeamState({
          sandboxTriggered: false, 
          pilotTriggered: false,
          completedStages: completedStages.filter(st => st !== Stage.SANDBOX && st !== Stage.PILOT && st !== Stage.PRODUCTION && st !== Stage.FinalResult),
          pilotUnlocked: false,
          productionUnlocked: false,
          currentStage: Stage.SANDBOX
      });
      setEnv(p => ({ ...p, pilotEvaluated: false, prodEvaluated: false, pilotUnlocked: false, prodUnlocked: false }));
      postStageSignal(Stage.SANDBOX, "active");
    };

    const onResetPilot = () => {
      updateTeamState({
          pilotTriggered: false,
          completedStages: completedStages.filter(st => st !== Stage.PILOT && st !== Stage.PRODUCTION && st !== Stage.FinalResult),
          productionUnlocked: false,
          currentStage: Stage.PILOT
      });
      setEnv(p => ({ ...p, prodEvaluated: false, prodUnlocked: false }));
      postStageSignal(Stage.PILOT, "active");
    };

    const onResetAll = () => {
      updateTeamState({
          sandboxTriggered: false, pilotTriggered: false, configSaved: false, configLocked: false,
          completedStages: [], lastActions: {},
          pilotUnlocked: false, productionUnlocked: false,
          currentStage: Stage.CONFIG
      });
      setEnv(p => ({ ...p, pilotEvaluated: false, prodEvaluated: false, pilotUnlocked: false, prodUnlocked: false }));
      postStageSignal(Stage.CONFIG, "active");
    };

    window.addEventListener("orchestrator:resetToSandbox", onResetSbx);
    window.addEventListener("orchestrator:resetToPilot", onResetPilot);
    window.addEventListener("orchestrator:resetAll", onResetAll);
    
    return () => {
      window.removeEventListener("orchestrator:resetToSandbox", onResetSbx);
      window.removeEventListener("orchestrator:resetToPilot", onResetPilot);
      window.removeEventListener("orchestrator:resetAll", onResetAll);
    };
  }, [completedStages, updateTeamState, setEnv]);

  if (stateLoading) return <div className="app-loading-content">Loading Orchestration Flow...</div>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', animation: 'fadeIn 0.3s ease', minHeight: '100%' }}>

      {currentStage === Stage.HISTORY && <DeploymentHistory />}
      {currentStage === Stage.CONFIG && <Configuration onSaved={handleConfigSaved} />}

      {/* HARDCODED OS/EUC CHECKS COMPLETELY REMOVED! */}
      {currentStage === Stage.SANDBOX && env.enableSandbox && (
        <div className="stage-cards-row">
          <Environment />
          <DecisionEngine apiBase={apiBase} baseline={env.baseline} group={env.sbxGroup} autoMail={env.autoMail} onDone={handleSandboxDone} disabled={sandboxTriggered} username={username} />
        </div>
      )}

      {currentStage === Stage.PILOT && env.enablePilot && (
        <Suspense fallback={<div className="app-loading-content">Loading Pilot Data...</div>}>
          <div className="stage-cards-row">
            <PilotEnvironment mode="pilot" />
            {env.enableSandbox && (
              <PilotSandboxResult 
                title="Sandbox Result" 
                actionId={lastActions?.SANDBOX?.id} 
                onViewDetails={() => onNavigate('kpi-details', { type: 'success', id: lastActions?.SANDBOX?.id, group: lastActions?.SANDBOX?.group })} 
              />
            )}
            <PilotKPI title="Pilot KPI" lastActions={lastActions} onKpiClick={(type) => onNavigate('kpi-details', type)} />
          </div>
          <div className="stage-cards-row mt-20">
            <PilotDecisionEngine sbxDone={!env.enableSandbox || sandboxTriggered} mode="pilot" autoMail={env.autoMail} readOnly={pilotTriggered} lastActions={lastActions} username={username} onOpenSnapshot={onOpenSnapshot} onOpenClone={onOpenClone} />
          </div>
        </Suspense>
      )}

      {currentStage === Stage.PRODUCTION && (
        <Suspense fallback={<div className="app-loading-content">Loading Production Data...</div>}>
          <div className="stage-cards-row">
            <PilotEnvironment mode="production" />
            {env.enablePilot && (
                <PilotSandboxResult 
                  title="Pilot Result" 
                  actionId={lastActions?.PILOT?.id} 
                  onViewDetails={() => onNavigate('kpi-details', { type: 'success', id: lastActions?.PILOT?.id, group: lastActions?.PILOT?.group })} 
                />
            )}
            {!env.enablePilot && env.enableSandbox && (
                <PilotSandboxResult 
                  title="Sandbox Result" 
                  actionId={lastActions?.SANDBOX?.id} 
                  onViewDetails={() => onNavigate('kpi-details', { type: 'success', id: lastActions?.SANDBOX?.id, group: lastActions?.SANDBOX?.group })} 
                />
            )}
            <PilotKPI title="Production KPI" lastActions={lastActions} onKpiClick={(type) => onNavigate('kpi-details', type)} />
          </div>
          <div className="stage-cards-row mt-20">
            <PilotDecisionEngine sbxDone={true} pilotDone={true} mode="production" autoMail={env.autoMail} lastActions={lastActions} username={username} onOpenSnapshot={onOpenSnapshot} onOpenClone={onOpenClone} />
          </div>
        </Suspense>
      )}

      {currentStage === Stage.FinalResult && (
        <Suspense fallback={null}>
          <div className="stage-cards-row">
             {env.enableSandbox && (
               <PilotSandboxResult 
                 title="Sandbox Result" 
                 actionId={lastActions?.SANDBOX?.id} 
                 onViewDetails={() => onNavigate('kpi-details', { type: 'success', id: lastActions?.SANDBOX?.id, group: lastActions?.SANDBOX?.group })} 
               />
             )}
             {env.enablePilot && (
               <PilotSandboxResult 
                 title="Pilot Result" 
                 actionId={lastActions?.PILOT?.id} 
                 onViewDetails={() => onNavigate('kpi-details', { type: 'success', id: lastActions?.PILOT?.id, group: lastActions?.PILOT?.group })} 
               />
             )}
             <PilotSandboxResult 
               title="Production Result" 
               actionId={lastActions?.PRODUCTION?.id} 
               onViewDetails={() => onNavigate('kpi-details', { type: 'success', id: lastActions?.PRODUCTION?.id, group: lastActions?.PRODUCTION?.group })} 
             />
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
    setAuthLoading(true);
    getJSON(`${API}/api/auth/status`).then(d => {
       if(d.ok && d.authed && sessionStorage.getItem('BPS_SESSION_ACTIVE')) setSession(d.userData);
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
        <Sidebar 
          activeMenu={activeMenu}
          onNavigate={(route) => handleNavigate(route, null)}
          flowState={flowState}
          riskTab={riskTab}
          setRiskTab={setRiskTab}
          riskSubTab={riskSubTab}
          setRiskSubTab={setRiskSubTab}
          kpiTab={kpiTab}
          setKpiTab={(tab) => {
              setKpiTab(tab);
              setKpiContext(null); 
          }}
        />
        
        <div className="main-wrapper">
          <Topbar 
            onNavHistory={handleHistory} 
            username={session?.username} 
            onLogout={handleLogout} 
          />

          <div className="app-content">
            {activeMenu === 'risk' ? (
                <Suspense fallback={null}>
                    <RiskModule 
                        onClose={()=>handleNavigate('orchestration')} 
                        activeTab={riskTab} 
                        activeSubTab={riskSubTab}
                        setRiskTab={setRiskTab}
                        setRiskSubTab={setRiskSubTab}
                        onSetPending={() => setRiskTab('baseline')}
                    />
                </Suspense>
            ) :
             //activeMenu === 'baseline' ? <Suspense fallback={null}><BaselineManager onClose={()=>handleNavigate('orchestration')}/></Suspense> :
             activeMenu === 'group' ? <Suspense fallback={null}><GroupManager onClose={()=>handleNavigate('orchestration')}/></Suspense> :
             activeMenu === 'snapshot' ? <Suspense fallback={null}><SnapshotManager onClose={()=>handleNavigate('orchestration')} groupName="All Computers"/></Suspense> :
             activeMenu === 'clone' ? <Suspense fallback={null}><CloneManager onClose={()=>handleNavigate('orchestration')} groupName="All Computers"/></Suspense> :
             activeMenu === 'calendar' ? <Suspense fallback={null}><PatchCalendar onClose={()=>handleNavigate('orchestration')} userRole={session?.role} /></Suspense> :
             activeMenu === 'settings' ? <Suspense fallback={null}><Management onClose={()=>handleNavigate('orchestration')} role={session?.role} /></Suspense> :
             activeMenu === 'users' ? <Suspense fallback={null}><UserManagement onClose={()=>handleNavigate('orchestration')} currentUserId={session?.userId}/></Suspense> :
             activeMenu === 'roles' ? <Suspense fallback={null}><RoleManagement onClose={()=>handleNavigate('orchestration')} role={session?.role} username={session?.username} /></Suspense> :
             activeMenu === 'kpi-details' ? <Suspense fallback={null}><KpiDashboard context={kpiContext} activeTab={kpiTab} /></Suspense> :
             activeMenu === 'orchestration' ? <Main username={session?.username} onOpenSnapshot={()=>handleNavigate('snapshot')} onOpenClone={()=>handleNavigate('clone')} onFlowUpdate={setFlowState} onNavigate={handleNavigate} /> : null
            }
          </div>
        </div>
      </div>
    </EnvironmentProvider>
  );
}