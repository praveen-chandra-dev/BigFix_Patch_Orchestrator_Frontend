// src/components/pilot/PilotDecisionEngine.jsx
import { useEffect, useMemo, useState, useCallback, useRef } from "react";
import PropTypes from "prop-types";
import { useEnvironment } from "../Environment.jsx";
import ValidationGate from "../ValidationGate";
import InlineSpinner from "../common/InlineSpinner";

/* ---------------- API helpers ---------------- */
const API_BASE = globalThis.env?.VITE_API_BASE || "";

function getHeaders() {
  return {
    "Content-Type": "application/json",
    Accept: "application/json",
    "x-user-role": sessionStorage.getItem("user_role") || "Admin",
  };
}

async function getJSON(url, signal) {
  const headers = getHeaders();
  delete headers["Content-Type"];
  const r = await fetch(url, { headers, cache: "no-store", signal });
  const t = await r.text();
  if (!r.ok) throw new Error(`HTTP ${r.status}: ${t.slice(0, 400)}`);
  return JSON.parse(t);
}

async function postJSON(url, body) {
  const r = await fetch(url, {
    method: "POST",
    headers: getHeaders(),
    body: JSON.stringify(body),
  });
  const t = await r.text();
  let j;
  try {
    j = JSON.parse(t);
  } catch (e) {
    console.warn(e);
    throw new Error(`Unexpected response: ${t.slice(0, 400)}`);
  }
  if (!r.ok || j?.ok === false) {
    throw new Error(j?.error || j?.message || `HTTP ${r.status}`);
  }
  return j;
}

async function getActionResults(id, signal) {
  if (!id) return { actionId: null, total: 0, success: 0, rows: [] };
  const j = await getJSON(`${API_BASE}/api/actions/${id}/results`, signal);
  return { actionId: id, ...j };
}

async function getCriticalHealth(scopeGroup, signal) {
  const groupQuery = scopeGroup
    ? `?group=${encodeURIComponent(scopeGroup)}`
    : "";
  return getJSON(`${API_BASE}/api/health/critical${groupQuery}`, signal);
}

async function getActionMailStatus(id, signal) {
  if (!id || id === "null" || id === "undefined") {
    return { state: "N/A", mailSent: true };
  }
  try {
    const j = await getJSON(`${API_BASE}/api/actions/${id}/status`, signal);
    return { state: j?.state, mailSent: j?.mailSent === true };
  } catch (e) {
    if (e.message.includes("404")) return { state: "expired", mailSent: true };
    return { state: "error", mailSent: false };
  }
}

const num = (v, d = 0) => (Number.isFinite(Number(v)) ? Number(v) : d);
const isSuccess = (s) =>
  /success|fixed|completed|succeeded|complete/i.test(String(s || ""));

// Extracted async polling logic
async function checkAllActionsDone(actionsInfo) {
  let allDone = true;
  for (const act of actionsInfo) {
    const { state } = await getActionMailStatus(act.actionId);
    const st = String(state).toLowerCase();
    if (st !== "expired" && st !== "stopped") {
      allDone = false;
      break;
    }
  }
  return allDone;
}

async function checkPrevActionsDone(actionsInfo) {
  let allDone = true;
  for (const act of actionsInfo) {
    const { mailSent, state } = await getActionMailStatus(act.actionId);
    const st = String(state).toLowerCase();
    if (mailSent === false && st !== "expired" && st !== "stopped") {
      allDone = false;
      break;
    }
  }
  return allDone;
}

const fetchKpisForActions = async (actionsInfo, signal) => {
  let globalSuccess = 0;
  let globalTotal = 0;
  const uniqueGroups = new Set();

  await Promise.all(
    actionsInfo.map(async (act) => {
      if (act.group) uniqueGroups.add(act.group);
      const results = await getActionResults(act.actionId, signal).catch(
        () => null,
      );
      const rows = Array.isArray(results?.rows) ? results.rows : [];
      const map = new Map();
      for (const r of rows) {
        if (r.server && !map.has(r.server)) map.set(r.server, r);
      }
      const uRows = Array.from(map.values());
      const successCount =
        uRows.length > 0
          ? uRows.filter((r) => isSuccess(r.status)).length
          : Number(results?.success || 0);
      const totalCount =
        uRows.length > 0 ? uRows.length : Number(results?.total || 0);
      globalSuccess += successCount;
      globalTotal += totalCount;
    }),
  );

  return { globalSuccess, globalTotal, uniqueGroups };
};

const fetchHealthAndComps = async (groupsSet, signal) => {
  const allCriticalRows = [];

  await Promise.all(
    Array.from(groupsSet).map(async (g) => {
      const ch = await getCriticalHealth(g, signal).catch(() => null);
      if (Array.isArray(ch?.rows)) allCriticalRows.push(...ch.rows);
    }),
  );

  const uniqueHealthMap = new Map();
  allCriticalRows.forEach((r) => {
    if (r.server && !uniqueHealthMap.has(r.server))
      uniqueHealthMap.set(r.server, r);
  });

  return uniqueHealthMap.size;
};

// Extracted decision evaluators
const syncApprovalState = (
  approved,
  requireChg,
  savedChg,
  isGateSatisfied,
  isPrevStageComplete,
  mode,
  setEnv,
  setEvaluated,
  setEnableEvaluate,
  setChgValidated,
  setChgNumber,
  setEnableTriggerPilot,
  setDecision,
) => {
  setEnableEvaluate(isGateSatisfied && isPrevStageComplete);

  if (approved) {
    setEvaluated(true);
    setEnv((p) => {
      if (p[`${mode}Evaluated`] === true && p[`${mode}Unlocked`] === true)
        return p;
      return { ...p, [`${mode}Evaluated`]: true, [`${mode}Unlocked`]: true };
    });
    if (requireChg) {
      if (savedChg) {
        setChgValidated(true);
        setChgNumber(savedChg);
        setEnableTriggerPilot(true);
        setDecision(`CHG validated. Configuration Unlocked.`);
      } else {
        setEnableTriggerPilot(false);
        setDecision("PASS: Thresholds met. Validate CHG.");
      }
    } else {
      setEnableTriggerPilot(true);
      setDecision("PASS: Thresholds met. Configuration Unlocked.");
    }
  } else {
    setEnableTriggerPilot(false);
    setEvaluated(false);
    setDecision("Evaluate to see gate status…");
    setChgValidated(false);
    setEnv((p) => {
      if (p[`${mode}Evaluated`] === false && p[`${mode}Unlocked`] === false)
        return p;
      return { ...p, [`${mode}Evaluated`]: false, [`${mode}Unlocked`]: false };
    });
  }
};

const processKpiEvaluation = (
  mode,
  sandbox,
  counts,
  env,
  trackingId,
  requireChg,
  chgNumber,
  setEnv,
  setDecision,
  setShowChg,
  setChgErr,
  setChgNumber,
  setEnableTriggerPilot,
  setEvaluated,
) => {
  let threshold = num(env?.successThreshold, 90);
  let allowableCHF = num(env?.allowableCriticalHF, 0);
  const successPct =
    sandbox.total > 0 ? Math.round((sandbox.success / sandbox.total) * 100) : 0;

  const okSuccess = successPct >= threshold;
  const okHealth = (counts.critical || 0) <= allowableCHF;
  setEvaluated(true);

  if (okSuccess && okHealth) {
    setEnv((p) => {
      if (p[`${mode}Evaluated`] === true && p[`${mode}Unlocked`] === true)
        return p;
      return { ...p, [`${mode}Evaluated`]: true, [`${mode}Unlocked`]: true };
    });
    if (trackingId)
      sessionStorage.setItem(`approved_${mode}_${trackingId}`, "true");

    if (requireChg) {
      setDecision("PASS: Thresholds met. Validate CHG.");
      setShowChg(true);
      setChgErr("");
      if (!chgNumber) setChgNumber("CHG");
      setEnableTriggerPilot(false);
    } else {
      setDecision("PASS: Thresholds met. Configuration Unlocked.");
      setEnableTriggerPilot(true);
    }
  } else {
    setEnv((p) => {
      if (p[`${mode}Evaluated`] === false && p[`${mode}Unlocked`] === false)
        return p;
      return { ...p, [`${mode}Evaluated`]: false, [`${mode}Unlocked`]: false };
    });
    if (trackingId) sessionStorage.removeItem(`approved_${mode}_${trackingId}`);
    setDecision(
      `FAIL: Thresholds not met (Success: ${successPct}%, Critical Fails: ${counts.critical}).`,
    );
    setEnableTriggerPilot(false);
  }
};

function ConfirmationModal({
  open,
  title,
  children,
  onClose,
  onConfirm,
  busy = false,
}) {
  if (!open) return null;
  return (
    <div
      className="modal show"
      role="presentation"
      onMouseDown={onClose}
      tabIndex={-1}
    >
      <div
        className="box max-w-520"
        onMouseDown={(e) => e.stopPropagation()}
        role="presentation"
      >
        <h3 className="kpi-modal-title">{title || "Confirm Action"}</h3>
        <div className="sub kpi-confirm-sub">{children}</div>
        <div className="flex-row justify-end gap-8 mt-10">
          <button
            type="button"
            className="btn"
            onClick={onClose}
            disabled={busy}
          >
            Cancel
          </button>
          <button
            type="button"
            className="btn pri"
            onClick={onConfirm}
            disabled={busy}
          >
            {busy ? "Processing..." : "Confirm"}
          </button>
        </div>
      </div>
    </div>
  );
}

ConfirmationModal.propTypes = {
  open: PropTypes.bool,
  title: PropTypes.string,
  children: PropTypes.node,
  onClose: PropTypes.func,
  onConfirm: PropTypes.func,
  busy: PropTypes.bool,
};

export default function PilotDecisionEngine({
  sbxDone = false,
  pilotDone = false,
  mode = "pilot",
  readOnly = false,
  autoMail = false,
  lastActions = {},
  username,
  onOpenSnapshot,
  onOpenClone,
  onFinish,
  onResetStage,
  stageFinished = false,
}) {
  const { env, setEnv } = useEnvironment();
  const inProduction = String(mode).toLowerCase() === "production";

  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const isRefreshing = useRef(false);
  const hasAutoRefreshed = useRef(false);

  const [enableEvaluate, setEnableEvaluate] = useState(false);
  const [enableTriggerPilot, setEnableTriggerPilot] = useState(false);
  const [evaluated, setEvaluated] = useState(false);
  const [decision, setDecision] = useState("Evaluate to see gate status…");

  const [snapshotDone, setSnapshotDone] = useState(false);
  const [cloneDone, setCloneDone] = useState(false);
  const [validationReady, setValidationReady] = useState(false);

  const [showChg, setShowChg] = useState(false);
  const [chgNumber, setChgNumber] = useState("CHG");
  const [chgErr, setChgErr] = useState("");
  const [chgChecking, setChgChecking] = useState(false);
  const chgUpper = (chgNumber || "").toUpperCase();
  const chgIsValid = chgUpper.startsWith("CHG") && chgUpper.length > 3;
  const [requireChg, setRequireChg] = useState(true);
  const [chgValidated, setChgValidated] = useState(false);

  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [showUnlockConfirm, setShowUnlockConfirm] = useState(false);

  const [baselineWarnings, setBaselineWarnings] = useState([]);
  const [checkingBaseline, setCheckingBaseline] = useState(false);

  const [sandbox, setSandbox] = useState({ success: 0, total: 0, rows: [] });
  const [counts, setCounts] = useState({
    reboot: 0,
    error1603: 0,
    critical: 0,
  });
  const [isPrevStageComplete, setIsPrevStageComplete] = useState(false);

  const userRole = sessionStorage.getItem("user_role") || "Admin";
  const isEUC = userRole === "EUC";

  const handleValidationChange = useCallback((isValid) => {
    setValidationReady(isValid);
  }, []);

  const [localPilotEnabled, setLocalPilotEnabled] = useState(
    env?.enablePilot !== false && String(env?.enablePilot) !== "false",
  );
  const [localSandboxEnabled, setLocalSandboxEnabled] = useState(
    env?.enableSandbox !== false && String(env?.enableSandbox) !== "false",
  );

  useEffect(() => {
    if (env?.enablePilot !== undefined)
      setLocalPilotEnabled(String(env.enablePilot) !== "false");
    if (env?.enableSandbox !== undefined)
      setLocalSandboxEnabled(String(env.enableSandbox) !== "false");
  }, [env?.enablePilot, env?.enableSandbox]);

  let isGateSatisfied = false;
  if (inProduction) {
    if (localPilotEnabled) {
      isGateSatisfied = !!pilotDone;
    } else if (localSandboxEnabled) {
      isGateSatisfied = !!sbxDone;
    } else {
      isGateSatisfied = true;
    }
  } else if (localSandboxEnabled) {
    isGateSatisfied = !!sbxDone;
  } else {
    isGateSatisfied = true;
  }

  const isFirstStage = inProduction
    ? !localPilotEnabled && !localSandboxEnabled
    : !localSandboxEnabled;

  const showResetToSandbox = !isEUC && localSandboxEnabled;
  const showResetToPilot = !isEUC && localPilotEnabled;

  const validDeployments = useMemo(() => {
    const raw = inProduction ? env.prodDeployments : env.pilotDeployments;
    return (Array.isArray(raw) ? raw : []).filter((d) => d.baseline && d.group);
  }, [inProduction, env]);

  const prevActionsInfo = useMemo(() => {
    try {
      let stageData;
      if (inProduction) {
        stageData = localPilotEnabled
          ? lastActions?.PILOT
          : lastActions?.SANDBOX;
      } else {
        stageData = lastActions?.SANDBOX;
      }

      if (stageData?.actions && Array.isArray(stageData.actions))
        return stageData.actions;
      if (stageData?.id)
        return [{ actionId: stageData.id, group: stageData.group }];
      return [];
    } catch {
      return [];
    }
  }, [inProduction, localPilotEnabled, lastActions]);

  const trackingId = useMemo(
    () => prevActionsInfo.map((a) => a.actionId).join(","),
    [prevActionsInfo],
  );

  const currentActionsInfo = useMemo(() => {
    try {
      const stageData = inProduction
        ? lastActions?.PRODUCTION
        : lastActions?.PILOT;
      if (stageData?.actions && Array.isArray(stageData.actions))
        return stageData.actions;
      if (stageData?.id)
        return [{ actionId: stageData.id, group: stageData.group }];
      return [];
    } catch {
      return [];
    }
  }, [inProduction, lastActions]);

  const [isCurrentComplete, setIsCurrentComplete] = useState(false);

  useEffect(() => {
    if (!readOnly || currentActionsInfo.length === 0) {
      setIsCurrentComplete(false);
      return;
    }
    let cancelled = false;
    let timer;

    const pollCurrent = async () => {
      if (cancelled) return;
      const allDone = await checkAllActionsDone(currentActionsInfo);
      if (allDone) {
        if (cancelled) return;
        setIsCurrentComplete(true);
        if (timer) clearInterval(timer);
      }
    };

    pollCurrent();
    timer = setInterval(pollCurrent, 15000);
    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
    };
  }, [readOnly, currentActionsInfo]);

  useEffect(() => {
    const ctl = new AbortController();
    (async () => {
      try {
        const cfg = await getJSON(`${API_BASE}/api/config`, ctl.signal);
        const c = cfg?.config ?? cfg;
        setEnv((prev) => ({
          ...prev,
          snapshotVM: c.snapshotVM ?? prev.snapshotVM,
          cloneVM: c.cloneVM ?? prev.cloneVM,
          enablePilot: c.enablePilot ?? prev.enablePilot,
          enableSandbox: c.enableSandbox ?? prev.enableSandbox,
          successThreshold:
            c.successThreshold != null
              ? Number(c.successThreshold)
              : prev.successThreshold,
          allowableCriticalHF:
            c.allowableCriticalHF != null
              ? Number(c.allowableCriticalHF)
              : prev.allowableCriticalHF,
        }));
        if (typeof c?.requireChg === "boolean") setRequireChg(c.requireChg);
        if (typeof c?.enablePilot === "boolean")
          setLocalPilotEnabled(c.enablePilot);
        if (typeof c?.enableSandbox === "boolean")
          setLocalSandboxEnabled(c.enableSandbox);
      } catch (e) {
        console.warn("Error fetching config", e);
      }
    })();
    return () => ctl.abort();
  }, [setEnv]);

  useEffect(() => {
    const skippedPrevForProduction =
      inProduction && !localPilotEnabled && !localSandboxEnabled;
    const skippedPrevForPilot = !inProduction && !localSandboxEnabled;

    if ((skippedPrevForProduction || skippedPrevForPilot) && isGateSatisfied) {
      setEnableTriggerPilot(true);
      setIsPrevStageComplete(true);
      setDecision("Ready to trigger (Prior stages bypassed).");
      setEnv((p) => ({
        ...p,
        [`${mode}Evaluated`]: true,
        [`${mode}Unlocked`]: true,
      }));
    }
  }, [
    inProduction,
    localPilotEnabled,
    localSandboxEnabled,
    isGateSatisfied,
    mode,
    setEnv,
  ]);

  useEffect(() => {
    hasAutoRefreshed.current = false;
  }, [trackingId]);

  useEffect(() => {
    if (!isGateSatisfied || readOnly) {
      setIsPrevStageComplete(false);
      setEnableEvaluate(false);
      return;
    }
    const skippedPrevForProduction =
      inProduction && !localPilotEnabled && !localSandboxEnabled;
    const skippedPrevForPilot = !inProduction && !localSandboxEnabled;
    if (skippedPrevForProduction || skippedPrevForPilot) return;
    if (prevActionsInfo.length === 0) return;
    if (isPrevStageComplete) {
      setEnableEvaluate(true);
      return;
    }

    let cancelled = false;
    let timer;

    const poll = async () => {
      if (cancelled) return;
      const allDone = await checkPrevActionsDone(prevActionsInfo);
      if (allDone) {
        if (cancelled) return;
        setIsPrevStageComplete(true);
        setEnableEvaluate(true);
        if (timer) clearInterval(timer);
      }
    };

    poll();
    timer = setInterval(poll, 30000);
    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
    };
  }, [
    inProduction,
    prevActionsInfo,
    isPrevStageComplete,
    isGateSatisfied,
    readOnly,
    localPilotEnabled,
    localSandboxEnabled,
  ]);

  useEffect(() => {
    const onCounts = (e) => {
      const d = e.detail || {};
      setCounts((c) => ({
        ...c,
        reboot: num(d.reboot, c.reboot),
        error1603: num(d.error1603, c.error1603),
      }));
    };
    const onCritical = (e) => {
      const d = e.detail || {};
      setCounts((c) => ({ ...c, critical: num(d.count, c.critical) }));
    };
    globalThis.addEventListener("pilot:miscKpisUpdated", onCounts);
    globalThis.addEventListener("pilot:kpiCountsUpdated", onCounts);
    globalThis.addEventListener("pilot:criticalHealthUpdated", onCritical);

    return () => {
      globalThis.removeEventListener("pilot:miscKpisUpdated", onCounts);
      globalThis.removeEventListener("pilot:kpiCountsUpdated", onCounts);
      globalThis.removeEventListener("pilot:criticalHealthUpdated", onCritical);
    };
  }, []);

  useEffect(() => {
    if (isEUC && isGateSatisfied && isPrevStageComplete) {
      setEnableTriggerPilot(true);
      setDecision("Ready to trigger (EUC Mode)");
    }
  }, [isEUC, isGateSatisfied, isPrevStageComplete]);

  const refreshKpis = useCallback(async () => {
    if (isRefreshing.current) return;
    isRefreshing.current = true;
    setRefreshing(true);
    const ab = new AbortController();
    try {
      if (prevActionsInfo.length === 0) {
        setEnableEvaluate(false);
        setDecision("Loading previous stage data...");
        return;
      }

      const { globalSuccess, globalTotal, uniqueGroups } =
        await fetchKpisForActions(prevActionsInfo, ab.signal);
      setSandbox({ success: globalSuccess, total: globalTotal, rows: [] });

      const trueCriticalCount = await fetchHealthAndComps(
        uniqueGroups,
        ab.signal,
      );
      setCounts((c) => ({ ...c, critical: trueCriticalCount }));

      setTimeout(() => {
        globalThis.dispatchEvent(new CustomEvent("pilot:requestKpiCounts"));
      }, 0);

      const approved =
        sessionStorage.getItem(`approved_${mode}_${trackingId}`) === "true";
      const savedChg = sessionStorage.getItem(`chg_${mode}_${trackingId}`);

      syncApprovalState(
        approved,
        requireChg,
        savedChg,
        isGateSatisfied,
        isPrevStageComplete,
        mode,
        setEnv,
        setEvaluated,
        setEnableEvaluate,
        setChgValidated,
        setChgNumber,
        setEnableTriggerPilot,
        setDecision,
      );
    } catch (e) {
      console.warn("Refresh KPIs failed:", e);
    } finally {
      isRefreshing.current = false;
      setRefreshing(false);
    }
  }, [
    prevActionsInfo,
    trackingId,
    mode,
    isGateSatisfied,
    isPrevStageComplete,
    requireChg,
    setEnv,
  ]);

  useEffect(() => {
    if (
      isGateSatisfied &&
      isPrevStageComplete &&
      prevActionsInfo.length > 0 &&
      !hasAutoRefreshed.current
    ) {
      hasAutoRefreshed.current = true;
      refreshKpis();
    }
  }, [isGateSatisfied, isPrevStageComplete, prevActionsInfo, refreshKpis]);

  useEffect(() => {
    const intervalId = setInterval(() => {
      if (!busy && !checkingBaseline) refreshKpis();
    }, 600000);
    return () => clearInterval(intervalId);
  }, [refreshKpis, busy, checkingBaseline]);

  function evaluateAndDecide() {
    if (!isGateSatisfied || !enableEvaluate || readOnly) return;

    if (refreshing || sandbox.total === 0) {
      setDecision("FAIL: Data is still loading or unavailable. Please wait.");
      setEnableTriggerPilot(false);
      setEvaluated(true);
      return;
    }

    processKpiEvaluation(
      mode,
      sandbox,
      counts,
      env,
      trackingId,
      requireChg,
      chgNumber,
      setEnv,
      setDecision,
      setShowChg,
      setChgErr,
      setChgNumber,
      setEnableTriggerPilot,
      setEvaluated,
    );
  }

  async function submitChg(e) {
    e.preventDefault();
    setChgErr("");
    const cleaned = (chgUpper || "").trim();
    if (!(cleaned.startsWith("CHG") && cleaned.length > 3)) {
      setChgErr("Change number must start with CHG.");
      return;
    }

    try {
      setChgChecking(true);
      const url = `${API_BASE}/api/sn/change/validate?number=${encodeURIComponent(cleaned)}`;
      const j = await getJSON(url);

      if (j.ok !== true || j.implement !== true) {
        setChgErr(j?.message || "Validation failed.");
        return;
      }

      setChgValidated(true);
      setShowChg(false);
      setEnableTriggerPilot(true);
      setDecision(`CHG validated. Configuration Unlocked.`);
      setEnv((p) => ({
        ...p,
        [`${mode}Evaluated`]: true,
        [`${mode}Unlocked`]: true,
      }));
      if (trackingId)
        sessionStorage.setItem(`chg_${mode}_${trackingId}`, cleaned);
    } catch (err) {
      setChgErr(err?.message || String(err));
    } finally {
      setChgChecking(false);
    }
  }

  async function checkBaselineStatus() {
    if (validDeployments.length === 0) return [];
    const warnings = [];
    try {
      const uniqueBaselines = [
        ...new Set(validDeployments.map((d) => d.baseline)),
      ];
      for (const b of uniqueBaselines) {
        const resp = await postJSON(
          `${API_BASE.replace(/\/$/, "")}/api/baseline/validate`,
          { baselineName: b },
        );
        if (resp.ok && resp.modified) warnings.push(`[${b}]: ${resp.warning}`);
      }
    } catch (e) {
      console.warn("Baseline val failed:", e);
    }
    return warnings;
  }

  async function handleTriggerClick() {
    const canProceed = enableTriggerPilot || (isEUC && isGateSatisfied);
    if (!canProceed || busy || readOnly || validDeployments.length === 0)
      return;

    if (requireChg && !chgValidated) {
      setShowChg(true);
      setChgErr("");
      if (!chgNumber) setChgNumber("CHG");
      return;
    }

    setCheckingBaseline(true);
    setBaselineWarnings([]);
    const warnings = await checkBaselineStatus();
    if (warnings && warnings.length > 0) setBaselineWarnings(warnings);
    setCheckingBaseline(false);
    setShowConfirmModal(true);
  }

  async function executeTrigger() {
    const canProceed = enableTriggerPilot || (isEUC && isGateSatisfied);
    if (!canProceed || busy || readOnly || validDeployments.length === 0)
      return;

    setShowConfirmModal(false);
    setBusy(true);
    try {
      let endpoint = "";
      if (inProduction) {
        endpoint = requireChg
          ? "/api/production/actions"
          : "/api/production/actions/force";
      } else {
        endpoint = requireChg
          ? "/api/pilot/actions"
          : "/api/pilot/actions/force";
      }

      const payload = {
        deployments: validDeployments,
        triggeredBy: username,
        environment: inProduction ? "Production" : "Pilot",
        autoMail: !!autoMail,
        patchWindow: {
          days: env?.patchWindowDays || 0,
          hours: env?.patchWindowHours || 0,
          minutes: env?.patchWindowMinutes || 0,
        },
      };

      if (requireChg && chgValidated) {
        payload.chgNumber = chgUpper;
        payload.requireChg = true;
      } else {
        payload.requireChg = false;
      }

      const trig = await postJSON(`${API_BASE}${endpoint}`, payload);
      setEnv((p) => ({
        ...p,
        [`${mode}Unlocked`]: false,
        [`${mode}Evaluated`]: false,
      }));

      if (trackingId) {
        sessionStorage.removeItem(`approved_${mode}_${trackingId}`);
        sessionStorage.removeItem(`chg_${mode}_${trackingId}`);
      }
      globalThis.dispatchEvent(
        new CustomEvent("pilot:kpiRefreshed", { detail: { ts: Date.now() } }),
      );
      setEnableTriggerPilot(false);
      setEvaluated(false);
      setDecision(
        `${inProduction ? "Production" : "Pilot"} triggered successfully.`,
      );

      globalThis.dispatchEvent(
        new CustomEvent(
          inProduction ? "production:triggered" : "pilot:triggered",
          { detail: { actions: trig?.actions } },
        ),
      );
    } catch (e) {
      setDecision(`Trigger failed: ${e?.message || e}`);
    } finally {
      setBusy(false);
    }
  }

  function resetToSandbox() {
    setEnv((p) => ({ ...p, pilotUnlocked: false, productionUnlocked: false }));
    globalThis.dispatchEvent(new CustomEvent("orchestrator:resetToSandbox"));
  }

  function resetToPilot() {
    setEnv((p) => ({ ...p, productionUnlocked: false }));
    globalThis.dispatchEvent(new CustomEvent("orchestrator:resetToPilot"));
  }

  const handleSnapshotClick = () => {
    if (onOpenSnapshot) onOpenSnapshot();
    setSnapshotDone(true);
  };
  const handleCloneClick = () => {
    if (onOpenClone) onOpenClone();
    setCloneDone(true);
  };

  const needsBackup = env?.snapshotVM || env?.cloneVM;
  const isTriggerBlocked = needsBackup && !validationReady;
  const canTrigger =
    enableTriggerPilot ||
    (isEUC && isGateSatisfied) ||
    (isFirstStage && isGateSatisfied);
  const isTriggerDisabled =
    !isGateSatisfied ||
    !canTrigger ||
    busy ||
    readOnly ||
    isTriggerBlocked ||
    validDeployments.length === 0;

  const isAdvancedStage =
    !inProduction &&
    ((env?.productionStatus && env.productionStatus !== "pending") ||
      env?.productionActions?.length > 0);

  return (
    <section className="card reveal" data-reveal style={{ marginBottom: 0 }}>
      <h2>Decision Engine</h2>
      {!isGateSatisfied && (
        <div className="sub" style={{ marginBottom: 10, color: "#8a8fa3" }}>
          {inProduction
            ? localPilotEnabled
              ? "🔒 Pilot stage must be triggered first."
              : "🔒 Sandbox stage must be triggered first."
            : "🔒 Complete Sandbox stage first."}
        </div>
      )}
      {readOnly && (
        <div className="sub" style={{ marginBottom: 10, color: "#8a8fa3" }}>
          View-only: stage advanced.
        </div>
      )}

      <div className="decision" style={{ marginBottom: 12 }}>
        <span
          className={`tag ${isFirstStage ? "pass" : evaluated ? (enableTriggerPilot || chgValidated ? "pass" : "fail") : "hold"}`}
        >
          {isFirstStage
            ? "PASS"
            : evaluated
              ? enableTriggerPilot || chgValidated
                ? "PASS"
                : "FAIL"
              : "HOLD"}
        </span>
        <span style={{ marginLeft: 10 }}>
          {isFirstStage
            ? "Prior stages bypassed — ready to trigger."
            : decision}
        </span>
      </div>

      {!isEUC && (
        <div
          style={{
            background: "#f8fafc",
            padding: 12,
            borderRadius: 8,
            marginBottom: 16,
            display: "flex",
            flexWrap: "wrap",
            gap: 12,
            alignItems: "center",
            border: "1px solid #e2e8f0",
          }}
        >
          <strong
            style={{
              color: "#64748b",
              fontSize: 13,
              textTransform: "uppercase",
            }}
          >
            VM Actions:
          </strong>
          <button
            type="button"
            className="btn outline small"
            onClick={handleSnapshotClick}
            disabled={!env.snapshotVM || !isGateSatisfied}
          >
            {snapshotDone ? "Snapshot Done ✓" : "Take Snapshot"}
          </button>
          <button
            type="button"
            className="btn outline small"
            onClick={handleCloneClick}
            disabled={!env.cloneVM || !isGateSatisfied}
          >
            {cloneDone ? "Clone Done ✓" : "Clone VMs"}
          </button>
          <span style={{ fontSize: 12, color: "#888", marginLeft: "auto" }}>
            Target:{" "}
            <strong>
              {validDeployments.length > 1
                ? "Multiple Groups"
                : validDeployments[0]?.group || "None"}
            </strong>
          </span>
        </div>
      )}

      {needsBackup && isGateSatisfied && (
        <ValidationGate
          targetGroupName={validDeployments.map((d) => d.group).join(",")}
          onValidationChange={handleValidationChange}
        />
      )}

      <div
        className="row"
        style={{ gap: 8, flexWrap: "wrap", display: "flex" }}
      >
        <button
          type="button"
          className="btn outline small"
          onClick={refreshKpis}
          disabled={refreshing}
          style={{ display: "flex", alignItems: "center", gap: "6px" }}
        >
          {refreshing ? (
            <>
              <InlineSpinner size={14} variant="dark" />
              <span>Refreshing...</span>
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
        {!isEUC && !isFirstStage && (
          <button
            type="button"
            className="btn outline ok"
            onClick={evaluateAndDecide}
            disabled={
              !isGateSatisfied || !enableEvaluate || readOnly || refreshing
            }
          >
            Evaluate &amp; Approve
          </button>
        )}
        {evaluated &&
          !enableTriggerPilot &&
          !chgValidated &&
          !readOnly &&
          !isEUC &&
          !isFirstStage && (
            <button
              type="button"
              className="btn outline amber"
              onClick={() => setShowUnlockConfirm(true)}
            >
              Unlock Settings
            </button>
          )}

        {!readOnly ? (
          <button
            type="button"
            className="btn outline small"
            onClick={handleTriggerClick}
            disabled={isTriggerDisabled}
            title={isTriggerBlocked ? "Complete Validation first" : "Trigger"}
          >
            {busy ? (
              <>
                <InlineSpinner size={14} variant="dark" />
                <span>Triggering...</span>
              </>
            ) : checkingBaseline ? (
              <>
                <InlineSpinner size={14} variant="dark" />
                <span>Checking...</span>
              </>
            ) : inProduction ? (
              "Trigger Production"
            ) : (
              "Trigger Pilot"
            )}
          </button>
        ) : stageFinished ? (
          <div
            style={{
              color: "var(--muted)",
              fontSize: "13px",
              fontWeight: 600,
              display: "flex",
              alignItems: "center",
              padding: "0 8px",
            }}
          >
            Stage Locked
          </div>
        ) : (
          <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
            {!isCurrentComplete && (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                  marginRight: "8px",
                  color: "var(--muted)",
                  fontSize: "13px",
                  fontWeight: 600,
                }}
              >
                <InlineSpinner size={14} variant="dark" /> Actions Running
              </div>
            )}

            <button
              type="button"
              className="btn outline dan small"
              onClick={onResetStage}
              disabled={!isCurrentComplete || isAdvancedStage}
              title={
                isAdvancedStage
                  ? "Cannot reset Stage while next stage is active."
                  : "Reset Stage"
              }
            >
              Reset Stage
            </button>
            <button
              type="button"
              className="btn pri small"
              onClick={onFinish}
              disabled={!isCurrentComplete}
            >
              Finish Stage
            </button>
          </div>
        )}

        {isEUC && !stageFinished && (
          <button
            type="button"
            className="btn outline dan"
            onClick={() =>
              globalThis.dispatchEvent(new CustomEvent("orchestrator:resetAll"))
            }
            disabled={readOnly && !isCurrentComplete}
            title="Reset the entire flow back to Configuration"
          >
            Reset Deployment Flow
          </button>
        )}

        {!inProduction && showResetToSandbox && !stageFinished && (
          <button
            type="button"
            className="btn outline dan"
            onClick={resetToSandbox}
            disabled={(readOnly && !isCurrentComplete) || isAdvancedStage}
            title={
              isAdvancedStage
                ? "Cannot reset to Sandbox while Production is active."
                : "Reset to Sandbox"
            }
          >
            Reset to Sandbox
          </button>
        )}

        {inProduction && !stageFinished && (
          <>
            {showResetToPilot && (
              <button
                type="button"
                className="btn outline small"
                onClick={resetToPilot}
                disabled={readOnly && !isCurrentComplete}
              >
                Reset to Pilot
              </button>
            )}
            {showResetToSandbox && (
              <button
                type="button"
                className="btn outline dan"
                onClick={resetToSandbox}
                disabled={readOnly && !isCurrentComplete}
              >
                Reset to Sandbox
              </button>
            )}
          </>
        )}
      </div>

      {showUnlockConfirm && (
        <ConfirmationModal
          open={showUnlockConfirm}
          title="Override Configuration Limits"
          onClose={() => setShowUnlockConfirm(false)}
          onConfirm={() => {
            setEnv((p) => ({
              ...p,
              [`${mode}Unlocked`]: true,
              [`${mode}Evaluated`]: true,
            }));
            setEvaluated(true);
            if (trackingId) {
              sessionStorage.setItem(`approved_${mode}_${trackingId}`, "true");
            }
            if (requireChg) {
              setDecision(
                "PASS (Override): Thresholds bypassed. Validate CHG.",
              );
              setEnableTriggerPilot(false);
            } else {
              setDecision(
                "PASS (Override): Configuration Unlocked & Approved.",
              );
              setEnableTriggerPilot(true);
            }
            setShowUnlockConfirm(false);
          }}
        >
          <p style={{ marginTop: 0 }}>
            The evaluation failed to meet the configured thresholds.
          </p>
          <p style={{ marginTop: "10px" }}>
            Do you want to forcefully unlock the configuration and{" "}
            <strong>Approve the Gates</strong> to proceed?
          </p>
          <p className="muted-text text-12" style={{ marginTop: "10px" }}>
            Note: To completely abandon this deployment and start over, we
            recommend using the <strong>Reset</strong> buttons below.
          </p>
        </ConfirmationModal>
      )}

      {showChg && (
        <div
          className="modal show"
          role="presentation"
          onMouseDown={() => setShowChg(false)}
          tabIndex={-1}
          style={{ zIndex: 9999 }}
        >
          <div
            className="box chg-modal-box"
            onMouseDown={(e) => e.stopPropagation()}
            role="presentation"
            style={{
              maxWidth: 480,
              padding: 0,
              overflow: "hidden",
              border: "1px solid var(--border)",
              borderRadius: "8px",
            }}
          >
            <div
              style={{
                background: "var(--panel-2)",
                padding: "20px 24px",
                borderBottom: "1px solid var(--border)",
                display: "flex",
                alignItems: "center",
                gap: "14px",
              }}
            >
              <div
                style={{
                  width: 44,
                  height: 44,
                  background: "#eff6ff",
                  color: "#3b82f6",
                  borderRadius: "10px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                }}
              >
                <svg
                  width="22"
                  height="22"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                  <polyline points="14 2 14 8 20 8"></polyline>
                  <line x1="16" y1="13" x2="8" y2="13"></line>
                  <line x1="16" y1="17" x2="8" y2="17"></line>
                  <polyline points="10 9 9 9 8 9"></polyline>
                </svg>
              </div>
              <div>
                <h3
                  style={{
                    margin: 0,
                    fontSize: "18px",
                    color: "var(--text)",
                    fontWeight: 600,
                  }}
                >
                  ITSM Validation
                </h3>
                <div
                  style={{
                    fontSize: "13px",
                    color: "var(--muted)",
                    marginTop: "4px",
                  }}
                >
                  Enter ServiceNow Change Request Number
                </div>
              </div>
            </div>
            <form onSubmit={submitChg} style={{ padding: "24px" }}>
              <div className="field m-0">
                <label
                  htmlFor="chgNumber"
                  className="label"
                  style={{
                    fontWeight: 600,
                    marginBottom: "8px",
                    color: "var(--text)",
                  }}
                >
                  Change Number (CHG) <span className="req text-danger">*</span>
                </label>
                <div className="inputwrap" style={{ position: "relative" }}>
                  <input
                    id="chgNumber"
                    type="text"
                    className={`control ${chgErr ? "border-danger" : ""}`}
                    placeholder="e.g. CHG0012345"
                    value={chgNumber}
                    onChange={(e) => {
                      setChgNumber(e.target.value.toUpperCase());
                      setChgErr("");
                    }}
                    autoFocus
                    disabled={chgChecking}
                    style={{
                      height: "46px",
                      fontSize: "15px",
                      fontWeight: 600,
                      letterSpacing: "1px",
                      textTransform: "uppercase",
                      paddingLeft: "16px",
                    }}
                  />
                  {chgChecking && (
                    <div
                      style={{
                        position: "absolute",
                        right: "12px",
                        top: "50%",
                        transform: "translateY(-50%)",
                        display: "flex",
                        alignItems: "center",
                      }}
                    >
                      <svg
                        className="spinner"
                        viewBox="0 0 50 50"
                        style={{
                          width: 20,
                          height: 20,
                          stroke: "var(--primary)",
                        }}
                      >
                        <circle
                          cx="25"
                          cy="25"
                          r="20"
                          fill="none"
                          strokeWidth="5"
                        ></circle>
                      </svg>
                    </div>
                  )}
                </div>
              </div>
              {!!chgErr && (
                <div
                  className="fade-in"
                  style={{
                    marginTop: "16px",
                    padding: "12px 14px",
                    background: "#fef2f2",
                    border: "1px solid #fecaca",
                    borderRadius: "6px",
                    display: "flex",
                    gap: "10px",
                    alignItems: "flex-start",
                  }}
                >
                  <svg
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="#ef4444"
                    strokeWidth="2"
                    style={{ flexShrink: 0, marginTop: "2px" }}
                  >
                    <circle cx="12" cy="12" r="10"></circle>
                    <line x1="12" y1="8" x2="12" y2="12"></line>
                    <line x1="12" y1="16" x2="12.01" y2="16"></line>
                  </svg>
                  <span
                    style={{
                      color: "#b91c1c",
                      fontSize: "13px",
                      fontWeight: 500,
                      lineHeight: 1.4,
                    }}
                  >
                    {chgErr}
                  </span>
                </div>
              )}
              <div
                style={{
                  display: "flex",
                  justifyContent: "flex-end",
                  gap: "12px",
                  marginTop: "32px",
                }}
              >
                <button
                  type="button"
                  className="btn outline"
                  onClick={() => setShowChg(false)}
                  disabled={chgChecking}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn pri min-w-140"
                  disabled={!chgIsValid || chgChecking}
                >
                  {chgChecking ? (
                    <>
                      <InlineSpinner size={14} variant="light" />
                      <span>Validating...</span>
                    </>
                  ) : (
                    "Validate Ticket"
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showConfirmModal && (
        <div
          className="modal show"
          role="presentation"
          onMouseDown={() => setShowConfirmModal(false)}
          tabIndex={-1}
        >
          <div
            className="box"
            onMouseDown={(e) => e.stopPropagation()}
            role="presentation"
            style={{ maxWidth: 800, width: "90%" }}
          >
            <h3 style={{ color: "var(--primary)", marginBottom: 20 }}>
              Confirm Trigger {inProduction ? "Production" : "Pilot"}
            </h3>
            {baselineWarnings.length > 0 && (
              <div className="banner error" style={{ marginBottom: 16 }}>
                <strong>⚠️ Baselines Modified</strong>
                <div style={{ marginTop: 4 }}>
                  {baselineWarnings.map((w) => (
                    <div key={w}>{w}</div>
                  ))}
                </div>
              </div>
            )}
            <div
              className="sub"
              style={{ fontSize: 14, lineHeight: 1.6, margin: "16px 0" }}
            >
              You are about to trigger the following deployments:
              <ul
                style={{
                  paddingLeft: "20px",
                  marginTop: "12px",
                  display: "flex",
                  flexDirection: "column",
                  gap: "8px",
                }}
              >
                {validDeployments.map((d) => (
                  <li key={`${d.baseline}-${d.group}`}>
                    <strong>{d.baseline}</strong> <br />
                    <span style={{ color: "var(--muted)" }}>➔ {d.group}</span>
                  </li>
                ))}
              </ul>
              {chgValidated && (
                <div style={{ marginTop: "16px" }}>
                  Change Number: <strong>{chgUpper}</strong>
                </div>
              )}
            </div>
            <div className="row" style={{ justifyContent: "flex-end", gap: 8 }}>
              <button
                type="button"
                className="btn"
                onClick={() => setShowConfirmModal(false)}
                disabled={busy}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn pri"
                onClick={executeTrigger}
                disabled={busy}
                style={{ display: "flex", alignItems: "center", gap: "6px" }}
              >
                {busy ? (
                  <>
                    <InlineSpinner size={16} variant="light" />
                    <span>Triggering...</span>
                  </>
                ) : (
                  "Confirm & Trigger"
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

PilotDecisionEngine.propTypes = {
  sbxDone: PropTypes.bool,
  pilotDone: PropTypes.bool,
  mode: PropTypes.string,
  readOnly: PropTypes.bool,
  autoMail: PropTypes.bool,
  lastActions: PropTypes.object,
  username: PropTypes.string.isRequired,
  onOpenSnapshot: PropTypes.func,
  onOpenClone: PropTypes.func,
  onFinish: PropTypes.func.isRequired,
  onResetStage: PropTypes.func.isRequired,
  stageFinished: PropTypes.bool,
};
