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
  if (selectEl.disabled) wrap.classList.add("disabled");
  selectEl.parentNode.insertBefore(wrap, selectEl);
  wrap.appendChild(selectEl);
  
  const selectedOption = selectEl.options[selectEl.selectedIndex];
  const displayText = selectedOption ? selectedOption.text : "— select —";
  const isPlaceholder = !selectedOption || selectedOption.value === "";
  
  const trigger = document.createElement("button");
  trigger.type = "button";
  trigger.className = "fx-trigger";
  trigger.disabled = selectEl.disabled;
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
  let visibleItems = [];

  const isRealOption = (o) => {
    const txt = (o.textContent || "").trim().toLowerCase();
    return !o.disabled && o.value !== "" && !/^—.*—$/.test(txt);
  };
  const itemsOnly = () => allOptions.filter(isRealOption);

  function renderMenu() {
    menuInner.innerHTML = "";
    const realItems = itemsOnly();
    
    const searchWrap = document.createElement("div");
    searchWrap.style.padding = "8px";
    searchWrap.style.borderBottom = "1px solid var(--border)";
    searchWrap.style.position = "sticky";
    searchWrap.style.top = "0";
    searchWrap.style.backgroundColor = "var(--panel)";
    searchWrap.style.zIndex = "10";
    
    const searchInput = document.createElement("input");
    searchInput.type = "text";
    searchInput.className = "control";
    searchInput.placeholder = "Search...";
    searchInput.style.width = "100%";
    searchInput.style.height = "32px";
    searchInput.style.fontSize = "13px";
    
    searchInput.addEventListener("click", e => e.stopPropagation());
    searchInput.addEventListener("keydown", e => {
      if (e.key === "Escape") { e.stopPropagation(); close(); }
      if (e.key === "Enter") {
          e.stopPropagation(); e.preventDefault();
          if (hoverIdx >= 0 && visibleItems[hoverIdx]) commitNode(visibleItems[hoverIdx]);
      }
      if (e.key === "ArrowDown") {
          e.stopPropagation(); e.preventDefault();
          setHover((hoverIdx + 1) % visibleItems.length);
      }
      if (e.key === "ArrowUp") {
          e.stopPropagation(); e.preventDefault();
          setHover((hoverIdx - 1 + visibleItems.length) % visibleItems.length);
      }
    });
    
    searchWrap.appendChild(searchInput);
    menuInner.appendChild(searchWrap);
    
    const listWrap = document.createElement("div");
    menuInner.appendChild(listWrap);

    if (realItems.length === 0) {
      const emptyMsg = document.createElement("div");
      emptyMsg.className = "fx-item fx-empty";
      emptyMsg.textContent = "No options";
      listWrap.appendChild(emptyMsg);
      return;
    }

    const itemNodes = [];
    realItems.forEach((option, originalIndex) => {
      const it = document.createElement("div");
      it.className = "fx-item" + (option.selected ? " fx-active" : "");
      it.dataset.origIndex = String(originalIndex);
      it.setAttribute("role", "option");
      it.setAttribute("aria-selected", option.selected);
      it.innerHTML = `<span class="fx-label">${option.textContent}</span>`;
      
      it.addEventListener("mouseenter", () => {
         const vIdx = visibleItems.indexOf(it);
         if (vIdx >= 0) setHover(vIdx);
      });
      it.addEventListener("mousedown", (e) => e.preventDefault());
      it.addEventListener("click", () => commitNode(it));
      
      listWrap.appendChild(it);
      itemNodes.push(it);
    });

    visibleItems = [...itemNodes];

    searchInput.addEventListener("input", (e) => {
        const term = e.target.value.toLowerCase();
        visibleItems = [];
        itemNodes.forEach((node) => {
            if (node.textContent.toLowerCase().includes(term)) {
                node.style.display = "";
                visibleItems.push(node);
            } else {
                node.style.display = "none";
            }
        });
        setHover(0);
    });
    
    setTimeout(() => searchInput.focus(), 10);
    const currentIndex = visibleItems.findIndex(o => o.classList.contains("fx-active"));
    setHover(currentIndex >= 0 ? currentIndex : 0);
  }

  function setHover(i) {
    if (visibleItems.length === 0) return;
    hoverIdx = Math.max(0, Math.min(i, visibleItems.length - 1));
    visibleItems.forEach((n, j) => n.classList.toggle("fx-hover", j === hoverIdx));
    const el = visibleItems[hoverIdx];
    if (el) el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }

  function commitNode(node) {
    const origIndex = parseInt(node.dataset.origIndex, 10);
    const realItems = itemsOnly();
    const chosen = realItems[origIndex];
    if (!chosen) return;
    allOptions.forEach(o => o.selected = false);
    chosen.selected = true;
    selectEl.value = chosen.value;
    const valEl = trigger.querySelector(".fx-value");
    valEl.textContent = chosen.textContent;
    valEl.classList.remove("fx-placeholder");
    close();
    selectEl.dispatchEvent(new Event("change", { bubbles: true }));
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
    menu.style.left = "";
    menu.style.right = "";
  }

  function onDocDown(e) { if (!wrap.contains(e.target)) close(); }

  trigger.addEventListener("click", (e) => {
    e.stopPropagation();
    wrap.classList.contains("fx-open") ? close() : open();
  });
  
  trigger.addEventListener("keydown", (e) => {
    const isOpen = wrap.classList.contains("fx-open");
    if (!isOpen && ["ArrowDown", "Enter", " "].includes(e.key)) {
      e.preventDefault(); open(); return;
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
    
    if (selectEl.disabled) {
      wrap.classList.add("disabled");
      trigger.disabled = true;
    } else {
      wrap.classList.remove("disabled");
      trigger.disabled = false;
    }
  });
  obs.observe(selectEl, { childList: true, subtree: true, attributes: true, attributeFilter: ["selected","value", "disabled"] });
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
      
      const configPromise = fetch(`${API_BASE}/api/config`, { headers: getHeaders(), signal: controller.signal })
        .then(async r => {
            if (!r.ok) return {};
            try { return await r.json(); } catch { return {}; }
        }).catch(() => ({}));

      const [bRes, gRes, cConfig] = await Promise.all([baselinePromise, groupPromise, configPromise]);

      const bNames = (bRes.baselines || []).map(b => b.name).sort();
      const gNames = (gRes.groups || []).map(g => g.name).sort();

      setBaselines(bNames);
      setGroups(gNames); 

      setEnv((f) => {
          let safeBaseline = f.baseline;
          // If empty or invalid, try to pull from the last successful stage
          if (!safeBaseline || !bNames.includes(safeBaseline)) {
              safeBaseline = inProduction ? (cConfig.lastPilotBaseline || cConfig.lastSandboxBaseline) : cConfig.lastSandboxBaseline;
          }
          const finalBaseline = (safeBaseline && bNames.includes(safeBaseline)) ? safeBaseline : "";
          
          let currentGroupField = inProduction ? f.prodGroup : f.pilotGroup;
          let safeGroup = currentGroupField;
          
          if (!safeGroup || !gNames.includes(safeGroup)) {
              // Gracefully cascade forward: Prod falls back to Pilot context -> Sandbox context -> DB
              if (!inProduction) {
                  safeGroup = (f.sbxGroup && gNames.includes(f.sbxGroup)) ? f.sbxGroup : cConfig.lastSandboxGroup;
              } else {
                  safeGroup = (f.pilotGroup && gNames.includes(f.pilotGroup)) ? f.pilotGroup :
                              (f.sbxGroup && gNames.includes(f.sbxGroup)) ? f.sbxGroup :
                              (cConfig.lastPilotGroup || cConfig.lastSandboxGroup);
              }
          }
          const finalGroup = (safeGroup && gNames.includes(safeGroup)) ? safeGroup : "";
          
          // NMOs get threshold context correctly mapped in state
          const st = cConfig.successThreshold != null ? Number(cConfig.successThreshold) : (f.successThreshold ?? 90);
          const hf = cConfig.allowableCriticalHF != null ? Number(cConfig.allowableCriticalHF) : (f.allowableCriticalHF ?? 0);

          return {
              ...f,
              baseline: finalBaseline,
              [inProduction ? 'prodGroup' : 'pilotGroup']: finalGroup,
              
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
      setTimeout(() => enhanceNativeSelects(document), 100);
    }
  }

  useEffect(() => { loadOptions(); return () => abortRef.current?.abort(); }, [mode]); 
  useEffect(() => { if (!loading) { const t = setTimeout(() => enhanceNativeSelects(document), 100); return () => clearTimeout(t); } }, [baselines, groups, loading]);

  const on = (k) => (e) => {
      const val = e.target.value;
      setEnv((f) => ({
        ...f,
        [k]: e.target.type === "checkbox" ? e.target.checked : val,
      }));
  };

  const handleNumChange = (k) => (e) => {
      const val = e.target.value;
      if (val === "") setEnv(f => ({ ...f, [k]: "" }));
      else setEnv(f => ({ ...f, [k]: Number(val) }));
  };

  const handleBlur = (k, min = 0, max = 999) => () => {
      setEnv(f => {
          let num = Number(f[k]);
          if (!Number.isFinite(num) || f[k] === "") num = min;
          num = Math.min(max, Math.max(min, num));
          return { ...f, [k]: num };
      });
  };

  const baselineOptions = useMemo(() => baselines.map((x) => <option key={x} value={x}>{x}</option>), [baselines]);
  const groupOptions = useMemo(() => groups.map((x) => <option key={x} value={x}>{x}</option>), [groups]);
  const disabled = loading || (!baselines.length && !groups.length);
  
  const inputsLocked = !env[`${mode}Unlocked`]; 

  return (
    <section className="card reveal mb-0" id="card-env" data-reveal>
      <div className="env-header-row">
        <h2>Environment &amp; Baseline</h2>
        <button type="button" onClick={loadOptions} disabled={loading} className="btn outline small" title="Reload">{loading ? "Loading…" : ""}
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16"><path d="M23 4v6h-6"></path><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path></svg>
        </button>
      </div>

      {loading && <div className="sub">loading baselines &amp; groups…</div>}
      {err && <div className="env-error-msg">{err}</div>}

      <div className={`env-inputs-row ${loading ? 'opacity-60' : ''}`}>
        <div className="field">
          <span className="label">Baseline</span>
          <select className="control" value={env.baseline} onChange={on("baseline")} disabled={disabled || !baselines.length || inputsLocked}>
            {!baselines.length && <option value="">— loading… —</option>}
            {baselines.length > 0 && <option value="">— select baseline —</option>}
            {baselineOptions}
          </select>
        </div>

        <div className="field">
          <span className="label">{inProduction ? "Production Group" : "Pilot Group"}</span>
          <select 
            className="control" 
            value={inProduction ? env.prodGroup : env.pilotGroup} 
            onChange={on(inProduction ? "prodGroup" : "pilotGroup")} 
            disabled={disabled || !groups.length || (!env[`${mode}Evaluated`] && inputsLocked)}
          >
            {!groups.length && <option value="">— loading… —</option>}
            {groups.length > 0 && <option value="">— select group —</option>}
            {groupOptions}
          </select>
        </div>
      </div>

      {!isEUC && (
        <div className="row mt-14">
          <div className="field">
            <div className="label">Success Threshold (%) <span title="Configured by Admin in Environment Settings" style={{cursor:'help', opacity:0.6}}>🔒</span></div>
            <input type="number" className="control disabled" value={env.successThreshold ?? 90} disabled={true} />
          </div>
          <div className="field">
            <div className="label">Allowable Critical Health Failures <span title="Configured by Admin in Environment Settings" style={{cursor:'help', opacity:0.6}}>🔒</span></div>
            <input type="number" className="control disabled" value={env.allowableCriticalHF ?? 0} disabled={true} />
          </div>
          <div className="field flex-15">
            <span className="label">Patch Window (Days / Hours / Mins)</span>
            <div className="env-patch-window-inputs">
              <input type="number" className={`control env-patch-input ${inputsLocked ? 'disabled' : ''}`} title="Days" min={0} value={env.patchWindowDays ?? 0} onChange={handleNumChange("patchWindowDays")} onBlur={handleBlur("patchWindowDays", 0, 999)} disabled={inputsLocked} />
              <input type="number" className={`control env-patch-input ${inputsLocked ? 'disabled' : ''}`} title="Hours" min={0} max={23} value={env.patchWindowHours ?? 0} onChange={handleNumChange("patchWindowHours")} onBlur={handleBlur("patchWindowHours", 0, 23)} disabled={inputsLocked} />
              <input type="number" className={`control env-patch-input ${inputsLocked ? 'disabled' : ''}`} title="Minutes" min={0} max={59} value={env.patchWindowMinutes ?? 0} onChange={handleNumChange("patchWindowMinutes")} onBlur={handleBlur("patchWindowMinutes", 0, 59)} disabled={inputsLocked} />
            </div>
          </div>
        </div>
      )}
    </section>
  );
}