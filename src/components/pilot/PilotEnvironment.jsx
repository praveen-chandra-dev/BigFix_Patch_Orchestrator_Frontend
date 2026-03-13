// src/components/pilot/PilotEnvironment.jsx
import { useEffect, useMemo, useRef, useState } from "react";
import { useEnvironment } from "../Environment.jsx";

const API_BASE = window.env.VITE_API_BASE;

function getHeaders() {
  return {
    "Content-Type": "application/json",
    "Accept": "application/json",
    "x-user-role": sessionStorage.getItem("user_role") || "Admin"
  };
}

function enhanceNativeSelect(selectEl) {
  if (!selectEl || selectEl.dataset.fx === "ok") return;
  selectEl.dataset.fx = "ok";
  selectEl.style.display = "none";

  const wrap = document.createElement("div");
  wrap.className = "fx-wrap";
  selectEl.parentNode.insertBefore(wrap, selectEl);
  wrap.appendChild(selectEl);

  const selectedOption = selectEl.options[selectEl.selectedIndex];
  const displayText = selectedOption ? selectedOption.text : "— select —";
  const isPlaceholder = !selectedOption || selectedOption.value === "";

  const trigger = document.createElement("button");
  trigger.type = "button";
  trigger.className = "fx-trigger";
  trigger.setAttribute("aria-haspopup", "listbox");
  trigger.setAttribute("aria-expanded", "false");
  trigger.innerHTML = `
    <span class="fx-value ${isPlaceholder ? "fx-placeholder" : ""}">${displayText}</span>
    <span class="fx-chevron">▾</span>
  `;
  wrap.insertBefore(trigger, selectEl);

  const menu = document.createElement("div");
  menu.className = "fx-menu";
  menu.setAttribute("role", "listbox");
  const menuInner = document.createElement("div");
  menuInner.className = "fx-menu-inner";
  menu.appendChild(menuInner);
  wrap.appendChild(menu);

  const allOptions = Array.from(selectEl.querySelectorAll("option"));
  let hoverIdx = -1;
  const isRealOption = (o) => {
    const txt = (o.textContent || "").trim().toLowerCase();
    return !o.disabled && o.value !== "" && !/^—.*—$/.test(txt);
  };
  const itemsOnly = () => allOptions.filter(isRealOption);

  function renderMenu() {
    menuInner.innerHTML = "";
    const realItems = itemsOnly();
    if (realItems.length === 0) {
      const emptyMsg = document.createElement("div");
      emptyMsg.className = "fx-item fx-empty";
      emptyMsg.textContent = "No options";
      menuInner.appendChild(emptyMsg);
      return;
    }
    realItems.forEach((option, visibleIndex) => {
      const it = document.createElement("div");
      it.className = "fx-item" + (option.selected ? " fx-active" : "");
      it.dataset.index = String(visibleIndex);
      it.setAttribute("role", "option");
      it.setAttribute("aria-selected", option.selected);
      it.innerHTML = `
        <span class="fx-label">${option.textContent}</span>
        ${option.selected ? "<span class='fx-tick'>✓</span>" : ""}
      `;
      it.addEventListener("mouseenter", () => setHover(visibleIndex));
      it.addEventListener("mousedown", (e) => e.preventDefault());
      it.addEventListener("click", () => commit(visibleIndex));
      menuInner.appendChild(it);
    });
  }

  function open() {
    if (wrap.classList.contains("fx-open")) return;
    const r = trigger.getBoundingClientRect();
    const spaceBelow = window.innerHeight - r.bottom;
    const spaceAbove = r.top;
    if (spaceBelow < 200 && spaceAbove > 200) {
      menu.classList.add("fx-upward");
    } else {
      menu.classList.remove("fx-upward");
    }
    wrap.classList.add("fx-open");
    trigger.setAttribute("aria-expanded", "true");
    renderMenu();
    document.addEventListener("mousedown", onDocDown);
    const triggerWidth = trigger.offsetWidth;
    menu.style.width = triggerWidth + "px";
    menu.style.minWidth = triggerWidth + "px";
    menu.style.maxWidth = triggerWidth + "px";
    const menuRect = menu.getBoundingClientRect();
    if (menuRect.right > window.innerWidth) {
      menu.style.left = "auto";
      menu.style.right = "0";
    } else {
      menu.style.left = "0";
      menu.style.right = "auto";
    }
    menu.style.maxHeight = "300px";
    menu.style.overflow = "auto";
    const currentIndex = itemsOnly().findIndex(o => o.selected);
    setHover(currentIndex >= 0 ? currentIndex : 0);
  }

  function close() {
    if (!wrap.classList.contains("fx-open")) return;
    wrap.classList.remove("fx-open");
    trigger.setAttribute("aria-expanded", "false");
    document.removeEventListener("mousedown", onDocDown);
    hoverIdx = -1;
    menu.style.width = "";
    menu.style.minWidth = "";
    menu.style.maxWidth = "";
    menu.style.maxHeight = "";
    menu.style.overflow = "";
    menu.style.left = "";
    menu.style.right = "";
  }

  function onDocDown(e) { if (!wrap.contains(e.target)) close(); }

  function setHover(i) {
    const realItems = itemsOnly();
    if (realItems.length === 0) return;
    hoverIdx = Math.max(0, Math.min(i, realItems.length - 1));
    const nodes = menuInner.querySelectorAll(".fx-item");
    nodes.forEach((n, j) => n.classList.toggle("fx-hover", j === hoverIdx));
    nodes[hoverIdx]?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }

  function commit(i) {
    const realItems = itemsOnly();
    if (realItems.length === 0) return;
    const chosen = realItems[i];
    allOptions.forEach(o => (o.selected = false));
    chosen.selected = true;
    selectEl.value = chosen.value;
    const valEl = trigger.querySelector(".fx-value");
    valEl.textContent = chosen.textContent;
    valEl.classList.remove("fx-placeholder");
    close();
    selectEl.dispatchEvent(new Event("change", { bubbles: true }));
  }

  trigger.addEventListener("click", (e) => { e.stopPropagation(); wrap.classList.contains("fx-open") ? close() : open(); });
  trigger.addEventListener("keydown", (e) => {
    const isOpen = wrap.classList.contains("fx-open");
    const realItems = itemsOnly();
    if (!isOpen && ["ArrowDown","Enter"," "].includes(e.key)) { e.preventDefault(); open(); return; }
    if (!isOpen) return;
    switch (e.key) {
      case "Escape": e.preventDefault(); close(); break;
      case "Enter": e.preventDefault(); if (hoverIdx >= 0) commit(hoverIdx); break;
      case "ArrowDown": e.preventDefault(); setHover((hoverIdx + 1) % realItems.length); break;
      case "ArrowUp": e.preventDefault(); setHover((hoverIdx - 1 + realItems.length) % realItems.length); break;
    }
  });

  const obs = new MutationObserver(() => {
    const selectedOption = selectEl.options[selectEl.selectedIndex];
    const displayText = selectedOption ? selectedOption.text : "— select —";
    const isPlaceholder = !selectedOption || selectedOption.value === "";
    const valEl = trigger.querySelector(".fx-value");
    if (valEl) {
      valEl.textContent = displayText;
      valEl.classList.toggle("fx-placeholder", isPlaceholder);
    }
  });
  obs.observe(selectEl, { childList: true, subtree: true, attributes: true, attributeFilter: ["selected","value"] });
  document.addEventListener("click", (e) => { if (!wrap.contains(e.target)) close(); });
}

function enhanceNativeSelects(root = document) {
  root.querySelectorAll("#card-env select.control").forEach(enhanceNativeSelect);
}

export default function PilotEnvironment({ mode = "pilot" }) { 
  const { env, setEnv } = useEnvironment();
  const inProduction = String(mode).toLowerCase() === "production";
  const userRole = sessionStorage.getItem("user_role") || "Admin";
  const isEUC = userRole === "EUC";

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [baselines, setBaselines] = useState([]);
  const [groups, setGroups] = useState([]); 
  const abortRef = useRef(null);

  useEffect(() => {
    const handleResize = () => { document.querySelectorAll('#card-env .fx-wrap.fx-open').forEach(wrap => { wrap.classList.remove('fx-open'); }); };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  async function loadOptions() {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      setLoading(true); setErr("");
      const groupPromise = fetch(`${API_BASE}/api/groups/list`, { headers: getHeaders(), signal: controller.signal }).then(r => r.json());
      const baselinePromise = fetch(`${API_BASE}/api/baselines/list`, { headers: getHeaders(), signal: controller.signal }).then(r => r.json());
      const [bRes, gRes] = await Promise.all([baselinePromise, groupPromise]);

      const bNames = (bRes.baselines || []).map(b => b.name).sort();
      const gNames = (gRes.groups || []).map(g => g.name).sort();

      setBaselines(bNames);
      setGroups(gNames); 

      setEnv((f) => ({
        ...f,
        baseline: bNames.includes(f.baseline) ? f.baseline : (bNames[0] || ""),
        pilotGroup: inProduction ? (f.pilotGroup || "") : (gNames.includes(f.pilotGroup) ? f.pilotGroup : (gNames[0] || "")),
        prodGroup: inProduction ? (gNames.includes(f.prodGroup) ? f.prodGroup : (gNames[0] || "")) : (f.prodGroup || ""), 
        successThreshold: f.successThreshold ?? 90,
        allowableCriticalHF: f.allowableCriticalHF ?? 0,
        patchWindowDays: f.patchWindowDays ?? 2,
        patchWindowHours: f.patchWindowHours ?? 0,
        patchWindowMinutes: f.patchWindowMinutes ?? 0,
      }));
    } catch (e) {
      if (e.name !== "AbortError") setErr(`Failed to load options: ${e.message}`);
    } finally {
      setLoading(false);
      setTimeout(() => enhanceNativeSelects(document), 100);
    }
  }

  useEffect(() => { loadOptions(); return () => abortRef.current?.abort(); }, [mode]); 
  useEffect(() => { if (!loading) { const t = setTimeout(() => enhanceNativeSelects(document), 100); return () => clearTimeout(t); } }, [baselines, groups, loading]);

  const on = (k) => (e) => setEnv((f) => ({ ...f, [k]: e.target.type === "checkbox" ? e.target.checked : e.target.type === "number" ? Number(e.target.value) : e.target.value }));
  const onNumber = (k, min = 0, max = 999) => (e) => { let val = parseInt(e.target.value, 10); if (isNaN(val) || val < min) val = min; if (val > max) val = max; setEnv((f) => ({ ...f, [k]: val })); };

  const baselineOptions = useMemo(() => baselines.map((x) => <option key={x} value={x}>{x}</option>), [baselines]);
  const groupOptions = useMemo(() => groups.map((x) => <option key={x} value={x}>{x}</option>), [groups]);
  const disabled = loading || (!baselines.length && !groups.length);

  return (
    <section className="card reveal mb-0" id="card-env" data-reveal>
      <div className="env-header-row">
        <h2>Environment &amp; Baseline</h2>
        <button type="button" onClick={loadOptions} disabled={loading} className="btn outline small" title="Reload">{loading ? "Loading…" : ""}
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2"></path></svg>
        </button>
      </div>

      {loading && <div className="sub">loading baselines &amp; groups…</div>}
      {err && <div className="env-error-msg">{err}</div>}

      <div className={`env-inputs-row ${loading ? 'opacity-60' : ''}`}>
        <div className="field">
          <span className="label">Baseline</span>
          <select className="control" value={env.baseline} onChange={on("baseline")} disabled={disabled || !baselines.length}>
            {!baselines.length && <option value="">— loading… —</option>}
            {baselines.length > 0 && <option value="">— select baseline —</option>}
            {baselineOptions}
          </select>
        </div>

        <div className="field">
          <span className="label">{inProduction ? "Production Group" : "Pilot Group"}</span>
          <select className="control" value={inProduction ? env.prodGroup : env.pilotGroup} onChange={on(inProduction ? "prodGroup" : "pilotGroup")} disabled={disabled || !groups.length}>
            {!groups.length && <option value="">— loading… —</option>}
            {groups.length > 0 && <option value="">— select group —</option>}
            {groupOptions}
          </select>
        </div>
      </div>

      {!isEUC && (
        <div className="row mt-14">
          <div className="field">
            <div className="label">Success Threshold (%)</div>
            <input type="number" className="control" min={0} max={100} value={env.successThreshold ?? 90} onChange={on("successThreshold")} />
          </div>
          <div className="field">
            <div className="label">Allowable Critical Health Failures</div>
            <input type="number" className="control" min={0} value={env.allowableCriticalHF ?? 0} onChange={on("allowableCriticalHF")} />
          </div>
          <div className="field flex-15">
            <span className="label">Patch Window (Days / Hours / Mins)</span>
            <div className="env-patch-window-inputs">
              <input type="number" className="control env-patch-input" title="Days" min={0} value={env.patchWindowDays ?? 0} onChange={onNumber("patchWindowDays", 0)} disabled={loading} />
              <input type="number" className="control env-patch-input" title="Hours" min={0} max={23} value={env.patchWindowHours ?? 0} onChange={onNumber("patchWindowHours", 0, 23)} disabled={loading} />
              <input type="number" className="control env-patch-input" title="Minutes" min={0} max={59} value={env.patchWindowMinutes ?? 0} onChange={onNumber("patchWindowMinutes", 0, 59)} disabled={loading} />
            </div>
          </div>
        </div>
      )}
    </section>
  );
}