// src/App.jsx
import {
  useState,
  useMemo,
  useCallback,
  useEffect,
  Suspense,
  lazy,
} from "react";
import PropTypes from "prop-types";
import "./styles/Style.css";
import DeploymentHistory, { Stage } from "./components/FlowCard.jsx";
import Environment, {
  EnvironmentProvider,
  useEnvironment,
} from "./components/Environment.jsx";
import DecisionEngine from "./components/DecisionEngine.jsx";
import Configuration from "./components/Configuration.jsx";
import Login from "./components/auth/Login.jsx";
import { Sidebar, Topbar } from "./components/Header.jsx";
import { useTeamState } from "./hooks/useTeamState.js";

const PilotEnvironment = lazy(
  () => import("./components/pilot/PilotEnvironment.jsx"),
);
const PilotSandboxResult = lazy(
  () => import("./components/pilot/PilotSandboxResult.jsx"),
);
const PilotKPI = lazy(() => import("./components/pilot/PilotKPI.jsx"));
const PilotDecisionEngine = lazy(
  () => import("./components/pilot/PilotDecisionEngine.jsx"),
);
const Management = lazy(() => import("./components/Management.jsx"));
const UserManagement = lazy(() => import("./components/UserManagement.jsx"));
const RoleManagement = lazy(() => import("./components/RoleManagement.jsx"));
const GroupManager = lazy(() => import("./components/GroupManager.jsx"));
const SnapshotManager = lazy(() => import("./components/SnapshotSelector.jsx"));
const CloneManager = lazy(() => import("./components/CloneSelector.jsx"));
const PatchCalendar = lazy(() => import("./components/PatchCalendar.jsx"));
const RiskModule = lazy(() => import("./modules/risk/RiskModule.jsx"));
const KpiDashboard = lazy(() => import("./components/KpiDetails.jsx"));
// const PatchPolicy = lazy(() => import("./modules/policy/PatchPolicy.jsx"));

const API = globalThis.env?.VITE_API_BASE || "http://localhost:5174";

async function getJSON(url) {
  const r = await fetch(url, { headers: { Accept: "application/json" } });
  return r.json();
}
async function postJSON(url, body) {
  const r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return r.json();
}

async function resetWorkflowState() {
  return postJSON(`${API}/api/workflow/reset`, {});
}

function Main({
  username,
  onOpenSnapshot,
  onOpenClone,
  onFlowUpdate,
  onNavigate,
}) {
  const { env, setEnv } = useEnvironment();
  const {
    state: teamState,
    saveState: updateTeamState,
    loading: stateLoading,
  } = useTeamState();
  const apiBase = useMemo(() => API, []);

  useEffect(() => {
    getJSON(`${apiBase}/api/config`)
      .then((res) => {
        if (res.ok)
          setEnv((prev) => ({
            ...prev,
            enableSandbox: res.enableSandbox ?? true,
            enablePilot: res.enablePilot ?? true,
          }));
      })
      .catch(console.error);
  }, [apiBase, setEnv]);

  const s = teamState || {};
  const currentStage = s.currentStage || Stage.CONFIG;
  const completedStages = s.completedStages || [];
  const configSaved = !!s.configSaved;

  const sandboxTriggered = !!s.sandboxTriggered;
  const pilotTriggered = !!s.pilotTriggered;
  const productionTriggered = !!s.productionTriggered;
  const sandboxFinished = completedStages.includes(Stage.SANDBOX);
  const pilotFinished = completedStages.includes(Stage.PILOT);
  const productionFinished = completedStages.includes(Stage.PRODUCTION);

  const sandboxLocked = sandboxTriggered && !sandboxFinished;
  const pilotLocked = pilotTriggered && !pilotFinished;

  const lastActions = s.lastActions || {};

  useEffect(() => {
    if (s.pilotUnlocked !== undefined || s.productionUnlocked !== undefined) {
      setEnv((p) => {
        const pu = s.pilotUnlocked ?? p.pilotUnlocked;
        const pr = s.productionUnlocked ?? p.productionUnlocked;
        if (p.pilotUnlocked === pu && p.productionUnlocked === pr) return p;
        return { ...p, pilotUnlocked: pu, productionUnlocked: pr };
      });
    }
  }, [s.pilotUnlocked, s.productionUnlocked, setEnv]);

  const postStageSignal = async (stage, status) => {
    try {
      await fetch(`${apiBase}/orchestrator/stages/${stage}`, {
        method: "POST",
        body: JSON.stringify({ status }),
      });
    } catch {}
  };

  // S3776 Fix: Converted to a clean switch statement to reduce cognitive complexity
  const canGotoStage = useCallback(
    (next) => {
      const configDone = configSaved || completedStages.includes(Stage.CONFIG);
      switch (next) {
        case Stage.HISTORY:
        case Stage.CONFIG:
          return true;
        case Stage.SANDBOX:
          return env.enableSandbox && configDone;
        case Stage.PILOT:
          if (!env.enablePilot) return false;
          return env.enableSandbox ? sandboxFinished : configDone;
        case Stage.PRODUCTION:
          if (env.enablePilot) return pilotFinished;
          if (env.enableSandbox) return sandboxFinished;
          return configDone;
        case Stage.FinalResult:
          return productionFinished;
        default:
          return false;
      }
    },
    [
      configSaved,
      sandboxFinished,
      pilotFinished,
      productionFinished,
      completedStages,
      env.enableSandbox,
      env.enablePilot,
    ],
  );

  const accessibleStages = useMemo(
    () => Object.values(Stage).filter(canGotoStage),
    [canGotoStage],
  );

  useEffect(() => {
    if (onFlowUpdate) {
      onFlowUpdate((prev) => {
        if (
          prev.current === currentStage &&
          JSON.stringify(prev.completed) === JSON.stringify(completedStages) &&
          JSON.stringify(prev.accessible) === JSON.stringify(accessibleStages)
        ) {
          return prev;
        }
        return {
          current: currentStage,
          completed: completedStages,
          accessible: accessibleStages,
        };
      });
    }
  }, [currentStage, completedStages, accessibleStages, onFlowUpdate]);

  const handleStageChange = useCallback(
    (next) => {
      if (canGotoStage(next)) {
        updateTeamState({ currentStage: next });
        postStageSignal(next, "active");
      }
    },
    [canGotoStage, updateTeamState],
  );

  useEffect(() => {
    const onReq = (e) => handleStageChange(e.detail.stage);
    globalThis.addEventListener("flow:request_stage", onReq);
    return () => globalThis.removeEventListener("flow:request_stage", onReq);
  }, [handleStageChange]);

  function handleConfigSaved(newConfig) {
    const sbxEnabled = newConfig?.enableSandbox ?? env.enableSandbox;
    const pilotEnabled = newConfig?.enablePilot ?? env.enablePilot;

    let next = Stage.PRODUCTION;
    if (sbxEnabled) next = Stage.SANDBOX;
    else if (pilotEnabled) next = Stage.PILOT;

    const newCompleted = completedStages.includes(Stage.CONFIG)
      ? completedStages
      : [...completedStages, Stage.CONFIG];

    updateTeamState({
      configSaved: true,
      configLocked: true,
      completedStages: newCompleted,
      currentStage: next,
    });
    postStageSignal(Stage.CONFIG, "completed");
    postStageSignal(next, "active");
  }

  // STAGE 1: SANDBOX HANDLERS
  const handleSandboxDone = async (result) => {
    if (!result?.ok) return;
    let newActions = lastActions;
    if (result?.actions)
      newActions = {
        ...lastActions,
        [Stage.SANDBOX]: { actions: result.actions, ts: Date.now() },
      };
    updateTeamState({ sandboxTriggered: true, lastActions: newActions });
  };

  const handleFinishSandbox = () => {
    const newCompleted = completedStages.includes(Stage.SANDBOX)
      ? completedStages
      : [...completedStages, Stage.SANDBOX];
    const next = env.enablePilot ? Stage.PILOT : Stage.PRODUCTION;
    updateTeamState({ completedStages: newCompleted, currentStage: next });
    postStageSignal(Stage.SANDBOX, "completed");
    postStageSignal(next, "active");
  };

  const handleResetSandbox = async () => {
    try {
      await resetWorkflowState();
    } catch (err) {
      console.error("Failed to reset workflow state", err);
    }
    const newActions = { ...lastActions };
    delete newActions[Stage.SANDBOX];
    updateTeamState({ sandboxTriggered: false, lastActions: newActions });
  };

  // STAGE 2 & 3: PILOT / PROD HANDLERS
  useEffect(() => {
    const onPilotTrig = (e) => {
      if (!e?.detail?.actions) return;
      const newActions = {
        ...lastActions,
        [Stage.PILOT]: { actions: e.detail.actions, ts: Date.now() },
      };
      updateTeamState({ pilotTriggered: true, lastActions: newActions });
    };

    const onProdTrig = (e) => {
      if (!e?.detail?.actions) return;
      const newActions = {
        ...lastActions,
        [Stage.PRODUCTION]: { actions: e.detail.actions, ts: Date.now() },
      };
      updateTeamState({ productionTriggered: true, lastActions: newActions });
    };

    globalThis.addEventListener("pilot:triggered", onPilotTrig);
    globalThis.addEventListener("production:triggered", onProdTrig);
    return () => {
      globalThis.removeEventListener("pilot:triggered", onPilotTrig);
      globalThis.removeEventListener("production:triggered", onProdTrig);
    };
  }, [lastActions, updateTeamState]);

  const handleFinishPilot = () => {
    const newCompleted = completedStages.includes(Stage.PILOT)
      ? completedStages
      : [...completedStages, Stage.PILOT];
    updateTeamState({
      completedStages: newCompleted,
      currentStage: Stage.PRODUCTION,
    });
    postStageSignal(Stage.PILOT, "completed");
    postStageSignal(Stage.PRODUCTION, "active");
  };

  const handleResetPilot = async () => {
    try {
      await resetWorkflowState();
    } catch (err) {
      console.error("Failed to reset workflow state", err);
    }
    const newActions = { ...lastActions };
    delete newActions[Stage.PILOT];
    updateTeamState({ pilotTriggered: false, lastActions: newActions });
  };

  const handleFinishProduction = () => {
    let newCompleted = completedStages.includes(Stage.PRODUCTION)
      ? completedStages
      : [...completedStages, Stage.PRODUCTION];
    if (!newCompleted.includes(Stage.FinalResult))
      newCompleted = [...newCompleted, Stage.FinalResult];
    updateTeamState({
      completedStages: newCompleted,
      currentStage: Stage.FinalResult,
    });
    postStageSignal(Stage.PRODUCTION, "completed");
  };

  const handleResetProduction = async () => {
    try {
      await resetWorkflowState();
    } catch (err) {
      console.error("Failed to reset workflow state", err);
    }
    const newActions = { ...lastActions };
    delete newActions[Stage.PRODUCTION];
    updateTeamState({ productionTriggered: false, lastActions: newActions });
  };

  useEffect(() => {
    const onResetSbx = async () => {
      try {
        await resetWorkflowState();
      } catch (err) {
        console.error("Failed to reset workflow state", err);
      }

      updateTeamState({
        sandboxTriggered: false,
        pilotTriggered: false,
        completedStages: completedStages.filter(
          (st) =>
            st !== Stage.SANDBOX &&
            st !== Stage.PILOT &&
            st !== Stage.PRODUCTION &&
            st !== Stage.FinalResult,
        ),
        pilotUnlocked: false,
        productionUnlocked: false,
        currentStage: Stage.SANDBOX,
      });

      setEnv((p) => ({
        ...p,
        pilotEvaluated: false,
        prodEvaluated: false,
        pilotUnlocked: false,
        prodUnlocked: false,
      }));

      postStageSignal(Stage.SANDBOX, "active");
    };
    const onResetPilot = async () => {
      try {
        await resetWorkflowState();
      } catch (err) {
        console.error("Failed to reset workflow state", err);
      }

      updateTeamState({
        pilotTriggered: false,
        completedStages: completedStages.filter(
          (st) =>
            st !== Stage.PILOT &&
            st !== Stage.PRODUCTION &&
            st !== Stage.FinalResult,
        ),
        productionUnlocked: false,
        currentStage: Stage.PILOT,
      });

      setEnv((p) => ({
        ...p,
        prodEvaluated: false,
        prodUnlocked: false,
      }));

      postStageSignal(Stage.PILOT, "active");
    };
    const onResetAll = async () => {
      try {
        await resetWorkflowState();
      } catch (err) {
        console.error("Failed to reset workflow state", err);
      }

      updateTeamState({
        sandboxTriggered: false,
        pilotTriggered: false,
        configSaved: false,
        configLocked: false,
        completedStages: [],
        lastActions: {},
        pilotUnlocked: false,
        productionUnlocked: false,
        currentStage: Stage.CONFIG,
      });

      setEnv((p) => ({
        ...p,
        pilotEvaluated: false,
        prodEvaluated: false,
        pilotUnlocked: false,
        prodUnlocked: false,
      }));

      postStageSignal(Stage.CONFIG, "active");
    };

    globalThis.addEventListener("orchestrator:resetToSandbox", onResetSbx);
    globalThis.addEventListener("orchestrator:resetToPilot", onResetPilot);
    globalThis.addEventListener("orchestrator:resetAll", onResetAll);

    return () => {
      globalThis.removeEventListener("orchestrator:resetToSandbox", onResetSbx);
      globalThis.removeEventListener("orchestrator:resetToPilot", onResetPilot);
      globalThis.removeEventListener("orchestrator:resetAll", onResetAll);
    };
  }, [completedStages, updateTeamState, setEnv]);

  // S3776 Fix: Extracted render functions to crush Cognitive Complexity in the Main component
  const renderSandbox = () => (
    <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
      <div className="stage-cards-row">
        <Environment />
        <DecisionEngine
          apiBase={apiBase}
          autoMail={env.autoMail}
          onDone={handleSandboxDone}
          disabled={sandboxTriggered}
          username={username}
          onFinish={handleFinishSandbox}
          onReset={handleResetSandbox}
          currentActions={lastActions?.SANDBOX?.actions || []}
          stageFinished={sandboxFinished}
        />
      </div>
      {sandboxTriggered && lastActions?.SANDBOX?.actions && (
        <Suspense
          fallback={
            <div className="app-loading-content">Loading Results...</div>
          }
        >
          <div className="stage-cards-row">
            <PilotSandboxResult
              title="Sandbox Result"
              actions={lastActions.SANDBOX.actions}
              onViewDetails={(actId) =>
                onNavigate("kpi-details", { type: "success", id: actId })
              }
            />
          </div>
        </Suspense>
      )}
    </div>
  );

  const renderPilot = () => (
    <Suspense
      fallback={
        <div className="app-loading-content">Loading Pilot Data...</div>
      }
    >
      <div className="stage-cards-row">
        <PilotEnvironment mode="pilot" lastActions={lastActions} />
        {env.enableSandbox && (
          <PilotSandboxResult
            title="Sandbox Result"
            actions={lastActions?.SANDBOX?.actions}
            onViewDetails={(actId) =>
              onNavigate("kpi-details", { type: "success", id: actId })
            }
          />
        )}
        <PilotKPI
          title="Pilot KPI"
          lastActions={lastActions}
          onKpiClick={(type) => onNavigate("kpi-details", type)}
        />
      </div>
      <div className="stage-cards-row mt-20">
        <PilotDecisionEngine
          sbxDone={!env.enableSandbox || sandboxFinished}
          mode="pilot"
          autoMail={env.autoMail}
          readOnly={pilotTriggered}
          lastActions={lastActions}
          username={username}
          onOpenSnapshot={onOpenSnapshot}
          onOpenClone={onOpenClone}
          onFinish={handleFinishPilot}
          onResetStage={handleResetPilot}
          stageFinished={pilotFinished}
        />
      </div>
      {pilotTriggered && lastActions?.PILOT?.actions && (
        <div className="stage-cards-row mt-20">
          <PilotSandboxResult
            title="Pilot Result"
            actions={lastActions.PILOT.actions}
            onViewDetails={(actId) =>
              onNavigate("kpi-details", { type: "success", id: actId })
            }
          />
        </div>
      )}
    </Suspense>
  );

  const renderProduction = () => (
    <Suspense
      fallback={
        <div className="app-loading-content">Loading Production Data...</div>
      }
    >
      <div className="stage-cards-row">
        <PilotEnvironment mode="production" lastActions={lastActions} />
        {env.enablePilot && (
          <PilotSandboxResult
            title="Pilot Result"
            actions={lastActions?.PILOT?.actions}
            onViewDetails={(actId) =>
              onNavigate("kpi-details", { type: "success", id: actId })
            }
          />
        )}
        {!env.enablePilot && env.enableSandbox && (
          <PilotSandboxResult
            title="Sandbox Result"
            actions={lastActions?.SANDBOX?.actions}
            onViewDetails={(actId) =>
              onNavigate("kpi-details", { type: "success", id: actId })
            }
          />
        )}
        <PilotKPI
          title="Production KPI"
          lastActions={lastActions}
          onKpiClick={(type) => onNavigate("kpi-details", type)}
        />
      </div>
      <div className="stage-cards-row mt-20">
        <PilotDecisionEngine
          sbxDone={true}
          pilotDone={true}
          mode="production"
          autoMail={env.autoMail}
          lastActions={lastActions}
          readOnly={productionTriggered}
          username={username}
          onOpenSnapshot={onOpenSnapshot}
          onOpenClone={onOpenClone}
          onFinish={handleFinishProduction}
          onResetStage={handleResetProduction}
          stageFinished={productionFinished}
        />
      </div>
      {productionTriggered && lastActions?.PRODUCTION?.actions && (
        <div className="stage-cards-row mt-20">
          <PilotSandboxResult
            title="Production Result"
            actions={lastActions.PRODUCTION.actions}
            onViewDetails={(actId) =>
              onNavigate("kpi-details", { type: "success", id: actId })
            }
          />
        </div>
      )}
    </Suspense>
  );

  const renderFinalResult = () => (
    <Suspense fallback={null}>
      <div className="stage-cards-row">
        {env.enableSandbox && (
          <PilotSandboxResult
            title="Sandbox Result"
            actions={lastActions?.SANDBOX?.actions}
            onViewDetails={(actId) =>
              onNavigate("kpi-details", { type: "success", id: actId })
            }
          />
        )}
        {env.enablePilot && (
          <PilotSandboxResult
            title="Pilot Result"
            actions={lastActions?.PILOT?.actions}
            onViewDetails={(actId) =>
              onNavigate("kpi-details", { type: "success", id: actId })
            }
          />
        )}
        <PilotSandboxResult
          title="Production Result"
          actions={lastActions?.PRODUCTION?.actions}
          onViewDetails={(actId) =>
            onNavigate("kpi-details", { type: "success", id: actId })
          }
        />
      </div>
    </Suspense>
  );

  if (stateLoading)
    return (
      <div className="app-loading-content">Loading Orchestration Flow...</div>
    );

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        animation: "fadeIn 0.3s ease",
        minHeight: "100%",
      }}
    >
      {currentStage === Stage.HISTORY && <DeploymentHistory />}
      {currentStage === Stage.CONFIG && (
        <Configuration
          onSaved={handleConfigSaved}
          sandboxLocked={sandboxLocked}
          pilotLocked={pilotLocked}
          workflowState={{
            configSaved,
            runningStage: s.runningStage,
            completedStages,
            currentConfig: {
              enableSandbox: env.enableSandbox,
              enablePilot: env.enablePilot,
            },
          }}
        />
      )}
      {currentStage === Stage.SANDBOX && env.enableSandbox && renderSandbox()}
      {currentStage === Stage.PILOT && env.enablePilot && renderPilot()}
      {currentStage === Stage.PRODUCTION && renderProduction()}
      {currentStage === Stage.FinalResult && renderFinalResult()}
    </div>
  );
}

// S6774 Fix: Props Validation
Main.propTypes = {
  username: PropTypes.string,
  onOpenSnapshot: PropTypes.func,
  onOpenClone: PropTypes.func,
  onFlowUpdate: PropTypes.func,
  onNavigate: PropTypes.func,
};

export default function App() {
  const [activeMenu, setActiveMenu] = useState("orchestration");
  const [riskTab, setRiskTab] = useState("patches");
  const [riskSubTab, setRiskSubTab] = useState("overview");
  const [kpiTab, setKpiTab] = useState("health");
  const [navHistory, setNavHistory] = useState(["orchestration"]);
  const [historyIdx, setHistoryIdx] = useState(0);
  const [kpiContext, setKpiContext] = useState(null);
  const [session, setSession] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [flowState, setFlowState] = useState({
    current: "CONFIG",
    completed: [],
    accessible: ["CONFIG"],
  });
  const [timeoutModal, setTimeoutModal] = useState(false);

  const handleNavigate = (route, context = null) => {
    setKpiContext(context);
    if (context && route === "kpi-details") {
      const cType = typeof context === "string" ? context : context.type;
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
    try {
      await postJSON(`${API}/api/auth/logout`, {});
    } catch {}
    setSession(null);
    sessionStorage.clear();
    localStorage.clear();
    globalThis.location.href = "/";
  };

  // S2004 Fix: Extracted timer logic out of the main useEffect body to flatten nesting
  useEffect(() => {
    if (!session) return;
    let timeoutId;
    const TIMEOUT_MS = (session.timeoutMins || 15) * 60 * 1000;

    const triggerTimeout = () => {
      postJSON(`${API}/api/auth/logout`, {}).catch(() => {});
      setTimeoutModal(true);
    };

    const resetTimer = () => {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(triggerTimeout, TIMEOUT_MS);
    };

    let lastCall = Date.now();
    const handleActivity = () => {
      const now = Date.now();
      if (now - lastCall > 1000) {
        lastCall = now;
        resetTimer();
      }
    };

    const events = [
      "mousemove",
      "keydown",
      "mousedown",
      "scroll",
      "touchstart",
    ];
    events.forEach((event) =>
      globalThis.addEventListener(event, handleActivity),
    );
    resetTimer();

    return () => {
      clearTimeout(timeoutId);
      events.forEach((event) =>
        globalThis.removeEventListener(event, handleActivity),
      );
    };
  }, [session]);

  useEffect(() => {
    setAuthLoading(true);
    getJSON(`${API}/api/auth/status`)
      .then((d) => {
        if (d.ok && d.authed && sessionStorage.getItem("BPS_SESSION_ACTIVE")) {
          sessionStorage.setItem("user_role", d.userData.role);
          setSession({ ...d.userData, timeoutMins: d.timeoutMins });
        } else {
          setSession(null);
          sessionStorage.removeItem("BPS_SESSION_ACTIVE");
        }
      })
      .finally(() => setAuthLoading(false));
  }, []);

  // S3358 Fix: Replaced nested ternaries inside the render body with a clean switch function
  const renderActiveMenu = () => {
    switch (activeMenu) {
      case "risk":
        return (
          <Suspense fallback={null}>
            <RiskModule
              onClose={() => handleNavigate("orchestration")}
              activeTab={riskTab}
              activeSubTab={riskSubTab}
              setRiskTab={setRiskTab}
              setRiskSubTab={setRiskSubTab}
              onSetPending={() => setRiskTab("baseline")}
            />
          </Suspense>
        );
      case "group":
        return (
          <Suspense fallback={null}>
            <GroupManager onClose={() => handleNavigate("orchestration")} />
          </Suspense>
        );
      case "snapshot":
        return (
          <Suspense fallback={null}>
            <SnapshotManager
              onClose={() => handleNavigate("orchestration")}
              groupName="All Computers"
            />
          </Suspense>
        );
      case "clone":
        return (
          <Suspense fallback={null}>
            <CloneManager
              onClose={() => handleNavigate("orchestration")}
              groupName="All Computers"
            />
          </Suspense>
        );
      case "calendar":
        return (
          <Suspense fallback={null}>
            <PatchCalendar
              onClose={() => handleNavigate("orchestration")}
              userRole={session?.role}
            />
          </Suspense>
        );
      case "settings":
        return (
          <Suspense fallback={null}>
            <Management
              onClose={() => handleNavigate("orchestration")}
              role={session?.role}
            />
          </Suspense>
        );
      case "users":
        return (
          <Suspense fallback={null}>
            <UserManagement
              onClose={() => handleNavigate("orchestration")}
              currentUserId={session?.userId}
            />
          </Suspense>
        );
      case "roles":
        return (
          <Suspense fallback={null}>
            <RoleManagement
              onClose={() => handleNavigate("orchestration")}
              role={session?.role}
              username={session?.username}
            />
          </Suspense>
        );
      case "kpi-details":
        return (
          <Suspense fallback={null}>
            <KpiDashboard context={kpiContext} activeTab={kpiTab} />
          </Suspense>
        );
      case "orchestration":
        return (
          <Main
            username={session?.username}
            onOpenSnapshot={() => handleNavigate("snapshot")}
            onOpenClone={() => handleNavigate("clone")}
            onFlowUpdate={setFlowState}
            onNavigate={handleNavigate}
          />
        );
      case "policy":
        return (
          <Suspense fallback={null}>
            <PatchPolicy onClose={() => handleNavigate("orchestration")} />
          </Suspense>
        );
      default:
        return null;
    }
  };

  if (authLoading) return <div className="app-loading-full">Loading...</div>;

  if (!session) {
    return (
      <EnvironmentProvider>
        <Login
          onSuccess={(u) => {
            sessionStorage.setItem("BPS_SESSION_ACTIVE", "true");
            setSession(u);
          }}
        />
      </EnvironmentProvider>
    );
  }

  return (
    <EnvironmentProvider>
      <div
        style={{
          display: "flex",
          height: "100vh",
          width: "100vw",
          overflow: "hidden",
          backgroundColor: "var(--bg)",
        }}
      >
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

          <div className="app-content">{renderActiveMenu()}</div>
        </div>
      </div>

      {timeoutModal && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            width: "100vw",
            height: "100vh",
            backgroundColor: "rgba(0,0,0,0.65)",
            zIndex: 9999999,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            backdropFilter: "blur(4px)",
          }}
        >
          <div
            style={{
              backgroundColor: "var(--panel)",
              padding: "32px",
              borderRadius: "12px",
              boxShadow: "0 20px 40px rgba(0,0,0,0.2)",
              maxWidth: "420px",
              width: "90%",
              textAlign: "center",
              border: "1px solid var(--border)",
            }}
          >
            <div
              style={{
                width: "56px",
                height: "56px",
                borderRadius: "50%",
                backgroundColor: "#fff3e0",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                margin: "0 auto 20px",
              }}
            >
              <svg
                width="28"
                height="28"
                viewBox="0 0 24 24"
                fill="none"
                stroke="#f57c00"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
              </svg>
            </div>
            <h2
              style={{
                margin: "0 0 12px 0",
                fontSize: "20px",
                fontWeight: 600,
                color: "var(--text)",
              }}
            >
              Session Expired
            </h2>
            <p
              style={{
                margin: "0 0 28px 0",
                color: "var(--muted)",
                fontSize: "14px",
                lineHeight: "1.6",
              }}
            >
              For your security, you have been automatically logged out due to
              inactivity. Please log back in to continue where you left off.
            </p>
            <button
              type="button"
              className="btn primary"
              style={{
                width: "100%",
                padding: "12px",
                fontSize: "15px",
                fontWeight: 500,
                borderRadius: "8px",
              }}
              onClick={() => {
                sessionStorage.clear();
                localStorage.clear();
                globalThis.location.href = "/";
              }}
            >
              Log Back In
            </button>
          </div>
        </div>
      )}
    </EnvironmentProvider>
  );
}
