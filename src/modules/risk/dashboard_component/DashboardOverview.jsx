import { useEffect, useState, useMemo } from "react";
import api from "../../../api/api";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from "recharts";

/* =========================================
   FIXED SEVERITY COLORS
========================================= */

const SEVERITY_COLORS = {
  CRITICAL: "#dc2626",
  HIGH: "#ea580c",
  IMPORTANT: "#facc15",
  MODERATE: "#22c55e",
  LOW: "#3b82f6",
  UNKNOWN: "#9ca3af",
};

const renderSmartLabel = ({
  cx,
  cy,
  midAngle,
  innerRadius,
  outerRadius,
  percent,
  name,
  value,
}) => {
  const RADIAN = Math.PI / 180;

  const radius = innerRadius + (outerRadius - innerRadius) * 0.5;

  const x = cx + radius * Math.cos(-midAngle * RADIAN);
  const y = cy + radius * Math.sin(-midAngle * RADIAN);

  const outsideX = cx + (outerRadius + 20) * Math.cos(-midAngle * RADIAN);
  const outsideY = cy + (outerRadius + 20) * Math.sin(-midAngle * RADIAN);

  // If slice is big enough show inside
  if (percent > 0.08) {
    return (
      <text
        x={x}
        y={y}
        fill="#fff"
        textAnchor="middle"
        dominantBaseline="central"
        fontSize={12}
        fontWeight="bold"
      >
        {value}
      </text>
    );
  }

  // Otherwise show outside with line
  return (
    <g>
      <line
        x1={cx + outerRadius * Math.cos(-midAngle * RADIAN)}
        y1={cy + outerRadius * Math.sin(-midAngle * RADIAN)}
        x2={outsideX}
        y2={outsideY}
        stroke="#666"
      />

      <text
        x={outsideX}
        y={outsideY}
        fill="#333"
        fontSize={12}
        textAnchor={outsideX > cx ? "start" : "end"}
      >
        {name}: {value}
      </text>
    </g>
  );
};
/* =========================================
   PATCH SCORE → SEVERITY
========================================= */

const getSeverityFromScore = (score) => {
  if (score >= 90) return "CRITICAL";
  if (score >= 75) return "HIGH";
  if (score >= 60) return "IMPORTANT";
  if (score >= 40) return "MODERATE";
  return "LOW";
};

export default function DashboardOverview({ navigate }) {
  const [patches, setPatches] = useState([]);
  const [cves, setCves] = useState([]);
  const [baselines, setBaselines] = useState([]);

  /* =========================================
     LOAD DATA
  ========================================= */

  useEffect(() => {
    const load = async () => {
      const patchRes = await api.get("/patches");

      const patchData = Array.isArray(patchRes.data)
        ? patchRes.data
        : patchRes.data?.data || [];

      setPatches(patchData);

      const payload = patchData.map((p) => ({
        patch_id: p.patch_id,
        site_name: p.site_name,
      }));

      const cveRes = await api.post("/cves/by-patches", {
        patches: payload,
      });

      setCves(cveRes.data?.data || []);

      const baselineRes = await api.get("/baselines");

      const baselineData = Array.isArray(baselineRes.data)
        ? baselineRes.data
        : baselineRes.data?.data || [];

      setBaselines(baselineData);
    };

    load();
  }, []);

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
    };

    patches.forEach((p) => {
      const score = Number(p.final_score || 0);

      const severity = getSeverityFromScore(score);

      distribution[severity]++;
    });

    return Object.entries(distribution).map(([name, value]) => ({
      name,
      value,
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

  /* =========================================
     COMPONENT
  ========================================= */

  return (
    <div className="dashboard-overview">

      {/* =====================================
          KPI ROW
      ===================================== */}

      <div className="dashboard-kpi-row">
        <div className="kpi-card" onClick={() => navigate("cve")}>
          <h4>Total CVEs</h4>
          <p>{cves.length}</p>
          <span>Detected vulnerabilities</span>
        </div>

        <div className="kpi-card" onClick={() => navigate("cve")}>
          <h4>KEV CVEs</h4>
          <p>{kevCount}</p>
          <span>Exploited vulnerabilities</span>
        </div>

        <div className="kpi-card" onClick={() => navigate("patch")}>
          <h4>Total Patches</h4>
          <p>{patches.length}</p>
          <span>Available Patches</span>
        </div>

        <div className="kpi-card" onClick={() => navigate("computer")}>
          <h4>Device</h4>
          <p>{uniqueDeviceCount}</p>
          <span>Applicable Device</span>
        </div>

        <div className="kpi-card" onClick={() => navigate("baseline")}>
          <h4>Baselines</h4>
          <p>{baselines.length}</p>
          <span>Total Baseline</span>
        </div>
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
              >
                {severityData.map((entry, i) => (
                  <Cell key={i} fill={SEVERITY_COLORS[entry.name]} />
                ))}
              </Pie>

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
              <div key={item.name} className="legend-item">
                <span
                  className="legend-color"
                  style={{ background: SEVERITY_COLORS[item.name] }}
                />
                {item.name} ({item.value})
              </div>
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
                  { name: "KEV", value: kevCount },
                  { name: "Non KEV", value: cves.length - kevCount },
                ]}
                dataKey="value"
                innerRadius={80}
                outerRadius={120}
              >
                <Cell fill="#dc2626" />
                <Cell fill="#22c55e" />
              </Pie>

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
            <div className="legend-item">
              <span
                className="legend-color"
                style={{ background: "#dc2626" }}
              />
              KEV ({kevCount})
            </div>

            <div className="legend-item">
              <span
                className="legend-color"
                style={{ background: "#22c55e" }}
              />
              Non KEV ({cves.length - kevCount})
            </div>
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
              >
                {patchSeverityDistribution.map((entry, i) => (
                  <Cell key={i} fill={SEVERITY_COLORS[entry.name]} />
                ))}
              </Pie>

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
              <div key={item.name} className="legend-item">
                <span
                  className="legend-color"
                  style={{ background: SEVERITY_COLORS[item.name] }}
                />
                {item.name} ({item.value})
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
