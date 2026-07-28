// src/modules/risk/dashboard_component/DashboardOverview.jsx
import { useMemo } from "react";
import PropTypes from "prop-types";
import { PieChart, Pie, Tooltip, ResponsiveContainer } from "recharts";

/* =========================================
   FIXED SEVERITY COLORS
========================================= */

const SEVERITY_COLORS = {
  CRITICAL: "#dc2626",
  HIGH: "#ea580c",
  IMPORTANT: "#d97706",
  MODERATE: "#facc15",
  MEDIUM: "#facc15",
  LOW: "#3b82f6",
  UNSPECIFIED: "#9ca3af",
  UNKNOWN: "#9ca3af",
};

const getDerivedSeverity = (patch) => {
  const score = Number(patch.final_score || 0);
  const cveCount = Number(patch.cve_count || 0);
  const sevRaw = String(patch.severity || patch.source_severity || "")
    .toUpperCase()
    .trim();

  let derivedSeverity = "UNSPECIFIED";

  // RULE 1: No CVEs → use original severity
  if (cveCount === 0) {
    if (["CRITICAL", "HIGH", "IMPORTANT", "MODERATE", "LOW"].includes(sevRaw)) {
      derivedSeverity = sevRaw;
    }
  }
  // RULE 2: Score overrides
  else if (score > 0) {
    if (score >= 90) derivedSeverity = "CRITICAL";
    else if (score >= 75) derivedSeverity = "HIGH";
    else if (score >= 60) derivedSeverity = "IMPORTANT";
    else if (score >= 40) derivedSeverity = "MODERATE";
    else derivedSeverity = "LOW";
  }
  // RULE 3: fallback
  else if (
    ["CRITICAL", "HIGH", "IMPORTANT", "MODERATE", "LOW"].includes(sevRaw)
  ) {
    derivedSeverity = sevRaw;
  }

  return derivedSeverity;
};

export default function DashboardOverview({
  navigate,
  patches = [],
  cves = [],
  baselines = [],
}) {
  /* =========================================
     LOAD DATA
  ========================================= */

  const kevCount = cves.filter((c) => c.is_kev).length;

  /* =========================================
     CVE SEVERITY DISTRIBUTION
  ========================================= */

  const severityData = useMemo(() => {
    const map = {};

    cves.forEach((c) => {
      const sev = c.cvss_severity || "UNKNOWN";
      map[sev] = (map[sev] || 0) + 1;
    });

    return Object.entries(map).map(([name, value]) => ({
      name,
      value,
      fill: SEVERITY_COLORS[name] || SEVERITY_COLORS.UNKNOWN,
    }));
  }, [cves]);

  const totalCVEs = severityData.reduce((sum, s) => sum + s.value, 0);

  /* =========================================
     PATCH SEVERITY DISTRIBUTION
  ========================================= */

  const patchSeverityDistribution = useMemo(() => {
    const distribution = {
      CRITICAL: 0,
      HIGH: 0,
      IMPORTANT: 0,
      MODERATE: 0,
      LOW: 0,
      UNSPECIFIED: 0,
    };

    patches.forEach((p) => {
      const finalSev = getDerivedSeverity(p);

      if (distribution[finalSev] !== undefined) {
        distribution[finalSev]++;
      } else {
        distribution[finalSev] = 1;
      }
    });

    return Object.entries(distribution)
      .filter(([, value]) => value > 0) // Only render slices that exist
      .map(([name, value]) => ({
        name,
        value,
        fill: SEVERITY_COLORS[name] || SEVERITY_COLORS.UNSPECIFIED,
      }));
  }, [patches]);

  const uniqueDeviceCount = useMemo(() => {
    const devices = new Set();

    patches.forEach((p) => {
      (p.applicable_computers || []).forEach((device) => {
        devices.add(device);
      });
    });

    return devices.size;
  }, [patches]);

  const totalPatches = patchSeverityDistribution.reduce(
    (sum, s) => sum + s.value,
    0,
  );

  const handlePatchSeverityClick = (severity) => {
    navigate(
      "patch",
      [
        {
          conds: [
            {
              column: "severity",
              operator: "equals",
              value: severity,
            },
          ],
        },
      ],
      "AND",
    );
  };

  const handleCveSeverityClick = (severity) => {
    navigate(
      "cve",
      [
        {
          conds: [
            {
              column: "cvss_severity",
              operator: "equals",
              value: severity,
            },
          ],
        },
      ],
      "AND",
    );
  };

  const handleKevNavigation = (kevValue) => {
    navigate(
      "cve",
      [
        {
          conds: [
            {
              column: "kev",
              operator: "=",
              value: kevValue,
            },
          ],
        },
      ],
      "AND",
    );
  };

  /* =========================================
     COMPONENT
  ========================================= */

  return (
    <div className="dashboard-overview">
      {/* =====================================
          KPI ROW
      ===================================== */}

      <div className="dashboard-kpi-row">
        <button
          type="button"
          className="kpi-card"
          onClick={() => navigate("cve")}
          style={{
            display: "block",
            width: "100%",
            fontFamily: "inherit",
            color: "inherit",
            border: "1px solid var(--border)",
            textAlign: "center",
          }}
        >
          <h4>Total CVEs</h4>
          <p>{cves.length}</p>
          <span>Detected vulnerabilities</span>
        </button>

        <button
          type="button"
          className="kpi-card"
          onClick={() => handleKevNavigation("YES")}
          style={{
            display: "block",
            width: "100%",
            fontFamily: "inherit",
            color: "inherit",
            border: "1px solid var(--border)",
            textAlign: "center",
          }}
        >
          <h4>KEV CVEs</h4>
          <p>{kevCount}</p>
          <span>Exploited vulnerabilities</span>
        </button>

        <button
          type="button"
          className="kpi-card"
          onClick={() => navigate("patch", [], "AND")}
          style={{
            display: "block",
            width: "100%",
            fontFamily: "inherit",
            color: "inherit",
            border: "1px solid var(--border)",
            textAlign: "center",
          }}
        >
          <h4>Total Patches</h4>
          <p>{patches.length}</p>
          <span>Available Patches</span>
        </button>

        <button
          type="button"
          className="kpi-card"
          onClick={() => navigate("computer")}
          style={{
            display: "block",
            width: "100%",
            fontFamily: "inherit",
            color: "inherit",
            border: "1px solid var(--border)",
            textAlign: "center",
          }}
        >
          <h4>Device</h4>
          <p>{uniqueDeviceCount}</p>
          <span>Applicable Device</span>
        </button>

        <button
          type="button"
          className="kpi-card"
          onClick={() => navigate("baseline")}
          style={{
            display: "block",
            width: "100%",
            fontFamily: "inherit",
            color: "inherit",
            border: "1px solid var(--border)",
            textAlign: "center",
          }}
        >
          <h4>Baselines</h4>
          <p>{baselines.length}</p>
          <span>Total Baseline</span>
        </button>
      </div>

      {/* =====================================
          CHART GRID
      ===================================== */}

      <div className="dashboard-chart-grid">
        {/* ================= CVE SEVERITY ================= */}

        <div className="chart-card">
          <h3>CVE Severity Distribution</h3>

          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie
                data={severityData}
                dataKey="value"
                nameKey="name"
                innerRadius={80}
                outerRadius={120}
                onClick={(data) => handleCveSeverityClick(data.name)}
                cursor="pointer"
              />

              <text
                x="50%"
                y="50%"
                textAnchor="middle"
                dominantBaseline="middle"
                style={{ fontSize: 24, fontWeight: "bold" }}
              >
                {totalCVEs}
              </text>

              <text
                x="50%"
                y="60%"
                textAnchor="middle"
                dominantBaseline="middle"
                style={{ fontSize: 12, fill: "#666" }}
              >
                CVEs
              </text>

              <Tooltip />
            </PieChart>
          </ResponsiveContainer>

          {/* LEGEND */}

          <div className="chart-legend">
            {severityData.map((item) => (
              <button
                type="button"
                key={item.name}
                className="legend-item"
                onClick={() => handleCveSeverityClick(item.name)}
                style={{
                  cursor: "pointer",
                  background: "none",
                  border: "none",
                  fontFamily: "inherit",
                  fontSize: "inherit",
                  color: "inherit",
                  padding: "2px 6px",
                }}
              >
                <span
                  className="legend-color"
                  style={{ background: SEVERITY_COLORS[item.name] }}
                />
                {item.name} ({item.value})
              </button>
            ))}
          </div>
        </div>

        {/* ================= KEV vs NON KEV ================= */}

        <div className="chart-card">
          <h3>KEV vs Non-KEV</h3>

          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie
                data={[
                  { name: "KEV", value: kevCount, fill: "#dc2626" },
                  {
                    name: "Non KEV",
                    value: cves.length - kevCount,
                    fill: "#22c55e",
                  },
                ]}
                dataKey="value"
                innerRadius={80}
                outerRadius={120}
                onClick={(data) =>
                  handleKevNavigation(data.name === "KEV" ? "YES" : "NO")
                }
                cursor="pointer"
              />

              <text
                x="50%"
                y="50%"
                textAnchor="middle"
                dominantBaseline="middle"
                style={{ fontSize: 24, fontWeight: "bold" }}
              >
                {cves.length}
              </text>

              <text
                x="50%"
                y="60%"
                textAnchor="middle"
                dominantBaseline="middle"
                style={{ fontSize: 12, fill: "#666" }}
              >
                CVEs
              </text>

              <Tooltip />
            </PieChart>
          </ResponsiveContainer>

          <div className="chart-legend">
            <button
              type="button"
              className="legend-item"
              onClick={() => handleKevNavigation("YES")}
              style={{
                cursor: "pointer",
                background: "none",
                border: "none",
                fontFamily: "inherit",
                fontSize: "inherit",
                color: "inherit",
                padding: "2px 6px",
              }}
            >
              <span
                className="legend-color"
                style={{ background: "#dc2626" }}
              ></span>
              KEV ({kevCount})
            </button>

            <button
              type="button"
              className="legend-item"
              onClick={() => handleKevNavigation("NO")}
              style={{
                cursor: "pointer",
                background: "none",
                border: "none",
                fontFamily: "inherit",
                fontSize: "inherit",
                color: "inherit",
                padding: "2px 6px",
              }}
            >
              <span
                className="legend-color"
                style={{ background: "#22c55e" }}
              ></span>
              Non KEV ({cves.length - kevCount})
            </button>
          </div>
        </div>

        {/* ================= PATCH DISTRIBUTION ================= */}

        <div className="chart-card">
          <h3>Patch Severity Distribution</h3>

          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie
                data={patchSeverityDistribution}
                dataKey="value"
                nameKey="name"
                innerRadius={80}
                outerRadius={120}
                onClick={(data) => handlePatchSeverityClick(data.name)}
                cursor="pointer"
              />

              <text
                x="50%"
                y="50%"
                textAnchor="middle"
                dominantBaseline="middle"
                style={{ fontSize: 24, fontWeight: "bold" }}
              >
                {totalPatches}
              </text>

              <text
                x="50%"
                y="60%"
                textAnchor="middle"
                dominantBaseline="middle"
                style={{ fontSize: 12, fill: "#666" }}
              >
                PATCHES
              </text>

              <Tooltip />
            </PieChart>
          </ResponsiveContainer>

          <div className="chart-legend">
            {patchSeverityDistribution.map((item) => (
              <button
                type="button"
                key={item.name}
                className="legend-item"
                onClick={() => handlePatchSeverityClick(item.name)}
                style={{
                  cursor: "pointer",
                  background: "none",
                  border: "none",
                  fontFamily: "inherit",
                  fontSize: "inherit",
                  color: "inherit",
                  padding: "2px 6px",
                }}
              >
                <span
                  className="legend-color"
                  style={{ background: SEVERITY_COLORS[item.name] }}
                />
                {item.name} ({item.value})
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

DashboardOverview.propTypes = {
  navigate: PropTypes.func.isRequired,
  patches: PropTypes.array,
  cves: PropTypes.array,
  baselines: PropTypes.array,
};
