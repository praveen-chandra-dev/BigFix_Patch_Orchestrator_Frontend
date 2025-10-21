import { useState, useMemo, useCallback, useEffect, Suspense, lazy } from "react";
import "./styles/Style.css";

import FlowCard, { Stage } from "./components/FlowCard.jsx";
import Environment, { EnvironmentProvider, useEnvironment } from "./components/Environment.jsx";
import DecisionEngine from "./components/DecisionEngine.jsx";
import ReportNotification from "./components/ReportNotification.jsx";

const Header = lazy(() => import("./components/Header.jsx"));

const PilotEnvironment    = lazy(() => import("./components/pilot/PilotEnvironment.jsx"));
const PilotSandboxResult  = lazy(() => import("./components/pilot/PilotSandboxResult.jsx"));
const PilotKPI            = lazy(() => import("./components/pilot/PilotKPI.jsx"));
const PilotDecisionEngine = lazy(() => import("./components/pilot/PilotDecisionEngine.jsx"));
const PilotReports        = lazy(() => import("./components/pilot/PilotReports.jsx"));

function Main() {
  const { env } = useEnvironment();

  const [currentStage, setCurrentStage] = useState(Stage.SANDBOX);

  // progress flags (as before)
  const [sandboxTriggered, setSandboxTriggered] = useState(false);
  const [pilotTriggered,   setPilotTriggered]   = useState(false);

  // 🔒 locks to keep earlier stages view-only after advancing
  const [sandboxLocked, setSandboxLocked] = useState(false);
  const [pilotLocked,   setPilotLocked]   = useState(false);

  const apiBase = useMemo(
    () => import.meta.env.VITE_API_BASE || "http://localhost:5174",
    []
  );

  const handleStageChange = useCallback((next) => {
    setCurrentStage(next);
  }, []);

  // When Sandbox completes: mark triggered, lock Sandbox, move to Pilot
  const handleSandboxDone = useCallback((result) => {
    if (!result || result.ok) {
      setSandboxTriggered(true);
      setSandboxLocked(true);
      setCurrentStage(Stage.PILOT);
    }
  }, []);

  // Pilot fired: lock pilot and move to Production
  useEffect(() => {
    const onPilotTriggered = () => {
      setPilotTriggered(true);
      setPilotLocked(true);
      setCurrentStage(Stage.PRODUCTION);
    };
    window.addEventListener("pilot:triggered", onPilotTriggered);
    return () => window.removeEventListener("pilot:triggered", onPilotTriggered);
  }, []);

  // Be safe: whenever we land in Production (via nav), lock Pilot
  useEffect(() => {
    if (currentStage === Stage.PRODUCTION) {
      setPilotLocked(true);
    }
  }, [currentStage]);

  // Global navigation hooks (unchanged)
  useEffect(() => {
    window.__flow = window.__flow || {};
    window.__flow.goto = (stage) => {
      const s = String(stage || "").toLowerCase();
      if (s === "sandbox") setCurrentStage(Stage.SANDBOX);
      else if (s === "pilot") setCurrentStage(Stage.PILOT);
      else if (s === "production") setCurrentStage(Stage.PRODUCTION);
    };
    const onNavigate = (e) => {
      const s = String(e?.detail?.stage || "").toLowerCase();
      if (!s) return;
      if (s === "sandbox") setCurrentStage(Stage.SANDBOX);
      if (s === "pilot") setCurrentStage(Stage.PILOT);
      if (s === "production") setCurrentStage(Stage.PRODUCTION);
    };
    window.addEventListener("pilot:navigate", onNavigate);
    window.addEventListener("flow:navigate", onNavigate);
    window.addEventListener("orchestrator:navigate", onNavigate);
    return () => {
      window.removeEventListener("pilot:navigate", onNavigate);
      window.removeEventListener("flow:navigate", onNavigate);
      window.removeEventListener("orchestrator:navigate", onNavigate);
    };
  }, []);

  // ✅ Reset wiring: DecisionEngine emits "orchestrator:resetToSandbox"
  useEffect(() => {
    const onReset = () => {
      // clear all run flags & locks so a fresh pass can begin
      setSandboxTriggered(false);
      setPilotTriggered(false);
      setSandboxLocked(false);
      setPilotLocked(false);
      setCurrentStage(Stage.SANDBOX);
    };
    window.addEventListener("orchestrator:resetToSandbox", onReset);
    return () => window.removeEventListener("orchestrator:resetToSandbox", onReset);
  }, []);

  return (
    <>
      <FlowCard
        activeStage={currentStage}
        viewStage={currentStage}
        gotoStage={handleStageChange}
      />

      {currentStage === Stage.SANDBOX && (
        <>
          <Environment />
          <div className="two-up-cards">
            <DecisionEngine
              apiBase={apiBase}
              baseline={env.baseline}
              group={env.sbxGroup}
              autoMail={env.autoMail}
              onDone={handleSandboxDone}
              disabled={currentStage !== Stage.SANDBOX || sandboxLocked}
            />
            <ReportNotification
              onExportCSV={() => console.log("Export Sandbox CSV")}
              onExportPDF={() => window.print()}
              onEmail={() => console.log("Email (sandbox sim)")}
            />
          </div>
        </>
      )}

      {currentStage === Stage.PILOT && (
        <Suspense fallback={<div className="sub" style={{ padding: 16 }}>Loading pilot view…</div>}>
          <div className="grid g-3">
            <PilotEnvironment />
            <PilotSandboxResult title="Sandbox Result" />
            <PilotKPI title="Pilot KPI" />
          </div>
          <div className="two-up-cards">
            <PilotDecisionEngine
              sbxDone={sandboxTriggered}
              mode="pilot"
              readOnly={pilotLocked}   // 🔒 makes Pilot view-only after you move to Production
            />
            <PilotReports />
          </div>
        </Suspense>
      )}

      {currentStage === Stage.PRODUCTION && (
        <Suspense fallback={<div className="sub" style={{ padding: 16 }}>Loading production view…</div>}>
          <div className="grid g-3">
            <PilotEnvironment />
            <PilotSandboxResult title="Pilot Result" />
            <PilotKPI title="Production KPI" />
          </div>

          <div className="two-up-cards">
            <PilotDecisionEngine
              sbxDone={true}
              pilotDone={pilotTriggered}
              mode="production"
            />
            <PilotReports />
          </div>
        </Suspense>
      )}
    </>
  );
}

export default function App() {
  return (
    <EnvironmentProvider>
      <Suspense fallback={null}>
        <Header />
      </Suspense>
      <Main />
    </EnvironmentProvider>
  );
}
