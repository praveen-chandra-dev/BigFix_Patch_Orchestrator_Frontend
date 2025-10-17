// components/pilot/PilotEnvironment.jsx
import { useEffect, useMemo, useRef, useState } from "react";
import { useEnvironment } from "../Environment.jsx";

/** Node server base */
const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:5174";

/* ---------- BigFix JSON parsing (same as Sandbox) ---------- */
function collectStrings(node, out) {
  if (node == null) return;
  const t = typeof node;
  if (t === "string") {
    const s = node.trim();
    if (s && !s.startsWith("<")) out.push(s);
    return;
  }
  if (t === "number" || t === "boolean") { out.push(String(node)); return; }
  if (Array.isArray(node)) { for (const x of node) collectStrings(x, out); return; }
  if (t === "object") {
    if ("Answer" in node) collectStrings(node.Answer, out);
    if ("result" in node) collectStrings(node.result, out);
    if ("TupleResult" in node) collectStrings(node.TupleResult, out);
    if ("PluralResult" in node) collectStrings(node.PluralResult, out);
    for (const k of Object.keys(node)) {
      if (["Answer","result","TupleResult","PluralResult"].includes(k)) continue;
      collectStrings(node[k], out);
    }
  }
}
function parseBFStrings(json) {
  const out = [];
  const rows = Array.isArray(json?.result) ? json.result : [];
  for (const r of rows) collectStrings(r, out);
  const uniq = [...new Set(out)];
  uniq.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
  return uniq;
}
async function bfQuery(relevance, signal) {
  const url = `${API_BASE}/api/query?relevance=${encodeURIComponent(relevance)}`;
  const resp = await fetch(url, { headers: { Accept: "application/json" }, signal });
  const text = await resp.text();
  if (!resp.ok) throw new Error(`HTTP ${resp.status}: ${text.slice(0, 200)}`);
  let json; try { json = JSON.parse(text); } catch { throw new Error(`Unexpected (not JSON): ${text.slice(0,200)}`); }
  return parseBFStrings(json);
}

/* ---------- Enhanced native select with zoom-resistant positioning ---------- */
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
    
    // Choose direction based on available space
    if (spaceBelow < 200 && spaceAbove > 200) {
      menu.classList.add("fx-upward");
    } else {
      menu.classList.remove("fx-upward");
    }

    wrap.classList.add("fx-open");
    trigger.setAttribute("aria-expanded", "true");
    renderMenu();
    document.addEventListener("mousedown", onDocDown);

    // Set consistent width using offsetWidth for zoom resilience
    const triggerWidth = trigger.offsetWidth;
    menu.style.width = triggerWidth + "px";
    menu.style.minWidth = triggerWidth + "px";
    menu.style.maxWidth = triggerWidth + "px";
    
    // Ensure menu stays within viewport horizontally
    const menuRect = menu.getBoundingClientRect();
    if (menuRect.right > window.innerWidth) {
      const overflow = menuRect.right - window.innerWidth + 10;
      menu.style.left = "auto";
      menu.style.right = "0";
    } else {
      menu.style.left = "0";
      menu.style.right = "auto";
    }

    // Set max height to prevent overflow
    const MAX_H = 300;
    menu.style.maxHeight = MAX_H + "px";
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

    // Clean up runtime styles
    menu.style.width = "";
    menu.style.minWidth = "";
    menu.style.maxWidth = "";
    menu.style.maxHeight = "";
    menu.style.overflow = "";
    menu.style.left = "";
    menu.style.right = "";
  }

  function onDocDown(e) { 
    if (!wrap.contains(e.target)) close(); 
  }

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

  // Event listeners
  trigger.addEventListener("click", (e) => { 
    e.stopPropagation(); 
    wrap.classList.contains("fx-open") ? close() : open(); 
  });

  trigger.addEventListener("keydown", (e) => {
    const isOpen = wrap.classList.contains("fx-open");
    const realItems = itemsOnly();
    if (!isOpen && ["ArrowDown","Enter"," "].includes(e.key)) { 
      e.preventDefault(); 
      open(); 
      return; 
    }
    if (!isOpen) return;
    switch (e.key) {
      case "Escape": 
        e.preventDefault(); 
        close(); 
        break;
      case "Enter":  
        e.preventDefault(); 
        if (hoverIdx >= 0) commit(hoverIdx); 
        break;
      case "ArrowDown": 
        e.preventDefault(); 
        setHover((hoverIdx + 1) % realItems.length); 
        break;
      case "ArrowUp":   
        e.preventDefault(); 
        setHover((hoverIdx - 1 + realItems.length) % realItems.length); 
        break;
    }
  });

  // Mutation observer for external changes
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
  obs.observe(selectEl, { 
    childList: true, 
    subtree: true, 
    attributes: true, 
    attributeFilter: ["selected","value"] 
  });

  // Close on outside click
  document.addEventListener("click", (e) => { 
    if (!wrap.contains(e.target)) close(); 
  });
}

function enhanceNativeSelects(root = document) {
  root.querySelectorAll("#card-env select.control").forEach(enhanceNativeSelect);
}

/* ----------------------------- Component ----------------------------- */
export default function PilotEnvironment() {
  const { env, setEnv } = useEnvironment();

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [baselines, setBaselines] = useState([]);
  const [groups, setGroups] = useState([]);
  const abortRef = useRef(null);

  // Handle window resize/zoom to close any open dropdowns
  useEffect(() => {
    const handleResize = () => {
      // Close any open dropdowns on resize/zoom
      document.querySelectorAll('#card-env .fx-wrap.fx-open').forEach(wrap => {
        wrap.classList.remove('fx-open');
      });
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  async function loadOptions() {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      setLoading(true); 
      setErr("");

      const [b, g] = await Promise.all([
        bfQuery("names of bes baselines", controller.signal),
        bfQuery("names of bes computer groups", controller.signal),
      ]);

      setBaselines(b);
      setGroups(g);

      setEnv((f) => ({
        ...f,
        baseline:   b.includes(f.baseline)   ? f.baseline   : (b[0] || ""),
        sbxGroup:   g.includes(f.sbxGroup)   ? f.sbxGroup   : (g.find(x => /sbx|sandbox/i.test(x)) || g[0] || ""),
        pilotGroup: g.includes(f.pilotGroup) ? f.pilotGroup : (g.find(x => /pilot/i.test(x)) || g[1] || g[0] || ""),
        prodGroup:  g.includes(f.prodGroup)  ? f.prodGroup  : (g.find(x => /prod|production/i.test(x)) || g[2] || g[0] || ""),
        // defaults if absent
        successThreshold: f.successThreshold ?? 90,
        allowableCriticalHF: f.allowableCriticalHF ?? 0,
        autoPromoteToProd: f.autoPromoteToProd ?? false,
      }));
    } catch (e) {
      if (e.name !== "AbortError") setErr(`Failed to load options: ${e.message}`);
    } finally {
      setLoading(false);
      // Enhance selects after a brief delay to ensure DOM is updated
      setTimeout(() => enhanceNativeSelects(document), 100);
    }
  }

  useEffect(() => {
    loadOptions();
    return () => abortRef.current?.abort();
  }, []);

  useEffect(() => {
    if (!loading) {
      const t = setTimeout(() => enhanceNativeSelects(document), 100);
      return () => clearTimeout(t);
    }
  }, [baselines, groups, loading]);

  const on = (k) => (e) =>
    setEnv((f) => ({
      ...f,
      [k]:
        e.target.type === "checkbox"
          ? e.target.checked
          : e.target.type === "number"
          ? Number(e.target.value)
          : e.target.value,
    }));

  const baselineOptions = useMemo(
    () => baselines.map((x) => <option key={x} value={x}>{x}</option>),
    [baselines]
  );
  const groupOptions = useMemo(
    () => groups.map((x) => <option key={x} value={x}>{x}</option>),
    [groups]
  );
  const disabled = loading || (!baselines.length && !groups.length);

  return (
    <section className="card reveal" id="card-env" data-reveal>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}>
        <h2>Environment &amp; Baseline</h2>
        <button type="button" onClick={loadOptions} disabled={loading} className="btn" title="Reload">
          {loading ? "Loading…" : "Reload"}
        </button>
      </div>

      {loading && <div className="sub">loading baselines &amp; groups…</div>}
      {err && <div style={{ color: "#b00020", marginBottom: 12 }}>{err}</div>}

      {/* Select row with improved responsive layout */}
      <div className="row" style={{ alignItems: "flex-end", opacity: loading ? 0.6 : 1 }}>
        <div className="field">
          <span className="label">Baseline</span>
          <select className="control" value={env.baseline} onChange={on("baseline")} disabled={disabled || !baselines.length}>
            {!baselines.length && <option value="">— loading… —</option>}
            {baselines.length > 0 && <option value="">— select baseline —</option>}
            {baselineOptions}
          </select>
        </div>

        <div className="field">
          <span className="label">Pilot Group</span>
          <select className="control" value={env.pilotGroup} onChange={on("pilotGroup")} disabled={disabled || !groups.length}>
            {!groups.length && <option value="">— loading… —</option>}
            {groups.length > 0 && <option value="">— select group —</option>}
            {groupOptions}
          </select>
        </div>
      </div>

      {/* Thresholds & Auto-promote */}
      <div className="row" style={{ marginTop: 12 }}>
        <div className="field">
          <div className="label">Success Threshold (%)</div>
          <input
            type="number"
            className="control"
            min={0}
            max={100}
            value={env.successThreshold ?? 90}
            onChange={on("successThreshold")}
          />
        </div>

        <div className="field">
          <div className="label">Allowable Critical Health Failures</div>
          <input
            type="number"
            className="control"
            min={0}
            value={env.allowableCriticalHF ?? 0}
            onChange={on("allowableCriticalHF")}
          />
        </div>

        <div className="field" style={{ minWidth: 260 }}>
          <div className="label">&nbsp;</div>
          <div style={{ display: "flex", alignItems: "center", gap: 12, height: 48 }}>
            <label className="switch">
              <input
                type="checkbox"
                checked={!!(env.autoPromoteToProd ?? false)}
                onChange={on("autoPromoteToProd")}
              />
              <span className="slider round"></span>
            </label>
            <span className="sub">Auto-promote to Production</span>
          </div>
        </div>
      </div>

      <div className="sub" style={{ marginTop: 10 }}>
        Sandbox → Pilot → Production. Trigger Pilot only in Pilot stage. Promote after Evaluate.
      </div>
    </section>
  );
}