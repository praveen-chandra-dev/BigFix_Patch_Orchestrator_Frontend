import { useEffect, useMemo, useRef, useState } from "react";

const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:5174";

async function getJson(url, signal) {
  const r = await fetch(url, { headers: { Accept: "application/json" }, cache: "no-store", signal });
  const t = await r.text();
  if (!r.ok) throw new Error(`HTTP ${r.status}: ${t.slice(0, 400)}`);
  try { return JSON.parse(t); } catch { throw new Error(`Unexpected: ${t.slice(0, 400)}`); }
}

const fmtTime = (s) => {
  if (!s || s === "N/A") return "—";
  const m = s.match(/\b(\d{2}:\d{2}:\d{2})\b/);
  return m ? m[1] : s;
};

export default function PilotSandboxResult({
  /** Title shown at the top of the card. Default stays as-is for Pilot. */
  title = "Sandbox Result",
  /** Title for the modal header. By default it mirrors `title`. */
  detailTitle,
}) {
  const [lastId, setLastId] = useState(null);
  const [summary, setSummary] = useState({ success: 0, total: 0 });
  const [loadingSummary, setLoadingSummary] = useState(true);
  const [err, setErr] = useState("");

  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState([]);
  const [loadingRows, setLoadingRows] = useState(false);
  const [detailErr, setDetailErr] = useState("");

  const abortRef = useRef(null);

  // Initial load (kept)
  useEffect(() => {
    const controller = new AbortController();
    abortRef.current = controller;

    (async () => {
      try {
        setLoadingSummary(true);
        const last = await getJson(`${API_BASE}/api/actions/last`, controller.signal);
        const id = last?.actionId || null;
        setLastId(id);
        if (!id) return;
        const res = await getJson(`${API_BASE}/api/actions/${id}/results`, controller.signal);
        setSummary({ success: res?.success || 0, total: res?.total || 0 });
      } catch (e) {
        if (e.name !== "AbortError") setErr(e.message);
      } finally {
        setLoadingSummary(false);
      }
    })();

    return () => controller.abort();
  }, []);

  // Listen for Refresh KPIs broadcasts to update the UI live
  useEffect(() => {
    function onSandbox(e) {
      const { actionId, total, success, rows: newRows } = e.detail || {};
      if (actionId != null) setLastId(actionId);
      setSummary({ success: Number(success || 0), total: Number(total || 0) });
      if (open && Array.isArray(newRows)) setRows(newRows); // keep modal in sync
    }
    window.addEventListener("pilot:sandboxResultsUpdated", onSandbox);

    // Hydrate from cache if user clicked refresh before this mounted
    if (window.__pilotCache?.sandboxResults) {
      onSandbox({ detail: window.__pilotCache.sandboxResults });
    }

    return () => window.removeEventListener("pilot:sandboxResultsUpdated", onSandbox);
  }, [open]);

  async function openDetails() {
    // Prefer cached rows from Refresh KPIs; fall back to fetching
    const cached = window.__pilotCache?.sandboxResults;
    if (cached && Array.isArray(cached.rows)) {
      setRows(cached.rows);
      setOpen(true);
      return;
    }
    if (!lastId) return;
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      setLoadingRows(true);
      setDetailErr("");
      const res = await getJson(`${API_BASE}/api/actions/${lastId}/results`, controller.signal);
      setRows(Array.isArray(res?.rows) ? res.rows : []);
      setOpen(true);
    } catch (e) {
      if (e.name !== "AbortError") setDetailErr(e.message);
    } finally {
      setLoadingRows(false);
    }
  }

  const pct = useMemo(() => {
    const { success, total } = summary;
    return total > 0 ? Math.round((success / total) * 100) : 0;
  }, [summary]);

  return (
    <section className="card reveal" data-reveal>
      <h2>{title}</h2>

      {loadingSummary ? (
        <div className="sub">Loading...</div>
      ) : err ? (
        <div className="sub" style={{ color: "var(--danger)" }}>{err}</div>
      ) : !lastId ? (
        <div className="sub">No Sandbox run found. Trigger Sandbox to generate results.</div>
      ) : (
        <div className="toolbar-mini">
          <span className="pill">{`Success: ${summary.success}/${summary.total} (${pct}%)`}</span>
          <span className="count">{`Action ID: ${lastId}`}</span>
          <span className="spacer"></span>
          <a className="link" onClick={openDetails}>View details</a>
        </div>
      )}

      {/* Modal */}
      {open && (
        <div className="modal show" role="dialog" aria-modal="true">
          <div className="box">
            <h3>{detailTitle || `${title} Details`}</h3>
            <div className="toolbar-mini">
              <span className="pill green">{`Success: ${summary.success}/${summary.total} (${pct}%)`}</span>
              <span className="count">Rows: {rows.length}</span>
              <span className="spacer"></span>
              <button className="btn" onClick={() => setOpen(false)}>Close</button>
            </div>

            {loadingRows && <div className="loading">Loading...</div>}
            {detailErr && <div className="sub" style={{ color: "var(--danger)" }}>{detailErr}</div>}

            {!loadingRows && !detailErr && (
              <div className="tableWrap">
                <table>
                  <thead>
                    <tr>
                      <th>Server Name</th>
                      <th>Patch Name</th>
                      <th>Start Time</th>
                      <th>End Time</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.length === 0 ? (
                      <tr><td colSpan={5} className="sub">No rows returned.</td></tr>
                    ) : (
                      rows.map((r, i) => (
                        <tr key={i}>
                          <td>{r.server || "—"}</td>
                          <td>{r.patch || "—"}</td>
                          <td>{fmtTime(r.start)}</td>
                          <td>{fmtTime(r.end)}</td>
                          <td>
                            <span className={`rowchip ${/success/i.test(r.status) ? "succ" :
                              /fail|error/i.test(r.status) ? "hf" : ""}`}>
                              {r.status || "—"}
                            </span>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
