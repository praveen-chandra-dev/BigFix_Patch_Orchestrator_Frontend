// src/App.jsx
import { useState, useMemo, useCallback, useEffect, Suspense, lazy, useRef } from "react";
import "./styles/Style.css";
import DeploymentHistory, { Stage } from "./components/FlowCard.jsx";
import Environment, { EnvironmentProvider, useEnvironment } from "./components/Environment.jsx";
import DecisionEngine from "./components/DecisionEngine.jsx";
import ReportNotification from "./components/ReportNotification.jsx";
import Configuration from "./components/Configuration.jsx";
import Login from "./components/auth/Login.jsx";

// Import new Sidebar/Topbar
import { Sidebar, Topbar } from "./components/Header.jsx";

const PilotEnvironment = lazy(() => import("./components/pilot/PilotEnvironment.jsx"));
const PilotSandboxResult = lazy(() => import("./components/pilot/PilotSandboxResult.jsx"));
const PilotKPI = lazy(() => import("./components/pilot/PilotKPI.jsx"));
const PilotDecisionEngine = lazy(() => import("./components/pilot/PilotDecisionEngine.jsx"));
const PilotReports = lazy(() => import("./components/pilot/PilotReports.jsx"));
const Management = lazy(() => import("./components/Management.jsx"));
const UserManagement = lazy(() => import("./components/UserManagement.jsx"));
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

const STATE_ID_MAP = { 'Admin': 1, 'Windows': 9002, 'Linux': 9003, 'EUC': 9004 };

function Main({ userId, username, role, onOpenSnapshot, onOpenClone, onFlowUpdate, onNavigate }) {
  const { env, setEnv } = useEnvironment();
  const [stateLoading, setStateLoading] = useState(true);
  const isInitialMount = useRef(true);
  const [currentStage, setCurrentStage] = useState(Stage.CONFIG);
  const [sandboxTriggered, setSandboxTriggered] = useState(false);
  const [pilotTriggered, setPilotTriggered] = useState(false);
  const [configLocked, setConfigLocked] = useState(false);
  const [configSaved, setConfigSaved] = useState(false);
  const [completedStages, setCompletedStages] = useState([]);
  const [lastActions, setLastActions] = useState({});

  const isEUC = role === 'EUC';
  const apiBase = useMemo(() => API, []);
  const sharedStateId = STATE_ID_MAP[role] || 1;

  useEffect(() => {
    getJSON(`${apiBase}/api/config`).then(res => {
        if(res.ok) setEnv(prev => ({...prev, enableSandbox: res.enableSandbox ?? true, enablePilot: res.enablePilot ?? true }));
    }).catch(console.error);
  }, [apiBase, setEnv]);

  const fetchState = useCallback(async () => {
    if (!userId) { setStateLoading(false); return; }
    setStateLoading(true);
    try {
      const data = await getJSON(`${apiBase}/api/auth/state/${sharedStateId}`);
      if (data.state) {
        const s = data.state;
        if (s?.currentStage && s.currentStage !== Stage.HISTORY) setCurrentStage(s.currentStage);
        if (Array.isArray(s?.completedStages)) setCompletedStages(s.completedStages);
        if (s?.configSaved) setConfigSaved(true);
        if (s?.configLocked) setConfigLocked(true);
        if (s?.sandboxTriggered) setSandboxTriggered(true);
        if (s?.pilotTriggered) setPilotTriggered(true);
        if (s?.lastActions) setLastActions(s.lastActions);
      }
    } catch {} finally { setStateLoading(false); setTimeout(() => { isInitialMount.current = false; }, 50); }
  }, [userId, sharedStateId, apiBase]);

  useEffect(() => { fetchState(); }, [fetchState]);

  useEffect(() => {
    if (stateLoading || isInitialMount.current || !userId) return;
    if (currentStage === Stage.HISTORY) return;
    postJSON(`${apiBase}/api/auth/state/${sharedStateId}`, {
      currentStage, completedStages, configSaved, configLocked, sandboxTriggered, pilotTriggered, lastActions
    }).catch(console.error);
  }, [stateLoading, userId, currentStage, completedStages, configSaved, configLocked, sandboxTriggered, pilotTriggered, lastActions, sharedStateId, apiBase]);

  const postStageSignal = async (stage, status) => { try { await fetch(`${apiBase}/orchestrator/stages/${stage}`, { method: "POST", body: JSON.stringify({ status }) }); } catch {} };
  const addCompleted = (stage) => { setCompletedStages(p => p.includes(stage) ? p : [...p, stage]); postStageSignal(stage, "completed"); };

  const canGotoStage = useCallback((next) => {
    if (next === Stage.HISTORY) return true;
    if (next === Stage.CONFIG) return true;
    if (isEUC) {
        if (next === Stage.PRODUCTION) return (configSaved || completedStages.includes(Stage.CONFIG));
        if (next === Stage.FinalResult) return completedStages.includes(Stage.PRODUCTION);
        return false;
    }
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
  }, [configSaved, completedStages, isEUC, env.enableSandbox, env.enablePilot]);

  const accessibleStages = useMemo(() => Object.values(Stage).filter(canGotoStage), [canGotoStage]);
  useEffect(() => {
    if (onFlowUpdate) {
        onFlowUpdate({ current: currentStage, completed: completedStages, accessible: accessibleStages });
    }
  }, [currentStage, completedStages, accessibleStages, onFlowUpdate]);

  const handleStageChange = useCallback((next) => { if (canGotoStage(next)) { setCurrentStage(next); postStageSignal(next, "active"); } }, [canGotoStage]);
  const recordAction = (stage, id) => { if(id) setLastActions(p => ({ ...p, [stage]: { id, ts: Date.now() } })); };

  useEffect(() => {
    const onReq = (e) => handleStageChange(e.detail.stage);
    window.addEventListener('flow:request_stage', onReq);
    return () => window.removeEventListener('flow:request_stage', onReq);
  }, [handleStageChange]);

  function handleConfigSaved(newConfig) {
    setConfigSaved(true); setConfigLocked(true); addCompleted(Stage.CONFIG);
    const sbxEnabled = newConfig?.enableSandbox ?? env.enableSandbox;
    const pilotEnabled = newConfig?.enablePilot ?? env.enablePilot;
    let next = Stage.PRODUCTION;
    if (isEUC) next = Stage.PRODUCTION;
    else if (sbxEnabled) next = Stage.SANDBOX;
    else if (pilotEnabled) next = Stage.PILOT;
    setCurrentStage(next); postStageSignal(next, "active");
  }

  const handleSandboxDone = async (result) => {
    if (!result?.ok) return;
    if (result?.actionId) recordAction(Stage.SANDBOX, result.actionId);
    setSandboxTriggered(true); addCompleted(Stage.SANDBOX);
    setCurrentStage(env.enablePilot ? Stage.PILOT : Stage.PRODUCTION);
  };

  useEffect(() => {
    const onPilotTrig = (e) => { if(e?.detail?.actionId) recordAction(Stage.PILOT, e.detail.actionId); setPilotTriggered(true); addCompleted(Stage.PILOT); setCurrentStage(Stage.PRODUCTION); };
    const onProdTrig = (e) => { if(e?.detail?.actionId) recordAction(Stage.PRODUCTION, e.detail.actionId); addCompleted(Stage.PRODUCTION); addCompleted(Stage.FinalResult); setCurrentStage(Stage.FinalResult); };
    window.addEventListener("pilot:triggered", onPilotTrig); window.addEventListener("production:triggered", onProdTrig);
    return () => { window.removeEventListener("pilot:triggered", onPilotTrig); window.removeEventListener("production:triggered", onProdTrig); };
  }, [addCompleted]);

  useEffect(() => {
    const onResetSbx = () => {
      setSandboxTriggered(false);
      setPilotTriggered(false);
      setCompletedStages(p => p.filter(s => s !== Stage.SANDBOX && s !== Stage.PILOT && s !== Stage.PRODUCTION && s !== Stage.FinalResult));
      setCurrentStage(Stage.SANDBOX);
      postStageSignal(Stage.SANDBOX, "active");
    };

    const onResetPilot = () => {
      setPilotTriggered(false);
      setCompletedStages(p => p.filter(s => s !== Stage.PILOT && s !== Stage.PRODUCTION && s !== Stage.FinalResult));
      setCurrentStage(Stage.PILOT);
      postStageSignal(Stage.PILOT, "active");
    };

    const onResetAll = () => {
      setSandboxTriggered(false);
      setPilotTriggered(false);
      setConfigSaved(false);
      setConfigLocked(false);
      setCompletedStages([]);
      setLastActions({});
      setCurrentStage(Stage.CONFIG);
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
  }, []);

  if (stateLoading) return <div className="app-loading-content">Loading Orchestration Flow...</div>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', animation: 'fadeIn 0.3s ease', minHeight: '100%' }}>

      {currentStage === Stage.HISTORY && <DeploymentHistory />}
      {currentStage === Stage.CONFIG && <Configuration onSaved={handleConfigSaved} />}

      {currentStage === Stage.SANDBOX && !isEUC && env.enableSandbox && (
        <div className="stage-cards-row">
          <Environment />
          <DecisionEngine apiBase={apiBase} baseline={env.baseline} group={env.sbxGroup} autoMail={env.autoMail} onDone={handleSandboxDone} disabled={sandboxTriggered} username={username} />
          <ReportNotification />
        </div>
      )}

      {currentStage === Stage.PILOT && !isEUC && env.enablePilot && (
        <Suspense fallback={<div className="app-loading-content">Loading Pilot Data...</div>}>
          <div className="stage-cards-row">
            <PilotEnvironment mode="pilot" />
            {env.enableSandbox && <PilotSandboxResult title="Sandbox Result" actionId={lastActions?.SANDBOX?.id} onViewDetails={() => onNavigate('kpi-details', { type: 'sandbox', id: lastActions?.SANDBOX?.id })} />}
            <PilotKPI title="Pilot KPI" lastActions={lastActions} onKpiClick={(type) => onNavigate('kpi-details', type)} />
          </div>
          <div className="stage-cards-row mt-20">
            <PilotDecisionEngine sbxDone={!env.enableSandbox || sandboxTriggered} mode="pilot" autoMail={env.autoMail} readOnly={pilotTriggered} lastActions={lastActions} username={username} onOpenSnapshot={onOpenSnapshot} onOpenClone={onOpenClone} />
            <PilotReports />
          </div>
        </Suspense>
      )}

      {currentStage === Stage.PRODUCTION && (
        <Suspense fallback={<div className="app-loading-content">Loading Production Data...</div>}>
          <div className="stage-cards-row">
            <PilotEnvironment mode="production" />
            {!isEUC && env.enablePilot && (
                <PilotSandboxResult title="Pilot Result" actionId={lastActions?.PILOT?.id} onViewDetails={() => onNavigate('kpi-details', { type: 'sandbox', id: lastActions?.PILOT?.id })} />
            )}
            {!isEUC && !env.enablePilot && env.enableSandbox && (
                <PilotSandboxResult title="Sandbox Result" actionId={lastActions?.SANDBOX?.id} onViewDetails={() => onNavigate('kpi-details', { type: 'sandbox', id: lastActions?.SANDBOX?.id })} />
            )}
            <PilotKPI title="Production KPI" lastActions={lastActions} onKpiClick={(type) => onNavigate('kpi-details', type)} />
          </div>
          <div className="stage-cards-row mt-20">
            <PilotDecisionEngine sbxDone={true} pilotDone={true} mode="production" autoMail={env.autoMail} lastActions={lastActions} username={username} onOpenSnapshot={onOpenSnapshot} onOpenClone={onOpenClone} role={role} />
            <PilotReports />
          </div>
        </Suspense>
      )}

      {currentStage === Stage.FinalResult && (
        <Suspense fallback={null}>
          <div className="stage-cards-row">
             {!isEUC && env.enableSandbox && <PilotSandboxResult title="Sandbox Result" actionId={lastActions?.SANDBOX?.id} onViewDetails={() => onNavigate('kpi-details', { type: 'sandbox', id: lastActions?.SANDBOX?.id })} />}
             {!isEUC && env.enablePilot   && <PilotSandboxResult title="Pilot Result" actionId={lastActions?.PILOT?.id} onViewDetails={() => onNavigate('kpi-details', { type: 'sandbox', id: lastActions?.PILOT?.id })} />}
             <PilotSandboxResult title="Production Result" actionId={lastActions?.PRODUCTION?.id} onViewDetails={() => onNavigate('kpi-details', { type: 'sandbox', id: lastActions?.PRODUCTION?.id })} />
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
  const [navHistory, setNavHistory] = useState(['orchestration']);
  const [historyIdx, setHistoryIdx] = useState(0);
  const [kpiContext, setKpiContext] = useState(null);

  const [session, setSession] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [flowState, setFlowState] = useState({ current: 'CONFIG', completed: [], accessible: ['CONFIG'] });

  const handleNavigate = (route, context = null) => {
    if (context) setKpiContext(context);
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
  
  const handleLogout = async () => { try { await postJSON(`${API}/api/auth/logout`, {}); } catch {} setSession(null); sessionStorage.removeItem('BPS_SESSION_ACTIVE'); };

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
          onNavigate={handleNavigate}
          flowState={flowState}
          role={session?.role} 
          riskTab={riskTab}
          setRiskTab={setRiskTab}
          riskSubTab={riskSubTab}
          setRiskSubTab={setRiskSubTab}
        />
        
        <div className="main-wrapper">
          <Topbar 
            onNavHistory={handleHistory} 
            canGoBack={historyIdx > 0}
            canGoForward={historyIdx < navHistory.length - 1}
            username={session?.username} 
            role={session?.role} 
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
             activeMenu === 'baseline' ? <Suspense fallback={null}><BaselineManager onClose={()=>handleNavigate('orchestration')}/></Suspense> :
             activeMenu === 'group' ? <Suspense fallback={null}><GroupManager onClose={()=>handleNavigate('orchestration')}/></Suspense> :
             activeMenu === 'snapshot' ? <Suspense fallback={null}><SnapshotManager onClose={()=>handleNavigate('orchestration')} groupName="All Computers"/></Suspense> :
             activeMenu === 'clone' ? <Suspense fallback={null}><CloneManager onClose={()=>handleNavigate('orchestration')} groupName="All Computers"/></Suspense> :
             activeMenu === 'calendar' ? <Suspense fallback={null}><PatchCalendar onClose={()=>handleNavigate('orchestration')} userRole={session?.role} /></Suspense> :
             activeMenu === 'settings' ? <Suspense fallback={null}><Management onClose={()=>handleNavigate('orchestration')}/></Suspense> :
             activeMenu === 'users' ? <Suspense fallback={null}><UserManagement onClose={()=>handleNavigate('orchestration')} currentUserId={session?.userId}/></Suspense> :
             activeMenu === 'kpi-details' ? <Suspense fallback={null}><KpiDashboard context={kpiContext} /></Suspense> :
             activeMenu === 'orchestration' ? <Main userId={session?.userId} username={session?.username} role={session?.role} onOpenSnapshot={()=>handleNavigate('snapshot')} onOpenClone={()=>handleNavigate('clone')} onFlowUpdate={setFlowState} onNavigate={handleNavigate} /> : null
            }
          </div>
        </div>
      </div>
    </EnvironmentProvider>
  );
}