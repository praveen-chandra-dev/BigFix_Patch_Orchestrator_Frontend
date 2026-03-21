// src/modules/risk/DashboardTab.jsx
import { useState, useEffect } from "react";
import api from "../../api/api";

import DashboardOverview from "./dashboard_component/DashboardOverview";
import CVEDashboard from "./dashboard_component/CVEDashboard";
import PatchDashboard from "./dashboard_component/PatchDashboard";
import ComputerDashboard from "./dashboard_component/ComputerDashboard";
import BaselineDashboard from "./dashboard_component/BaselineDashboard";

import "./dashboard.css";

export default function DashboardTab({
  baselines,
  activeSection,
  onNavigateSubTab,
  setGlobalFilters,
  setGlobalLogic,
  parentFilters,
  parentLogic,
  refreshTrigger,
  onDataLoaded,
}) {
  const [patches, setPatches] = useState([]);
  const [cves, setCves] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadDashboardData = async () => {
      try {
        const [patchRes, cveRes] = await Promise.all([
          api.get("/patches"),
          api.get("/cves"),
        ]);
        
        // FIXED: Safely extract array out of potential { data: [], pagination: {} } wrapper
        const patchData = Array.isArray(patchRes.data) ? patchRes.data : (patchRes.data?.data || []);
        
        setPatches(patchData);
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
    <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
      {loading && (
        <div className="app-loading-content">Loading dashboard...</div>
      )}

      {!loading && activeSection === "overview" && (
        <DashboardOverview
          navigate={(section, filters = [], logic = "AND") => {
            setGlobalFilters(filters);
            setGlobalLogic(logic);
            onNavigateSubTab(section);
          }}
          patches={patches}
          cves={cves}
          baselines={baselines}
          onDataLoaded={onDataLoaded}
        />
      )}

      {!loading && activeSection === "cve" && (
        <CVEDashboard
          patches={patches}
          cves={cves}
          baselines={baselines}
          parentFilters={parentFilters}
          parentLogic={parentLogic}
          onDataLoaded={onDataLoaded}
          navigate={(section, filters = [], logic = "AND") => {
            setGlobalFilters(filters);
            setGlobalLogic(logic);
            onNavigateSubTab(section);
          }}
        />
      )}

      {!loading && activeSection === "patch" && (
        <PatchDashboard
          patches={patches}
          cves={cves}
          baselines={baselines}
          parentFilters={parentFilters}
          parentLogic={parentLogic}
          navigate={(section, filters = [], logic = "AND") => {
            setGlobalFilters(filters);
            setGlobalLogic(logic);
            onNavigateSubTab(section);
          }}
        />
      )}

      {!loading && activeSection === "computer" && (
        <ComputerDashboard
          patches={patches}
          cves={cves}
          parentFilters={parentFilters}
          parentLogic={parentLogic}
          onDataLoaded={onDataLoaded}
          navigate={(section, filters = [], logic = "AND") => {
            setGlobalFilters(filters);
            setGlobalLogic(logic);
            onNavigateSubTab(section);
          }}
        />
      )}

      {!loading && activeSection === "baseline" && (
        <BaselineDashboard
          parentFilters={parentFilters}
          parentLogic={parentLogic}
          onDataLoaded={onDataLoaded}
          navigate={(section, filters = [], logic = "AND") => {
            setGlobalFilters(filters);
            setGlobalLogic(logic);
            onNavigateSubTab(section);
          }}
        />
      )}
    </div>
  );
}