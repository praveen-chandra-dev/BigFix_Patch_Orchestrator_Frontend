import { useEffect, useMemo, useRef, useState } from "react";

/* ---------- helpers ---------- */
const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:5174";

async function getJson(url, signal) {
  const r = await fetch(url, { headers: { Accept: "application/json" }, cache: "no-store", signal });
  const t = await r.text();
  if (!r.ok) throw new Error(`HTTP ${r.status}: ${t.slice(0, 400)}`);
  try { return JSON.parse(t); } catch { throw new Error(`Unexpected (not JSON): ${t.slice(0, 400)}`); }
}

const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
function useInView(ref, options = { threshold: 0.2, rootMargin: "0px 0px -20% 0px" }) {
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(([ent]) => setInView(ent.isIntersecting), options);
    io.observe(el);
    return () => io.disconnect();
  }, [ref, options.threshold, options.rootMargin]);
  return inView;
}

/* ---- badge tones ---- */
const toneForSuccess = (pct, th = 90) => (pct >= th ? "green" : pct >= th - 5 ? "amber" : "red");
const toneForCHF = (n) => (n === 0 ? "green" : n <= 3 ? "amber" : "red");
const rebootTone = (n) => (n === 0 ? "green" : "amber");
const errorTone = (n) => (n === 0 ? "green" : "amber");

/* ------------------------------- metric tile ------------------------------- */
function MetricTile({ label, value, tone, delay = 0, onClick }) {
  return (
    <div
      className="kpi clickable"
      onClick={onClick}
      style={{
        transform: "translateY(8px) scale(0.98)",
        opacity: 0,
        animation: `kpi-pop 420ms cubic-bezier(.2,.8,.2,1) ${delay}ms forwards`,
      }}
    >
      <span className="label" style={{ fontWeight: 800 }}>{label}</span>
      <span className="value">
        <span className={`pill click ${tone}`} style={{ fontWeight: 900 }}>
          {value}
        </span>
      </span>
    </div>
  );
}

/* ---------- SVG donut helpers ---------- */
function arcPath(cx, cy, r, startDeg, endDeg, innerR = 0) {
  const toRad = (d) => (d - 90) * (Math.PI / 180);
  const large = endDeg - startDeg > 180 ? 1 : 0;
  const sx = cx + r * Math.cos(toRad(startDeg));
  const sy = cy + r * Math.sin(toRad(startDeg));
  const ex = cx + r * Math.cos(toRad(endDeg));
  const ey = cy + r * Math.sin(toRad(endDeg));
  if (!innerR) return `M ${cx} ${cy} L ${sx} ${sy} A ${r} ${r} 0 ${large} 1 ${ex} ${ey} Z`;
  const six = cx + innerR * Math.cos(toRad(endDeg));
  const siy = cy + innerR * Math.sin(toRad(endDeg));
  const eix = cx + innerR * Math.cos(toRad(startDeg));
  const eiy = cy + innerR * Math.sin(toRad(startDeg));
  return [
    `M ${sx} ${sy}`,
    `A ${r} ${r} 0 ${large} 1 ${ex} ${ey}`,
    `L ${six} ${siy}`,
    `A ${innerR} ${innerR} 0 ${large} 0 ${eix} ${eiy}`,
    "Z",
  ].join(" ");
}

/* -------------------------------- component -------------------------------- */
export default function PilotKPI() {
  // KPI counters
  const [kpi, setKpi] = useState({
    rebootPending: 2,
    error1603: 2,
    critHealthFails: 0,
    successRate: 0,      // sandbox success %
    successCount: 0,     // sandbox successes
    totalCount: 0,       // sandbox total
  });

  // Total BES computers (separate from sandbox totals)
  const [totalComputers, setTotalComputers] = useState(0);

  // Events from refresh flow
  useEffect(() => {
    function onSandbox(e) {
      const { success = 0, total = 0 } = e.detail || {};
      const rate = total > 0 ? Math.round((Number(success) / Number(total)) * 100) : 0;
      setKpi((p) => ({
        ...p,
        successRate: rate,
        successCount: Number(success) || 0,
        totalCount: Number(total) || 0,
      }));
    }
    function onHealth(e) {
      const { count = 0 } = e.detail || {};
      setKpi((p) => ({ ...p, critHealthFails: Number(count || 0) }));
    }
    function onTotals(e) {
      const { totalComputers: tc = 0 } = e.detail || {};
      setTotalComputers(Number(tc) || 0);
      // cache for other widgets
      window.__pilotCache = window.__pilotCache || {};
      window.__pilotCache.totals = { ...(window.__pilotCache.totals || {}), computers: Number(tc) || 0 };
    }

    window.addEventListener("pilot:sandboxResultsUpdated", onSandbox);
    window.addEventListener("pilot:criticalHealthUpdated", onHealth);
    window.addEventListener("pilot:totalsUpdated", onTotals);

    // hydrate from cache if available
    if (window.__pilotCache?.sandboxResults) onSandbox({ detail: window.__pilotCache.sandboxResults });
    if (window.__pilotCache?.criticalHealth) onHealth({ detail: window.__pilotCache.criticalHealth });
    if (window.__pilotCache?.totals?.computers) setTotalComputers(Number(window.__pilotCache.totals.computers) || 0);

    // optional: try to fetch total computers if backend exposes it
    (async () => {
      try {
        const data = await getJson(`${API_BASE}/api/infra/total-computers`);
        if (typeof data?.total === "number") setTotalComputers(Number(data.total) || 0);
      } catch {
        // ignore if endpoint doesn't exist
      }
    })();

    return () => {
      window.removeEventListener("pilot:sandboxResultsUpdated", onSandbox);
      window.removeEventListener("pilot:criticalHealthUpdated", onHealth);
      window.removeEventListener("pilot:totalsUpdated", onTotals);
    };
  }, []);

  const rootRef = useRef(null);
  useInView(rootRef);

  /* ---------- Donut slices from counts, using TOTAL COMPUTERS ---------- */
  const donut = useMemo(() => {
    const R = kpi.rebootPending || 0;
    const E = kpi.error1603 || 0;
    const H = kpi.critHealthFails || 0;

    const T = Number(totalComputers) > 0
      ? Number(totalComputers)
      : Math.max(1, (kpi.successCount || 0) + R + E + H); // fallback if totals not yet known

    const parts = [
      { key: "Success",    val: Math.max(0, T - (R + E + H)), fill: "var(--success)" },
      { key: "Reboot",     val: R, fill: "var(--warn)" },
      { key: "Error 1603", val: E, fill: "var(--info)" },
      { key: "Health",     val: H, fill: "var(--danger)" },
    ];

    const total = parts.reduce((a, b) => a + b.val, 0) || 1;
    let acc = 0;
    return parts.map((p) => {
      const start = (acc / total) * 360;
      const end = ((acc + p.val) / total) * 360;
      acc += p.val;
      return { ...p, start, end, pct: Math.round((p.val / total) * 100) };
    });
  }, [totalComputers, kpi.rebootPending, kpi.error1603, kpi.critHealthFails, kpi.successCount]);

  // Hover selection for donut/legend
  const [hoverKey, setHoverKey] = useState(null);

  // Center % rule (your formula for non-success KPIs, using TOTAL COMPUTERS)
  const center = useMemo(() => {
    const R = kpi.rebootPending || 0;
    const E = kpi.error1603 || 0;
    const H = kpi.critHealthFails || 0;
    const fallbackT = Math.max(1, (kpi.successCount || 0) + R + E + H);
    const T = Number(totalComputers) > 0 ? Number(totalComputers) : fallbackT;

    const asPct = (x) => clamp(Math.round(x), 0, 100);

    const pctFor = (key) => {
      switch (key) {
        case "Success":
          return asPct(kpi.successRate || 0);               // sandbox success/total
        case "Reboot":
          return asPct(((T - R) / T) * 100);                 // (TotalComputers - Reboot) / TotalComputers
        case "Error 1603":
          return asPct(((T - E) / T) * 100);                 // (TotalComputers - Error1603) / TotalComputers
        case "Health":
          return asPct(((T - H) / T) * 100);                 // (TotalComputers - Critical) / TotalComputers
        default:
          return asPct(kpi.successRate || 0);
      }
    };

    const labelFor = (key) => (key ? key.toLowerCase() : "success");
    const key = hoverKey || "Success";
    return { pct: pctFor(key), label: labelFor(key) };
  }, [hoverKey, totalComputers, kpi.successRate, kpi.rebootPending, kpi.error1603, kpi.critHealthFails, kpi.successCount]);

  /* ---------------------- Success drill-down modal ---------------------- */
  const [openSuccess, setOpenSuccess] = useState(false);
  const [successRows, setSuccessRows] = useState([]);
  const [successLoading, setSuccessLoading] = useState(false);
  const [successErr, setSuccessErr] = useState("");

  async function openSuccessModal() {
    setOpenSuccess(true);
    setSuccessErr("");

    const cached = window.__pilotCache?.sandboxResults;
    if (cached && Array.isArray(cached.rows)) {
      setSuccessRows(cached.rows.filter((r) => /success/i.test(r?.status || "")));
      return;
    }

    try {
      setSuccessLoading(true);
      const last = await getJson(`${API_BASE}/api/actions/last`);
      const id = last?.actionId;
      if (!id) throw new Error("No Sandbox run found.");
      const res = await getJson(`${API_BASE}/api/actions/${id}/results`);
      const allRows = Array.isArray(res?.rows) ? res.rows : [];
      setSuccessRows(allRows.filter((r) => /success/i.test(r?.status || "")));
    } catch (e) {
      setSuccessErr(e.message || String(e));
    } finally {
      setSuccessLoading(false);
    }
  }

  /* -------------------- Critical Health drill-down modal -------------------- */
  const [openHealth, setOpenHealth] = useState(false);
  const [healthRows, setHealthRows] = useState([]);
  const [healthLoading, setHealthLoading] = useState(false);
  const [healthErr, setHealthErr] = useState("");

  async function openHealthModal() {
    setOpenHealth(true);
    setHealthErr("");

    const cached = window.__pilotCache?.criticalHealth;
    if (cached && Array.isArray(cached.rows)) {
      setHealthRows(cached.rows);
      return;
    }

    try {
      setHealthLoading(true);
      const data = await getJson(`${API_BASE}/api/health/critical`);
      setHealthRows(Array.isArray(data?.rows) ? data.rows : []);
    } catch (e) {
      setHealthErr(e.message || String(e));
    } finally {
      setHealthLoading(false);
    }
  }

  /* -------------------- AUTO REFRESH every 30 seconds -------------------- */
  useEffect(() => {
    let timer;
    const ab = new AbortController();

    async function tick() {
      try {
        // A) Latest sandbox results
        const last = await getJson(`${API_BASE}/api/actions/last`, ab.signal);
        const actionId = last?.actionId;
        if (actionId) {
          const res = await getJson(`${API_BASE}/api/actions/${actionId}/results`, ab.signal);
          const rows = Array.isArray(res?.rows) ? res.rows : [];
          const success = Number(res?.success ?? rows.filter(r => /success/i.test(r?.status || "")).length);
          const total   = Number(res?.total   ?? rows.length);
          const rate = total > 0 ? Math.round((success / total) * 100) : 0;

          // local state
          setKpi(p => ({ ...p, successRate: rate, successCount: success, totalCount: total }));

          // cache + broadcast
          const sandboxPayload = { actionId, success, total, rows };
          window.__pilotCache = window.__pilotCache || {};
          window.__pilotCache.sandboxResults = sandboxPayload;
          window.dispatchEvent(new CustomEvent("pilot:sandboxResultsUpdated", { detail: sandboxPayload }));
        }

        // B) Critical Health
        const ch = await getJson(`${API_BASE}/api/health/critical`, ab.signal);
        const healthPayload = { count: Number(ch?.count || 0), rows: Array.isArray(ch?.rows) ? ch.rows : [] };
        setKpi(p => ({ ...p, critHealthFails: healthPayload.count }));
        window.__pilotCache = window.__pilotCache || {};
        window.__pilotCache.criticalHealth = healthPayload;
        window.dispatchEvent(new CustomEvent("pilot:criticalHealthUpdated", { detail: healthPayload }));

        // C) Total computers
        try {
          const tot = await getJson(`${API_BASE}/api/infra/total-computers`, ab.signal);
          if (typeof tot?.total === "number") {
            setTotalComputers(Number(tot.total) || 0);
            window.__pilotCache.totals = { ...(window.__pilotCache.totals || {}), computers: Number(tot.total) || 0 };
            window.dispatchEvent(new CustomEvent("pilot:totalsUpdated", { detail: { totalComputers: Number(tot.total) || 0 } }));
          }
        } catch { /* ignore if endpoint missing */ }

        // D) notify others a refresh happened
        window.dispatchEvent(new CustomEvent("pilot:kpiRefreshed", { detail: { ts: Date.now() } }));
      } catch (err) {
        // swallow occasional polling errors
        console.warn("Auto-refresh tick failed:", err?.message || err);
      }
    }

    // immediate, then every 30s
    tick();
    timer = setInterval(tick, 30000);

    return () => {
      clearInterval(timer);
      ab.abort();
    };
  }, []);

  return (
    <section ref={rootRef} className="card reveal" data-reveal>
      <h2>Pilot KPI</h2>

      <div className="row" style={{ gap: 16, alignItems: "center" }}>
        {/* right side only */}
        <div style={{ flex: 1, minWidth: 220 }}>
          <div className="kpis">
            <MetricTile
              label="Success Rate"
              value={`${kpi.successRate}%`}
              tone={toneForSuccess(kpi.successRate)}
              delay={0}
              onClick={openSuccessModal}
            />
            <MetricTile
              label="Critical Health Failures"
              value={kpi.critHealthFails}
              tone={toneForCHF(kpi.critHealthFails)}
              delay={80}
              onClick={openHealthModal}
            />
            <MetricTile
              label="Reboot Pending"
              value={kpi.rebootPending}
              tone={rebootTone(kpi.rebootPending)}
              delay={140}
            />
            <MetricTile
              label="Error 1603 Count"
              value={kpi.error1603}
              tone={errorTone(kpi.error1603)}
              delay={200}
            />
          </div>

          <div className="sep"></div>

          {/* Donut with hover explode + legend; center shows % per rules above */}
          <DonutChart
            donut={donut}
            center={center}
            hoverKey={hoverKey}
            setHoverKey={setHoverKey}
          />
        </div>
      </div>

      <SuccessModal
        open={openSuccess}
        rows={successRows}
        loading={successLoading}
        error={successErr}
        onClose={() => setOpenSuccess(false)}
      />

      <HealthModal
        open={openHealth}
        rows={healthRows}
        loading={healthLoading}
        error={healthErr}
        onClose={() => setOpenHealth(false)}
      />

      {/* pop animation keyframes (scoped) */}
      <style>{`
        @keyframes kpi-pop {
          0%{transform:translateY(10px) scale(.98);opacity:0}
          60%{transform:translateY(0) scale(1.01);opacity:1}
          100%{transform:translateY(0) scale(1);opacity:1}
        }
      `}</style>
    </section>
  );
}

/* -------- small presentational subcomponents to keep main tidy -------- */

function DonutChart({ donut, center, hoverKey, setHoverKey }) {
  return (
    <div className="chart">
      <svg viewBox="0 0 120 64" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Pilot distribution">
        <g transform="translate(0,0)">
          {donut.map((s, i) => {
            const mid = (s.start + s.end) / 2;
            const rad = (mid - 90) * Math.PI / 180;
            const explode = hoverKey === s.key ? 3 : 0;
            const dx = explode * Math.cos(rad);
            const dy = explode * Math.sin(rad);
            return (
              <path
                key={i}
                d={arcPath(30, 32, 26, s.start, s.end, 16)}
                fill={s.fill}
                stroke="var(--panel-1)"
                strokeWidth="0.2"
                transform={`translate(${dx},${dy})`}
                style={{ transition: "transform 180ms ease, filter 180ms ease", filter: hoverKey === s.key ? "brightness(1.05)" : "none", cursor: "pointer" }}
                onMouseEnter={() => setHoverKey(s.key)}
                onMouseLeave={() => setHoverKey(null)}
              />
            );
          })}
          <text x="30" y="29" textAnchor="middle" fontSize="9" fontWeight="800" fill="var(--text)">{center.pct}%</text>
          <text x="30" y="38" textAnchor="middle" fontSize="5" fill="var(--muted)">{center.label}</text>
        </g>

        <g transform="translate(64,10)" fontSize="6">
          {[
            { key: "Success",    fill: "var(--success)", y: -3 },
            { key: "Reboot",     fill: "var(--warn)",    y: 10 },
            { key: "Error 1603", fill: "var(--info)",    y: 23 },
            { key: "Health",     fill: "var(--danger)",  y: 37 },
          ].map((l) => (
            <g key={l.key}
               transform={`translate(6,${l.y})`}
               onMouseEnter={() => setHoverKey(l.key)}
               onMouseLeave={() => setHoverKey(null)}
               style={{ cursor: "pointer", opacity: hoverKey && hoverKey !== l.key ? 0.7 : 1, transition: "opacity 160ms ease" }}>
              <circle cx="4" cy="4" r="3" fill={l.fill} />
              <text x="12" y="6">{l.key}</text>
            </g>
          ))}
        </g>
      </svg>
    </div>
  );
}

function SuccessModal({ open, rows, loading, error, onClose }) {
  if (!open) return null;
  return (
    <div className="modal show" role="dialog" aria-modal="true">
      <div className="box">
        <h3>Success — Pilot</h3>
        <div className="toolbar-mini">
          <span className="pill green">Success</span>
          <span className="count">Rows: {rows.length}</span>
          <span className="spacer"></span>
          <button className="btn" onClick={onClose}>Close</button>
        </div>

        {loading && <div className="loading">Loading…</div>}
        {error && <div className="sub" style={{ color: "var(--danger)" }}>{error}</div>}

        {!loading && !error && (
          <div className="tableWrap">
            <table>
              <thead>
                <tr>
                  <th style={{ minWidth: 220 }}>Server Name</th>
                  <th style={{ minWidth: 160 }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr><td colSpan={2} className="sub">No success rows.</td></tr>
                ) : (
                  rows.map((r, i) => (
                    <tr key={i}>
                      <td>{r.server || "—"}</td>
                      <td>Success</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function HealthModal({ open, rows, loading, error, onClose }) {
  if (!open) return null;
  return (
    <div className="modal show" role="dialog" aria-modal="true">
      <div className="box">
        <h3>Critical Health — Pilot</h3>
        <div className="toolbar-mini">
          <span className="pill amber">Health</span>
          <span className="count">Rows: {rows.length}</span>
          <span className="spacer"></span>
          <button className="btn" onClick={onClose}>Close</button>
        </div>

        {loading && <div className="loading">Loading…</div>}
        {error && <div className="sub" style={{ color: "var(--danger)" }}>{error}</div>}

        {!loading && !error && (
          <div className="tableWrap chf">
            <table className="tight">
              <thead>
                <tr>
                  <th>Server</th>
                  <th>RAM %</th>
                  <th>CPU %</th>
                  <th>Disk</th>
                  <th>IP</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr><td colSpan={5} className="sub">No rows.</td></tr>
                ) : (
                  rows.map((r, i) => (
                    <tr key={i}>
                      <td>{r.server || "N/A"}</td>
                      <td>{r.ramPct ?? "N/A"}</td>
                      <td>{r.cpuPct ?? "N/A"}</td>
                      <td>{r.disk || "N/A"}</td>
                      <td>{r.ip || "N/A"}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* no horizontal scroll */}
      <style>{`
        .tableWrap.chf { overflow-x: hidden; }
        .tableWrap.chf table.tight { table-layout: fixed; width: 100%; }
        .tableWrap.chf th:nth-child(1), .tableWrap.chf td:nth-child(1) { width: 22%; }
        .tableWrap.chf th:nth-child(2), .tableWrap.chf td:nth-child(2) { width: 10%; }
        .tableWrap.chf th:nth-child(3), .tableWrap.chf td:nth-child(3) { width: 10%; }
        .tableWrap.chf th:nth-child(4), .tableWrap.chf td:nth-child(4) { width: 18%; }
        .tableWrap.chf th:nth-child(5), .tableWrap.chf td:nth-child(5) { width: 40%; }
        .tableWrap.chf td { word-break: break-word; white-space: normal; }
      `}</style>
    </div>
  );
}
