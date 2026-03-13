// src/modules/risk/DashboardTab.jsx
import { useState, useEffect } from "react";
import api from "../../api/api";

import DashboardOverview from "./dashboard_component/DashboardOverview";
import CVEDashboard from "./dashboard_component/CVEDashboard";
import PatchDashboard from "./dashboard_component/PatchDashboard";
import ComputerDashboard from "./dashboard_component/ComputerDashboard";
import BaselineDashboard from "./dashboard_component/BaselineDashboard";

import "./dashboard.css";

export default function DashboardTab({ baselines, activeSection, onNavigateSubTab, parentFilters, parentLogic, refreshTrigger, onDataLoaded }) {
  const [patches, setPatches] = useState([]);
  const [cves, setCves] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadDashboardData = async () => {
      try {
        const [patchRes, cveRes] = await Promise.all([
          api.get("/patches"),
          api.get("/cves")
        ]);
        setPatches(patchRes.data || []);
        setCves(cveRes.data?.data || []);
      } catch (err) {
        console.error("Dashboard load failed:", err);
      } finally {
        setLoading(false);
      }
    };
    loadDashboardData();
  }, [refreshTrigger]);

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
      {loading && (
        <div className="app-loading-content">
          Loading dashboard...
        </div>
      )}

      {!loading && activeSection === "overview" &&
        <DashboardOverview
          navigate={onNavigateSubTab}
          patches={patches}
          cves={cves}
          baselines={baselines}
          onDataLoaded={onDataLoaded}
        />
      }

      {!loading && activeSection === "cve" &&
        <CVEDashboard
          patches={patches}
          cves={cves}
          parentFilters={parentFilters}
          parentLogic={parentLogic}
          onDataLoaded={onDataLoaded}
        />
      }

      {!loading && activeSection === "patch" &&
        <PatchDashboard
          patches={patches}
          cves={cves}
          parentFilters={parentFilters}
          parentLogic={parentLogic}
          onDataLoaded={onDataLoaded}
        />
      }

      {!loading && activeSection === "computer" &&
        <ComputerDashboard
          patches={patches}
          cves={cves}
          parentFilters={parentFilters}
          parentLogic={parentLogic}
          onDataLoaded={onDataLoaded}
        />
      }

      {!loading && activeSection === "baseline" &&
        <BaselineDashboard
          patches={patches}
          cves={cves}
          baselines={baselines}
          parentFilters={parentFilters}
          parentLogic={parentLogic}
          onDataLoaded={onDataLoaded}
        />
      }
    </div>
  );
}