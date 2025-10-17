// src/components/Header.jsx
import { useEffect, useState } from "react";

function getInitialTheme() {
  // safe for SSR/first paint
  if (typeof window === "undefined") return "light";
  const saved = localStorage.getItem("theme");
  if (saved) return saved;
  // optional: follow OS preference on first load
  return window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

function Header() {
  const [theme, setTheme] = useState(getInitialTheme);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    try { localStorage.setItem("theme", theme); } catch {}
  }, [theme]);

  const toggleTheme = () => setTheme(t => (t === "light" ? "dark" : "light"));

  return (
    <header>
      <div className="nav container">
        <div className="brand">
          <div className="logo-wrap spin">
            <img src="./src/assets/bigfix-logo.jpg" alt="BigFix logo" />
          </div>
          BigFix Patch Orchestrator
        </div>
        <div className="badges">
          <span className="chip">Sandbox → Pilot → Production</span>
          <span className="chip">Auto-Promotion with Gates</span>
        </div>
        <div className="spacer" />
        <div className="toolbar">
          <button className="iconbtn" onClick={toggleTheme} title="Toggle Theme" aria-label="Toggle Theme">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="5"></circle><line x1="12" y1="1" x2="12" y2="3"></line><line x1="12" y1="21" x2="12" y2="23"></line><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line><line x1="1" y1="12" x2="3" y2="12"></line><line x1="21" y1="12" x2="23" y2="12"></line><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line>
            </svg>
          </button>
        </div>
      </div>
    </header>
  );
}

export default Header