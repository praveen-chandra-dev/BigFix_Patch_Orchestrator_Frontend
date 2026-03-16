// src/modules/risk/RiskModule.jsx
import { useState, useEffect, useCallback, useMemo } from "react";
import PatchTab from "./PatchTab";
import BaselineTab from "./BaselineTab";
import DashboardTab from "./DashboardTab";
import FilterDrawer from "../../components/FilterDrawer";
import api from "../../api/api";
import "./risk.css";

export default function RiskModule({
  onClose,
  activeTab = "patches",
  activeSubTab = "overview",
  setRiskTab,
  setRiskSubTab,
  onSetPending,
}) {
  const [baselines, setBaselines] = useState([]);
  const [pendingPatches, setPendingPatches] = useState([]);
  const [patches, setPatches] = useState([]);
  const [patchLoading, setPatchLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState("");

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [globalLogic, setGlobalLogic] = useState("AND");
  const [filters, setFilters] = useState([]);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  useEffect(() => {}, [filters]);

  useEffect(() => {
    if (activeTab !== "dashboard") {
      setFilters([]);
    }
  }, [activeTab]);

  const addBaseline = (data) => {
    setPendingPatches(data.patches);
    if (onSetPending) onSetPending(data.patches);
    if (setRiskTab) setRiskTab("baseline");
  };

  const handleRefresh = useCallback(() => {
    setRefreshTrigger((prev) => prev + 1);
    setLastUpdated(new Date().toLocaleString());
  }, []);

  const loadPatches = useCallback(async () => {
    setPatchLoading(true);
    try {
      const res = await api.get("/patches");
      setPatches(res.data || []);
      if (!lastUpdated) setLastUpdated(new Date().toLocaleString());
    } catch (err) {
      console.error("Failed to load patches", err);
    } finally {
      setPatchLoading(false);
    }
  }, [refreshTrigger]);

  const loadBaselines = useCallback(async () => {
    try {
      const res = await api.get("/baselines");
      setBaselines(res.data?.data || []);
    } catch (err) {
      console.error("Failed to load baselines", err);
    }
  }, []);

  useEffect(() => {
    loadPatches();
    loadBaselines();
  }, [loadPatches, loadBaselines]);

  const propertyOptions = useMemo(() => {
    if (activeTab === "patches")
      return [
        { value: "patch_id", label: "Patch ID" },
        { value: "patch_name", label: "Name" },
        { value: "severity", label: "Severity" },
        { value: "cve_id", label: "CVE ID" },
        { value: "final_score", label: "Score" },
      ];
    if (activeTab === "baseline")
      return [
        { value: "baseline_name", label: "Baseline Name" },
        { value: "patch_id", label: "Patch ID" },
        { value: "cve_id", label: "CVE ID" },
      ];
    if (activeTab === "dashboard") {
      if (activeSubTab === "cve")
        return [
          { value: "cve_id", label: "CVE ID" },
          { value: "baseline_name", label: "Baseline Name" },
          { value: "patch_id", label: "Patch ID" },
          { value: "device_name", label: "Device Name" },
          { value: "kev", label: "KEV" },
          { value: "severity", label: "Severity" },
        ];
      if (activeSubTab === "patch")
        return [
          { value: "patch_id", label: "Patch ID" },
          { value: "patch_name", label: "Name" },
          { value: "baseline_name", label: "Baseline Name" },
          { value: "severity", label: "Severity" },
          { value: "cve_id", label: "CVE ID" },
          { value: "device", label: "Device" },
          { value: "final_score", label: "Score" },
        ];
      if (activeSubTab === "computer")
        return [
          { value: "device_name", label: "Device Name" },
          { value: "patch_id", label: "Patch ID" },
          { value: "cve_id", label: "CVE ID" },
        ];
      if (activeSubTab === "baseline")
        return [
          { value: "baseline_name", label: "Baseline Name" },
          { value: "patch_id", label: "Patch ID" },
          { value: "cve_id", label: "CVE ID" },
        ];
    }
    return [];
  }, [activeTab, activeSubTab]);

  const activeFilterCount = filters.reduce(
    (acc, b) => acc + b.conds.filter((c) => c.value).length,
    0,
  );

  const showFilter = !(
    activeTab === "dashboard" && activeSubTab === "overview"
  );

  const setNormalizedFilters = (incoming) => {
    const normalized = incoming.map((block) => ({
      ...block,
      conds: block.conds.map((cond) => {
        let op = cond.operator?.toLowerCase();

        if (op === "equals" || op === "=") op = "=";
        if (op === "not equals" || op === "!=") op = "!=";
        if (op === "contains") op = "contains";
        if (op === "greater than" || op === ">") op = ">";
        if (op === "less than" || op === "<") op = "<";

        return {
          ...cond,
          column: cond.column === "cvss_severity" ? "severity" : cond.column,
          operator: op,
        };
      }),
    }));

    setFilters(normalized);
  };

  return (
    <div
      className="card reveal"
      style={{
        minHeight: "100%",
        display: "flex",
        flexDirection: "column",
        padding: 0,
        overflow: "visible",
        boxShadow: "none",
        border: "none",
        background: "transparent",
      }}
    >
      <div
        style={{
          position: "sticky",
          top: "-24px",
          background: "var(--panel)",
          zIndex: 20,
          padding: "24px 32px 16px",
          borderBottom: "1px solid var(--border)",
          margin: "-24px -32px 24px -32px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          boxShadow: "0 4px 6px -1px rgba(0,0,0,0.05)",
        }}
      >
        <div>
          <h2
            style={{
              margin: 0,
              fontSize: "22px",
              fontWeight: 600,
              color: "var(--text)",
            }}
          >
            Risk Prioritization
          </h2>
          <div className="text-13 muted-text" style={{ marginTop: "4px" }}>
            Updated: {lastUpdated || "—"}
          </div>
        </div>
        <div style={{ display: "flex", gap: "12px" }}>
          {showFilter && (
            <div style={{ position: "relative" }}>
              <button
                className="iconbtn"
                onClick={() => setDrawerOpen(true)}
                title="Filter Data"
              >
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  width="16"
                  height="16"
                >
                  <line x1="4" y1="21" x2="4" y2="14"></line>
                  <line x1="4" y1="10" x2="4" y2="3"></line>
                  <line x1="12" y1="21" x2="12" y2="12"></line>
                  <line x1="12" y1="8" x2="12" y2="3"></line>
                  <line x1="20" y1="21" x2="20" y2="16"></line>
                  <line x1="20" y1="12" x2="20" y2="3"></line>
                  <line x1="1" y1="14" x2="7" y2="14"></line>
                  <line x1="9" y1="8" x2="15" y2="8"></line>
                  <line x1="17" y1="16" x2="23" y2="16"></line>
                </svg>
              </button>
              {activeFilterCount > 0 && (
                <span
                  className="pill blue"
                  style={{
                    position: "absolute",
                    top: -8,
                    right: -8,
                    padding: "2px 6px",
                    fontSize: 10,
                  }}
                >
                  {activeFilterCount}
                </span>
              )}
            </div>
          )}
          <button
            className="iconbtn"
            onClick={handleRefresh}
            title="Refresh Data"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              width="16"
              height="16"
            >
              <path d="M23 4v6h-6"></path>
              <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path>
            </svg>
          </button>
        </div>
      </div>

      <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
        {activeFilterCount > 0 && showFilter && (
          <div className="active-filter-banner active">
            <div className="filter-tags">
              {filters.map((b, bIdx) => {
                const validConds = b.conds.filter((c) => c.value);
                if (!validConds.length) return null;
                return (
                  <div
                    key={bIdx}
                    style={{ display: "inline-flex", alignItems: "center" }}
                  >
                    {bIdx > 0 && (
                      <span
                        style={{
                          fontSize: 12,
                          fontWeight: 600,
                          color: "var(--primary)",
                          margin: "0 8px",
                        }}
                      >
                        {globalLogic}
                      </span>
                    )}
                    {validConds.map((c, cIdx) => (
                      <span
                        key={cIdx}
                        style={{ display: "inline-flex", alignItems: "center" }}
                      >
                        {cIdx > 0 && (
                          <span
                            style={{
                              fontSize: 11,
                              fontWeight: 600,
                              color: "var(--primary)",
                              margin: "0 6px",
                            }}
                          >
                            AND
                          </span>
                        )}
                        <span className="filter-tag">
                          <strong>
                            {propertyOptions.find((o) => o.value === c.column)
                              ?.label || c.column}
                          </strong>
                          &nbsp;
                          {c.operator === "="
                            ? "equals"
                            : c.operator === "!="
                              ? "not equals"
                              : c.operator === ">"
                                ? "greater than"
                                : c.operator === "<"
                                  ? "less than"
                                  : c.operator}
                          &nbsp;<strong>'{c.value}'</strong>
                        </span>
                      </span>
                    ))}
                  </div>
                );
              })}
            </div>
            <button className="btn outline" onClick={() => setFilters([])}>
              Clear Filters
            </button>
          </div>
        )}

        <div className="risk-content" style={{ flex: 1 }}>
          {activeTab === "patches" && (
            <PatchTab
              patches={patches}
              patchLoading={patchLoading}
              addBaseline={addBaseline}
              parentFilters={filters}
              parentLogic={globalLogic}
              navigate={(section, incomingFilters = [], logic = "AND") => {
                setNormalizedFilters(incomingFilters);
                setGlobalLogic(logic);
                setRiskSubTab(section);
                setRiskTab("dashboard");
              }}
            />
          )}

          {activeTab === "baseline" && (
            <BaselineTab
              baselines={baselines}
              pendingPatches={pendingPatches}
            />
          )}

          {activeTab === "dashboard" && (
            <DashboardTab
              baselines={baselines}
              activeSection={activeSubTab}
              onNavigateSubTab={setRiskSubTab}
              setGlobalFilters={setNormalizedFilters}
              setGlobalLogic={setGlobalLogic}
              parentFilters={filters}
              parentLogic={globalLogic}
              refreshTrigger={refreshTrigger}
              onDataLoaded={() => {
                if (!lastUpdated) setLastUpdated(new Date().toLocaleString());
              }}
            />
          )}
        </div>
      </div>

      <FilterDrawer
        isOpen={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        filters={filters}
        setFilters={setFilters}
        globalLogic={globalLogic}
        setGlobalLogic={setGlobalLogic}
        propertyOptions={propertyOptions}
      />
    </div>
  );
}