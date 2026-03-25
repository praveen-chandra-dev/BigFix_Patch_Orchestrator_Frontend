// src/components/pilot/PilotEnvironment.jsx
import { useEffect, useMemo, useRef, useState } from "react";
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

export default function PilotEnvironment({ mode = "pilot" }) {
  const { env, setEnv } = useEnvironment();
  const inProduction = String(mode).toLowerCase() === "production";

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
        .then(async (r) => {
          if (!r.ok) return {};
          try {
            return await r.json();
          } catch {
            return {};
          }
        })
        .catch(() => ({}));

      const [bRes, gRes, cConfig] = await Promise.all([
        baselinePromise,
        groupPromise,
        configPromise,
      ]);

      const bNames = (bRes.baselines || []).map((b) => b.name).sort();
      const gNames = (gRes.groups || []).map((g) => g.name).sort();

      setBaselines(bNames);
      setGroups(gNames);

      setEnv((f) => {
        let safeBaseline = f.baseline;
        if (!safeBaseline || !bNames.includes(safeBaseline)) {
          safeBaseline = inProduction
            ? cConfig.lastPilotBaseline || cConfig.lastSandboxBaseline
            : cConfig.lastSandboxBaseline;
        }
        const finalBaseline =
          safeBaseline && bNames.includes(safeBaseline) ? safeBaseline : "";

        let currentGroupField = inProduction ? f.prodGroup : f.pilotGroup;
        let safeGroup = currentGroupField;

        if (!safeGroup || !gNames.includes(safeGroup)) {
          if (!inProduction) {
            safeGroup =
              f.sbxGroup && gNames.includes(f.sbxGroup)
                ? f.sbxGroup
                : cConfig.lastSandboxGroup;
          } else {
            safeGroup =
              f.pilotGroup && gNames.includes(f.pilotGroup)
                ? f.pilotGroup
                : f.sbxGroup && gNames.includes(f.sbxGroup)
                  ? f.sbxGroup
                  : cConfig.lastPilotGroup || cConfig.lastSandboxGroup;
          }
        }
        const finalGroup =
          safeGroup && gNames.includes(safeGroup) ? safeGroup : "";

        const st =
          cConfig.successThreshold != null
            ? Number(cConfig.successThreshold)
            : (f.successThreshold ?? 90);
        const hf =
          cConfig.allowableCriticalHF != null
            ? Number(cConfig.allowableCriticalHF)
            : (f.allowableCriticalHF ?? 0);

        return {
          ...f,
          baseline: finalBaseline,
          [inProduction ? "prodGroup" : "pilotGroup"]: finalGroup,

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
      if (e.name !== "AbortError")
        setErr(`Failed to load options: ${e.message}`);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadOptions();
    return () => abortRef.current?.abort();
  }, [mode]);

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

  const disabled = loading || (!baselines.length && !groups.length);
  const inputsLocked = !env[`${mode}Unlocked`];
  const userRole = sessionStorage.getItem("user_role") || "Admin";
  const isEUC = userRole === "EUC";

  return (
    <section className="card reveal mb-0" id="card-env" data-reveal>
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

      <div className={`env-inputs-row ${loading ? "opacity-60" : ""}`}>
        <FancySelect
          label="Baseline"
          options={baselines.map((b) => ({ value: b, label: b }))}
          value={env.baseline}
          onChange={(val) => setEnv((f) => ({ ...f, baseline: val }))}
          disabled={disabled || !baselines.length || inputsLocked}
          placeholder={
            !baselines.length ? "— loading… —" : "— select baseline —"
          }
          searchable={true}
        />

        <FancySelect
          label={inProduction ? "Production Group" : "Pilot Group"}
          options={groups.map((g) => ({ value: g, label: g }))}
          value={inProduction ? env.prodGroup : env.pilotGroup}
          onChange={(val) =>
            setEnv((f) => ({
              ...f,
              [inProduction ? "prodGroup" : "pilotGroup"]: val,
            }))
          }
          disabled={
            disabled ||
            !groups.length ||
            (!env[`${mode}Evaluated`] && inputsLocked)
          }
          placeholder={!groups.length ? "— loading… —" : "— select group —"}
          searchable={true}
        />
      </div>

      {!isEUC && (
        <div className="row mt-14">
          <div className="field">
            <div className="label">
              Success Threshold (%){" "}
              <span
                title="Configured by Admin in Environment Settings"
                style={{ cursor: "help", opacity: 0.6 }}
              >
                🔒
              </span>
            </div>
            <input
              type="number"
              className="control disabled"
              value={env.successThreshold ?? 90}
              disabled={true}
            />
          </div>
          <div className="field">
            <div className="label">
              Allowable Critical Health Failures{" "}
              <span
                title="Configured by Admin in Environment Settings"
                style={{ cursor: "help", opacity: 0.6 }}
              >
                🔒
              </span>
            </div>
            <input
              type="number"
              className="control disabled"
              value={env.allowableCriticalHF ?? 0}
              disabled={true}
            />
          </div>
          <div className="field flex-15">
            <span className="label">Patch Window (Days / Hours / Mins)</span>
            <div className="env-patch-window-inputs">
              <input
                type="number"
                className={`control env-patch-input ${inputsLocked ? "disabled" : ""}`}
                title="Days"
                min={0}
                value={env.patchWindowDays ?? 0}
                onChange={handleNumChange("patchWindowDays")}
                onBlur={handleBlur("patchWindowDays", 0, 999)}
                disabled={inputsLocked}
              />
              <input
                type="number"
                className={`control env-patch-input ${inputsLocked ? "disabled" : ""}`}
                title="Hours"
                min={0}
                max={23}
                value={env.patchWindowHours ?? 0}
                onChange={handleNumChange("patchWindowHours")}
                onBlur={handleBlur("patchWindowHours", 0, 23)}
                disabled={inputsLocked}
              />
              <input
                type="number"
                className={`control env-patch-input ${inputsLocked ? "disabled" : ""}`}
                title="Minutes"
                min={0}
                max={59}
                value={env.patchWindowMinutes ?? 0}
                onChange={handleNumChange("patchWindowMinutes")}
                onBlur={handleBlur("patchWindowMinutes", 0, 59)}
                disabled={inputsLocked}
              />
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
