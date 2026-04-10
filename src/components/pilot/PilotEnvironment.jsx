// src/components/pilot/PilotEnvironment.jsx
import { useEffect, useRef, useState } from "react";
import { useEnvironment } from "../Environment.jsx";
import FancySelect from "../common/FancySelect";
import InlineSpinner from "../common/InlineSpinner";

const API_BASE = window.env.VITE_API_BASE;

function getHeaders() {
  return {
    "Content-Type": "application/json",
    Accept: "application/json",
    "x-user-role": sessionStorage.getItem("user_role") || "Admin",
  };
}

export default function PilotEnvironment({ mode = "pilot", lastActions = {} }) {
  const { env, setEnv } = useEnvironment();
  const inProduction = String(mode).toLowerCase() === "production";
  const depKey = inProduction ? "prodDeployments" : "pilotDeployments";

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [baselines, setBaselines] = useState([]);
  const [groups, setGroups] = useState([]);
  const abortRef = useRef(null);

  async function loadOptions() {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      setLoading(true);
      setErr("");

      const groupPromise = fetch(`${API_BASE}/api/groups/list`, { headers: getHeaders(), signal: controller.signal }).then((r) => r.json());
      const baselinePromise = fetch(`${API_BASE}/api/baselines/list`, { headers: getHeaders(), signal: controller.signal }).then((r) => r.json());
      const configPromise = fetch(`${API_BASE}/api/config`, { headers: getHeaders(), signal: controller.signal }).then(async (r) => { if (!r.ok) return {}; try { return await r.json(); } catch { return {}; } }).catch(() => ({}));

      const [bRes, gRes, cConfig] = await Promise.all([baselinePromise, groupPromise, configPromise]);

      const groupObjects = (gRes.groups || []).sort((a, b) => a.name.localeCompare(b.name));
      const baselineObjects = (bRes.baselines || []).sort((a, b) => a.name.localeCompare(b.name));

      setBaselines(baselineObjects);
      setGroups(groupObjects);

      setEnv((f) => {
        const st = cConfig.successThreshold != null ? Number(cConfig.successThreshold) : (f.successThreshold ?? 90);
        const hf = cConfig.allowableCriticalHF != null ? Number(cConfig.allowableCriticalHF) : (f.allowableCriticalHF ?? 0);

        let currentDeps = f[depKey] || [];
        const isCurrentEmpty = currentDeps.length === 0 || (currentDeps.length === 1 && !currentDeps[0].baseline && !currentDeps[0].group);

        if (isCurrentEmpty) {
            const prevKey = inProduction ? "pilotDeployments" : "sandboxDeployments";
            const prevDeps = f[prevKey] || [];
            const validPrev = prevDeps.filter(d => d.baseline || d.group);
            
            const prevActions = inProduction ? (lastActions?.PILOT?.actions || lastActions?.SANDBOX?.actions) : lastActions?.SANDBOX?.actions;

            if (validPrev.length > 0) {
                currentDeps = validPrev.map(d => ({ ...d }));
            } else if (prevActions && prevActions.length > 0) {
                currentDeps = prevActions.map(a => ({ baseline: a.baseline, group: a.group }));
            } else {
                currentDeps = [{ baseline: "", group: "" }];
            }
        }
        
        if (currentDeps.length === 0) currentDeps = [{ baseline: "", group: "" }];

        return {
          ...f,
          [depKey]: currentDeps, 
          successThreshold: st,
          allowableCriticalHF: hf,
          snapshotVM: cConfig.snapshotVM ?? f.snapshotVM,
          cloneVM: cConfig.cloneVM ?? f.cloneVM,
          enablePilot: cConfig.enablePilot ?? f.enablePilot,
          enableSandbox: cConfig.enableSandbox ?? f.enableSandbox,
          patchWindowDays: f.patchWindowDays ?? 2,
          patchWindowHours: f.patchWindowHours ?? 0,
          patchWindowMinutes: f.patchWindowMinutes ?? 0,
        };
      });
      
    } catch (e) {
      if (e.name !== "AbortError") setErr(`Failed to load options: ${e.message}`);
    } finally {
      setLoading(false);
    }
  }

  //  FIXED: Added lastActions to dependency array so it correctly runs on browser refresh!
  useEffect(() => {
    loadOptions();
    return () => abortRef.current?.abort();
  }, [mode, lastActions]);

  const handleNumChange = (k) => (e) => {
    const val = e.target.value;
    if (val === "") setEnv((f) => ({ ...f, [k]: "" }));
    else setEnv((f) => ({ ...f, [k]: Number(val) }));
  };

  const handleBlur = (k, min = 0, max = 999) => () => {
      setEnv((f) => {
        let num = Number(f[k]);
        if (!Number.isFinite(num) || f[k] === "") num = min;
        num = Math.min(max, Math.max(min, num));
        return { ...f, [k]: num };
      });
  };

  const disabled = loading || (!baselines.length && !groups.length);
  const inputsLocked = !env[`${mode}Unlocked`];
  const userRole = sessionStorage.getItem("user_role") || "Admin";
  const isEUC = userRole === "EUC";

  const handleUpdateDeployment = (index, field, value) => {
    if (inputsLocked) return;
    const newDeps = [...(env[depKey] || [{ baseline: "", group: "" }])];
    newDeps[index][field] = value;
    setEnv((p) => ({ ...p, [depKey]: newDeps }));
  };

  const handleAddDeployment = () => {
    if (inputsLocked) return;
    setEnv((p) => ({ ...p, [depKey]: [...(p[depKey] || []), { baseline: "", group: "" }] }));
  };

  const handleRemoveDeployment = (index) => {
    if (inputsLocked) return;
    const newDeps = (env[depKey] || []).filter((_, i) => i !== index);
    setEnv((p) => ({ ...p, [depKey]: newDeps }));
  };

  return (
    <section className="card reveal mb-0" id="card-env" data-reveal>
      <div className="env-header-row">
        <h2>Environment &amp; Baseline</h2>
        <button type="button" onClick={loadOptions} disabled={loading} className="btn outline small" title="Reload" style={{ display: "flex", alignItems: "center", gap: "6px" }}>
          {loading ? <><InlineSpinner size={14} variant="dark" /><span>Loading...</span></> : <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16"><path d="M23 4v6h-6"></path><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path></svg>}
        </button>
      </div>

      {loading && <div className="sub">loading baselines &amp; groups…</div>}
      {err && <div className="env-error-msg">{err}</div>}

      <div className={`env-inputs-row ${loading ? "opacity-60" : ""}`} style={{ display: "flex", flexDirection: "column", gap: "16px", paddingBottom: "16px", borderBottom: "1px solid var(--border)" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: "12px", width: "100%" }}>
            <span className="label" style={{ fontSize: "13px", fontWeight: 600, color: "var(--text)" }}>Deployments (Baseline ➔ {inProduction ? "Production" : "Pilot"} Group)</span>
            
            {(env[depKey] || [{ baseline: "", group: "" }]).map((dep, i) => (
              <div key={i} style={{ display: "flex", gap: "12px", alignItems: "center", width: "100%" }}>
                <div style={{ flex: 1 }}>
                  <FancySelect options={baselines.map((b) => ({ value: b.name, label: `${b.name} [${b.component_count ?? 0}]` }))} value={dep.baseline} onChange={(val) => handleUpdateDeployment(i, "baseline", val)} disabled={disabled || !baselines.length || inputsLocked} placeholder={!baselines.length ? "— loading… —" : "— select baseline —"} searchable={true} />
                </div>
                <span style={{ color: "var(--muted)", fontWeight: "bold" }}>➔</span>
                <div style={{ flex: 1 }}>
                  <FancySelect options={groups.map((g) => ({ value: g.name, label: `${g.name} [${g.count ?? 0}]` }))} value={dep.group} onChange={(val) => handleUpdateDeployment(i, "group", val)} disabled={disabled || !groups.length || inputsLocked} placeholder={!groups.length ? "— loading… —" : "— select group —"} searchable={true} />
                </div>
                {!inputsLocked && (env[depKey] || []).length > 1 && (
                  <button className="btn outline small" onClick={() => handleRemoveDeployment(i)} title="Remove Deployment" style={{ height: "36px", padding: "0 12px" }}>✕</button>
                )}
              </div>
            ))}
            
            {!inputsLocked && (
              <div>
                <button className="btn outline small mt-4" onClick={handleAddDeployment}>+ Add Deployment</button>
              </div>
            )}
        </div>
      </div>

      {!isEUC && (
        <div className="row mt-14" style={{ display: 'flex', flexWrap: 'wrap', gap: '20px' }}>
          <div className="field">
            <div className="label">Success Threshold (%) <span title="Configured by Admin in Environment Settings" style={{ cursor: "help", opacity: 0.6 }}>🔒</span></div>
            <input type="number" className="control disabled" value={env.successThreshold ?? 90} disabled={true} />
          </div>
          <div className="field">
            <div className="label">Allowable Critical Health Failures <span title="Configured by Admin in Environment Settings" style={{ cursor: "help", opacity: 0.6 }}>🔒</span></div>
            <input type="number" className="control disabled" value={env.allowableCriticalHF ?? 0} disabled={true} />
          </div>
          <div className="field flex-15">
            <span className="label">Patch Window (Days / Hours / Mins)</span>
            <div className="env-patch-window-inputs">
              <input type="number" className={`control env-patch-input ${inputsLocked ? "disabled" : ""}`} title="Days" min={0} value={env.patchWindowDays ?? 0} onChange={handleNumChange("patchWindowDays")} onBlur={handleBlur("patchWindowDays", 0, 999)} disabled={inputsLocked} />
              <input type="number" className={`control env-patch-input ${inputsLocked ? "disabled" : ""}`} title="Hours" min={0} max={23} value={env.patchWindowHours ?? 0} onChange={handleNumChange("patchWindowHours")} onBlur={handleBlur("patchWindowHours", 0, 23)} disabled={inputsLocked} />
              <input type="number" className={`control env-patch-input ${inputsLocked ? "disabled" : ""}`} title="Minutes" min={0} max={59} value={env.patchWindowMinutes ?? 0} onChange={handleNumChange("patchWindowMinutes")} onBlur={handleBlur("patchWindowMinutes", 0, 59)} disabled={inputsLocked} />
            </div>
          </div>
        </div>
      )}
    </section>
  );
}