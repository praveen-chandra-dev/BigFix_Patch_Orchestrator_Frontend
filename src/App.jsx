// App.jsx
import { useState, useMemo, useCallback, Suspense, lazy } from "react";

// If your stylesheet path is different, adjust this line accordingly.
import "./styles/Style.css";

// ===== Existing components (Sandbox flow) =====
import FlowCard, { Stage } from "./components/FlowCard.jsx";
import Environment, {
  EnvironmentProvider,
  useEnvironment,
} from "./components/Environment.jsx";
import DecisionEngine from "./components/DecisionEngine.jsx";
import ReportNotification from "./components/ReportNotification.jsx";

// ===== Restore the Header (so the top bar shows again) =====
const Header = lazy(() => import("./components/Header.jsx"));

// ===== Pilot components (lazy so missing files won't crash Sandbox) =====
const PilotEnvironment    = lazy(() => import("./components/pilot/PilotEnvironment.jsx"));
const PilotSandboxResult  = lazy(() => import("./components/pilot/PilotSandboxResult.jsx"));
const PilotKPI            = lazy(() => import("./components/pilot/PilotKPI.jsx"));
const PilotDecisionEngine = lazy(() => import("./components/pilot/PilotDecisionEngine.jsx"));
const PilotReports        = lazy(() => import("./components/pilot/PilotReports.jsx"));

function Main() {
  const { env } = useEnvironment();

  // Preserve your original stage flow
  const [currentStage, setCurrentStage] = useState(Stage.SANDBOX);
  const [sandboxTriggered, setSandboxTriggered] = useState(false);

  const apiBase = useMemo(
    () => import.meta.env.VITE_API_BASE || "http://localhost:5174",
    []
  );

  const handleStageChange = useCallback((next) => {
    setCurrentStage(next);
  }, []);

  // Called after Sandbox trigger completes successfully
  const handleSandboxDone = useCallback((result) => {
    if (!result || result.ok) {
      setSandboxTriggered(true);
      setCurrentStage(Stage.PILOT);
    }
  }, []);

  return (
    <>
      {/* Stage rail */}
      <FlowCard
        activeStage={currentStage}
        viewStage={currentStage}
        gotoStage={handleStageChange}
      />

      {/* -------- SANDBOX VIEW (unchanged behavior) -------- */}
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
              disabled={currentStage !== Stage.SANDBOX || sandboxTriggered}
            />
            <ReportNotification
              onExportCSV={() => console.log("Export Sandbox CSV")}
              onExportPDF={() => window.print()}
              onEmail={() => console.log("Email (sandbox sim)")}
            />
          </div>
        </>
      )}

      {/* -------- PILOT VIEW -------- */}
      {currentStage === Stage.PILOT && (
        <Suspense fallback={<div className="sub" style={{ padding: 16 }}>Loading pilot view…</div>}>
          <div className="grid g-3">
            <PilotEnvironment />
            {/* keep original pilot naming; pass an explicit title if you prefer */}
            <PilotSandboxResult title="Sandbox Result" />
            <PilotKPI title="Pilot KPI" />
          </div>

          <div className="two-up-cards">
            <PilotDecisionEngine sbxDone={sandboxTriggered} />
            <PilotReports />
          </div>
        </Suspense>
      )}

      {/* -------- PRODUCTION VIEW (reuse pilot components; only labels change) -------- */}
      {currentStage === Stage.PRODUCTION && (
        <Suspense fallback={<div className="sub" style={{ padding: 16 }}>Loading production view…</div>}>
          <div className="grid g-3">
            <PilotEnvironment />
            {/* exact same component & data; just a new label */}
            <PilotSandboxResult title="Pilot Result" />
            {/* rename KPI card for production */}
            <PilotKPI title="Production KPI" />
          </div>

          <div className="two-up-cards">
            {/* Decision engine can be reused as-is; if you need prod-specific logic later, add props */}
            <PilotDecisionEngine sbxDone={sandboxTriggered} />
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
