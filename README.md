# BigFix Patch Orchestrator — Frontend

A modern **React + Vite** dashboard for orchestrating OS patch rollouts with **HCL BigFix**.  
It helps operators move changes **Sandbox → Pilot → Production**, monitor real-time **KPIs**, and enforce promotion **gates** (thresholds + allowable health failures). The app also validates **ServiceNow** Change Requests (CHG) prior to Pilot.

---

## ✨ Highlights

- **Sandbox Result** card with drill-down & success-only filter
- **Pilot KPI** card: Success %, Critical Health, Reboot Pending, Error 1603
- **One-click “Refresh KPIs”** to pull latest data from the backend
- **Decision Engine**:
  - Evaluate against thresholds
  - Prompt for **CHG** and validate with ServiceNow (**Implement** state required)
  - Enable **Trigger Pilot** only when gates pass
- Interactive charts, smooth animations, responsive layout

> 💡 Health rows are flagged when **RAM ≥ 85% OR CPU ≥ 85% OR Disk ≤ 10GB** (via BigFix Session Relevance).

---

## 🧱 Architecture

frontend/
├─ src/
│ ├─ components/
│ │ ├─ PilotKPI.jsx # KPI tiles, donut, stacked bar, modals
│ │ ├─ PilotSandboxResult.jsx # Sandbox table & detail views
│ │ ├─ PilotDecisionEngine.jsx # Gates, CHG modal, trigger logic
│ │ └─ PilotEnvironment.jsx # Baseline / Group / Threshold controls
│ ├─ Environment.jsx # Context for environment settings
│ ├─ styles/ # App CSS / tokens
│ └─ main.jsx / App.jsx
└─ index.html