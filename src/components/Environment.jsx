// frontend/src/components/Environment.jsx
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import FancySelect from "./common/FancySelect";
import InlineSpinner from "./common/InlineSpinner";

const EnvironmentContext = createContext(null);
export function useEnvironment() {
  const ctx = useContext(EnvironmentContext);
  if (!ctx)
    throw new Error("useEnvironment must be used inside <EnvironmentProvider>");
  return ctx;
}
// export function EnvironmentProvider({ children }) {
//   const [env, setEnv] = useState({
//     baseline: "",
//     sbxGroup: "",
//     pilotGroup: "",
//     prodGroup: "",
//     autoMail: false,
//     patchWindowDays: 2,
//     patchWindowHours: 0,
//     patchWindowMinutes: 0,
//     enableSandbox: true,
//     enablePilot: true,
//   });
//   return (
//     <EnvironmentContext.Provider value={{ env, setEnv }}>
//       {children}
//     </EnvironmentContext.Provider>
//   );
// }

export function EnvironmentProvider({ children }) {
  const [env, setEnv] = useState({
    // 🚀 REPLACE the old baseline/group strings with these 3 arrays:
    sandboxDeployments: [{ baseline: "", group: "" }],
    pilotDeployments: [{ baseline: "", group: "" }],
    prodDeployments: [{ baseline: "", group: "" }],
    autoMail: false,
    patchWindowDays: 2,
    patchWindowHours: 0,
    patchWindowMinutes: 0,
    enableSandbox: true,
    enablePilot: true,
  });
  return (
    <EnvironmentContext.Provider value={{ env, setEnv }}>
      {children}
    </EnvironmentContext.Provider>
  );
}

const API_BASE = window.env?.VITE_API_BASE || "http://localhost:5174";

function getHeaders() {
  return {
    "Content-Type": "application/json",
    Accept: "application/json",
    "x-user-role": sessionStorage.getItem("user_role") || "Admin",
  };
}

export default function Environment() {
  const { env, setEnv } = useEnvironment();

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

      const groupPromise = fetch(`${API_BASE}/api/groups/list`, {
        headers: getHeaders(),
        signal: controller.signal,
      }).then((r) => r.json());

      const baselinePromise = fetch(`${API_BASE}/api/baselines/list`, {
        headers: getHeaders(),
        signal: controller.signal,
      }).then((r) => r.json());

      const configPromise = fetch(`${API_BASE}/api/config`, {
        headers: getHeaders(),
        signal: controller.signal,
      })
        .then((r) => r.json())
        .catch(() => ({}));

      const [bRes, gRes, cConfig] = await Promise.all([
        baselinePromise,
        groupPromise,
        configPromise,
      ]);

      // const bNames = (bRes.baselines || []).map((b) => b.name).sort();
      // const gNames = (gRes.groups || []).map((g) => g.name).sort();

      // setBaselines(bNames);
      // setGroups(gNames);

      const bNames = (bRes.baselines || []).map((b) => b.name).sort();
      const gNames = (gRes.groups || []).map((g) => g.name).sort();
      
      // 🚀 Keep the full objects so we can read the count
      const groupObjects = (gRes.groups || []).sort((a, b) => a.name.localeCompare(b.name));
      const baselineObjects = (bRes.baselines || []).sort((a, b) => a.name.localeCompare(b.name));

      setBaselines(baselineObjects);
      setGroups(groupObjects);

      setEnv((f) => {
        let defaultBaseline = f.baseline;
        if (!defaultBaseline || !bNames.includes(defaultBaseline)) {
          defaultBaseline = cConfig.lastSandboxBaseline;
        }
        const currentBaselineValid =
          defaultBaseline && bNames.includes(defaultBaseline);

        let defaultGroup = f.sbxGroup;
        if (!defaultGroup || !gNames.includes(defaultGroup)) {
          defaultGroup = cConfig.lastSandboxGroup;
        }
        const currentGroupValid = defaultGroup && gNames.includes(defaultGroup);

        return {
          ...f,
          baseline: currentBaselineValid ? defaultBaseline : "",
          sbxGroup: currentGroupValid ? defaultGroup : "",
        };
      });
    } catch (e) {
      if (e.name !== "AbortError")
        setErr(`Failed to load options: ${e.message}`);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadOptions();
    return () => abortRef.current?.abort();
  }, []);

  const handleNumChange = (k) => (e) => {
    const val = e.target.value;
    if (val === "") setEnv((f) => ({ ...f, [k]: "" }));
    else setEnv((f) => ({ ...f, [k]: Number(val) }));
  };

  const handleBlur =
    (k, min = 0, max = 999) =>
    () => {
      setEnv((f) => {
        let num = Number(f[k]);
        if (!Number.isFinite(num) || f[k] === "") num = min;
        num = Math.min(max, Math.max(min, num));
        return { ...f, [k]: num };
      });
    };

  const selectsDisabled = loading || (!baselines.length && !groups.length);

  // 🚀 Add these Multi-Deployment Handlers
  const handleUpdateDeployment = (index, field, value) => {
    const newDeps = [...(env.sandboxDeployments || [{ baseline: "", group: "" }])];
    newDeps[index][field] = value;
    setEnv((p) => ({ ...p, sandboxDeployments: newDeps }));
  };

  const handleAddDeployment = () => {
    setEnv((p) => ({
      ...p,
      sandboxDeployments: [...(p.sandboxDeployments || []), { baseline: "", group: "" }],
    }));
  };

  const handleRemoveDeployment = (index) => {
    const newDeps = (env.sandboxDeployments || []).filter((_, i) => i !== index);
    setEnv((p) => ({ ...p, sandboxDeployments: newDeps }));
  };

  // return (
  //   <section className="card reveal" id="card-env" data-reveal>
  //     <div className="env-header-row">
  //       <h2>Environment &amp; Baseline</h2>
  //       <button
  //         type="button"
  //         onClick={loadOptions}
  //         disabled={loading}
  //         className="btn outline small"
  //         title="Reload"
  //         style={{ display: "flex", alignItems: "center", gap: "6px" }}
  //       >
  //         {loading ? (
  //           <>
  //             <InlineSpinner size={14} variant="dark" />
  //             <span>Loading...</span>
  //           </>
  //         ) : (
  //           <svg
  //             viewBox="0 0 24 24"
  //             fill="none"
  //             stroke="currentColor"
  //             strokeWidth="2"
  //             width="16"
  //             height="16"
  //           >
  //             <path d="M23 4v6h-6"></path>
  //             <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path>
  //           </svg>
  //         )}
  //       </button>
  //     </div>

  //     {loading && <div className="sub">loading baselines &amp; groups…</div>}
  //     {err && <div className="env-error-msg">{err}</div>}

  //     <div className="env-inputs-row" style={{ opacity: loading ? 0.6 : 1 }}>
  //       <FancySelect
  //         label="Baseline"
  //         options={baselines.map((b) => ({ value: b.name, label: `${b.name} [${b.component_count ?? 0}]` }))} // 🚀 Appended [count]
  //         value={env.baseline}
  //         onChange={(val) => setEnv((f) => ({ ...f, baseline: val }))}
  //         disabled={selectsDisabled || !baselines.length}
  //         placeholder={!baselines.length ? "— loading… —" : "— select baseline —"}
  //         searchable={true}
  //       />

  //       <FancySelect
  //         label="Sandbox Group"
  //         options={groups.map((g) => ({ value: g.name, label: `${g.name} [${g.count ?? 0}]` }))}
  //         value={env.sbxGroup}
  //         onChange={(val) => setEnv((f) => ({ ...f, sbxGroup: val }))}
  //         disabled={selectsDisabled || !groups.length}
  //         placeholder={!groups.length ? "— loading… —" : "— select group —"}
  //         searchable={true}
  //       />

  //       <div className="field">
  //         <span className="label">Patch Window (Days / Hours / Mins)</span>
  //         <div className="env-patch-window-inputs">
  //           <input
  //             type="number"
  //             className="control env-patch-input"
  //             title="Days"
  //             min="0"
  //             value={env.patchWindowDays ?? 0}
  //             onChange={handleNumChange("patchWindowDays")}
  //             onBlur={handleBlur("patchWindowDays", 0, 999)}
  //             disabled={loading}
  //           />

  //           <input
  //             type="number"
  //             className="control env-patch-input"
  //             title="Hours"
  //             min="0"
  //             max="23"
  //             value={env.patchWindowHours ?? 0}
  //             onChange={handleNumChange("patchWindowHours")}
  //             onBlur={handleBlur("patchWindowHours", 0, 23)}
  //             disabled={loading}
  //           />
  //           <input
  //             type="number"
  //             className="control env-patch-input"
  //             title="Minutes"
  //             min="0"
  //             max="59"
  //             value={env.patchWindowMinutes ?? 0}
  //             onChange={handleNumChange("patchWindowMinutes")}
  //             onBlur={handleBlur("patchWindowMinutes", 0, 59)}
  //             disabled={loading}
  //           />
  //         </div>
  //       </div>
  //     </div>
  //   </section>
  // );

  return (
    <section className="card reveal" id="card-env" data-reveal>
      <div className="env-header-row">
        <h2>Environment &amp; Baseline</h2>
        <button
          type="button"
          onClick={loadOptions}
          disabled={loading}
          className="btn outline small"
          title="Reload"
          style={{ display: "flex", alignItems: "center", gap: "6px" }}
        >
          {loading ? (
            <>
              <InlineSpinner size={14} variant="dark" />
              <span>Loading...</span>
            </>
          ) : (
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
          )}
        </button>
      </div>

      {loading && <div className="sub">loading baselines &amp; groups…</div>}
      {err && <div className="env-error-msg">{err}</div>}

      <div className="env-inputs-row" style={{ opacity: loading ? 0.6 : 1 }}>
        
        {/* 🚀 MULTI-DEPLOYMENT UI STARTS HERE */}
        <div style={{ display: "flex", flexDirection: "column", gap: "12px", gridColumn: "1 / -1", width: "100%" }}>
          <span className="label" style={{ fontSize: "13px", fontWeight: 600, color: "var(--text)" }}>Deployments (Baseline ➔ Sandbox Group)</span>
          
          {(env.sandboxDeployments || [{ baseline: "", group: "" }]).map((dep, i) => (
            <div key={i} style={{ display: "flex", gap: "12px", alignItems: "center" }}>
              <div style={{ flex: 1 }}>
                <FancySelect
                  options={baselines.map((b) => ({ value: b.name, label: `${b.name} [${b.component_count ?? 0}]` }))}
                  value={dep.baseline}
                  onChange={(val) => handleUpdateDeployment(i, "baseline", val)}
                  disabled={selectsDisabled || !baselines.length}
                  placeholder={!baselines.length ? "— loading… —" : "— select baseline —"}
                  searchable={true}
                />
              </div>
              <span style={{ color: "var(--muted)", fontWeight: "bold" }}>➔</span>
              <div style={{ flex: 1 }}>
                <FancySelect
                  options={groups.map((g) => ({ value: g.name, label: `${g.name} [${g.count ?? 0}]` }))}
                  value={dep.group}
                  onChange={(val) => handleUpdateDeployment(i, "group", val)}
                  disabled={selectsDisabled || !groups.length}
                  placeholder={!groups.length ? "— loading… —" : "— select group —"}
                  searchable={true}
                />
              </div>
              {(env.sandboxDeployments || []).length > 1 && (
                <button
                  className="btn outline small"
                  onClick={() => handleRemoveDeployment(i)}
                  title="Remove Deployment"
                  style={{ height: "36px", padding: "0 12px" }}
                >
                  ✕
                </button>
              )}
            </div>
          ))}
          
          <div>
            <button className="btn outline small mt-4" onClick={handleAddDeployment}>
              + Add Deployment
            </button>
          </div>
        </div>
        {/* 🚀 MULTI-DEPLOYMENT UI ENDS HERE */}

        <div className="field mt-20" style={{ gridColumn: "1 / -1" }}>
          <span className="label">Patch Window (Days / Hours / Mins)</span>
          <div className="env-patch-window-inputs">
            <input
              type="number"
              className="control env-patch-input"
              title="Days"
              min="0"
              value={env.patchWindowDays ?? 0}
              onChange={handleNumChange("patchWindowDays")}
              onBlur={handleBlur("patchWindowDays", 0, 999)}
              disabled={loading}
            />

            <input
              type="number"
              className="control env-patch-input"
              title="Hours"
              min="0"
              max="23"
              value={env.patchWindowHours ?? 0}
              onChange={handleNumChange("patchWindowHours")}
              onBlur={handleBlur("patchWindowHours", 0, 23)}
              disabled={loading}
            />
            <input
              type="number"
              className="control env-patch-input"
              title="Minutes"
              min="0"
              max="59"
              value={env.patchWindowMinutes ?? 0}
              onChange={handleNumChange("patchWindowMinutes")}
              onBlur={handleBlur("patchWindowMinutes", 0, 59)}
              disabled={loading}
            />
          </div>
        </div>
      </div>
    </section>
  );
}
