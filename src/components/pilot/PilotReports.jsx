// components/pilot/PilotReports.jsx
import { useMemo } from "react";

export default function PilotReports() {
  // Example KPI values; replace with live data once your API is ready.
  const kpi = useMemo(() => ({
    success: 87,
    reboot: 6,
    e1603: 3,
    health: 4,
    rows: 240
  }), []);

  const succPct = kpi.success;
  const ringStyle = { ["--val"]: succPct };

  return (
    <section className="card reveal" data-reveal>
      <h2>Reports &amp; Notifications</h2>

      <div className="row" style={{ marginTop: 12 }}>
        <button className="btn" onClick={() => console.log("Export Pilot CSV")}>
          Export Pilot Summary (CSV)
        </button>
        <button className="btn" onClick={() => window.print()}>
          Export Decision Snapshot (Print/PDF)
        </button>
        <button className="btn" onClick={() => console.log("Email stakeholders (simulate)")}>
          Email Stakeholders (sim)
        </button>
      </div>

      <div className="sub" style={{ marginTop: 10 }}>
        Rows: {kpi.rows} • Use “View details” in the Sandbox card to inspect raw rows.
      </div>
    </section>
  );
}
