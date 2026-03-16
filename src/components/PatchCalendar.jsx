// src/components/PatchCalendar.jsx
import { useState, useMemo, useEffect, useRef } from "react";
import FilterDrawer from "./FilterDrawer";

const DAYS_WEEK = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
];

const CSV_HEADER = "Server,Day,Month,Year,Time,Operating System";
const SAMPLE_CSV = `Server-Win-01,15,January,2025,10:00 AM,Windows
Server-Win-02,16,January,2025,10:30 AM,Windows
DB-Linux-01,20,February,2025,02:00 PM,Linux`;

const API_BASE = window.env?.VITE_API_BASE || "http://localhost:5174";

export default function PatchCalendar({ onClose, userRole }) {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  
  const [viewMode, setViewMode] = useState("CALENDAR"); // 'CALENDAR' or 'LIST'
  const [selectedDateFilter, setSelectedDateFilter] = useState(null); // Stores the clicked date from the calendar

  const isAdmin = (userRole || "").toLowerCase() === "admin";

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth(); 
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDayOffset = new Date(year, month, 1).getDay(); 

  // Filter Drawer State
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [globalLogic, setGlobalLogic] = useState("AND");
  const [filters, setFilters] = useState([]);
  const propertyOptions = [
    { value: "server", label: "Server Name" },
    { value: "os", label: "Operating System" },
    { value: "time", label: "Time" },
    { value: "month", label: "Month" }
  ];

  // Toolbar, Pagination & Sorting State for List View
  const [currentPage, setCurrentPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [sortConfig, setSortConfig] = useState({ key: null, direction: "asc" });
  const [showColDrop, setShowColDrop] = useState(false);
  const [showExpDrop, setShowExpDrop] = useState(false);
  
  const colRef = useRef(null);
  const expRef = useRef(null);

  const [cols, setCols] = useState([
    { id: 'server', label: 'Server', show: true },
    { id: 'date', label: 'Date', show: true },
    { id: 'time', label: 'Time', show: true },
    { id: 'os', label: 'OS', show: true }
  ]);

  useEffect(() => {
    const handleOutside = (e) => {
      if (colRef.current && !colRef.current.contains(e.target)) setShowColDrop(false);
      if (expRef.current && !expRef.current.contains(e.target)) setShowExpDrop(false);
    };
    document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, []);

  useEffect(() => { fetchEvents(); }, [userRole]); 

  const fetchEvents = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch(`${API_BASE}/api/calendar?role=${encodeURIComponent(userRole)}`);
      const data = await res.json();
      if (data.ok) setEvents(data.events || []);
    } catch (err) { 
      setError("Failed to fetch schedule data.");
      console.error(err); 
    } finally { setLoading(false); }
  };

  const prevMonth = () => setCurrentDate(new Date(year, month - 1, 1));
  const nextMonth = () => setCurrentDate(new Date(year, month + 1, 1));
  const goToToday = () => setCurrentDate(new Date());

  const downloadTemplate = () => {
    const blob = new Blob([`${CSV_HEADER}\n${SAMPLE_CSV}`], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "patch_schedule_template.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setError(null);
    const reader = new FileReader();
    reader.onload = (evt) => parseCSV(evt.target.result);
    reader.readAsText(file);
    e.target.value = null; 
  };

  const parseCSV = async (text) => {
    const lines = text.split(/\r?\n/);
    const newEvents = [];
    const nowYear = new Date().getFullYear();
    const startIndex = lines[0].toLowerCase().startsWith("server") ? 1 : 0;

    for (let i = startIndex; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;
      const parts = line.split(",");
      if (parts.length < 6) continue; 

      const server = parts[0].trim();
      const day = parseInt(parts[1].trim(), 10);
      const monthRaw = parts[2].trim();
      const yr = parseInt(parts[3].trim(), 10);
      const time = parts[4].trim();
      const os = parts[5].trim(); 

      let monthIndex = -1;
      if (!isNaN(monthRaw)) monthIndex = parseInt(monthRaw, 10) - 1;
      else monthIndex = MONTH_NAMES.findIndex(m => m.toLowerCase() === monthRaw.toLowerCase());

      if (!server || isNaN(day) || monthIndex === -1 || isNaN(yr) || !os) continue;

      if (yr !== nowYear) { setError(`Error: Row ${i+1} has year ${yr}. Only current year (${nowYear}) is allowed.`); return; }
      newEvents.push({ server, day, monthIndex, year: yr, time, os });
    }
    
    if (newEvents.length === 0) { setError("No valid events found in CSV."); return; }

    try {
      setLoading(true);
      const res = await fetch(`${API_BASE}/api/calendar`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ events: newEvents })
      });
      const data = await res.json();
      if (data.ok) { setEvents(newEvents); alert("Schedule uploaded successfully!"); } 
      else { setError("Failed to save: " + (data.error || "Unknown error")); }
    } catch (err) { setError("Network error saving schedule."); } finally { setLoading(false); }
  };

  // --- Filtering Logic ---
  const applyFilters = (item) => {
    if (!filters.length) return true;
    let globalMatch = globalLogic === "OR" ? false : true;
    let validBlocks = 0;

    for (let b of filters) {
      let blockMatch = true;
      let validConds = 0;

      for (let c of b.conds) {
        if (!c.value) continue;
        validConds++;
        let condition = true;
        const search = String(c.value).toLowerCase();
        
        let field = "";
        if (c.column === "month") field = MONTH_NAMES[item.monthIndex].toLowerCase();
        else field = String(item[c.column] || "").toLowerCase();

        if (c.operator === "contains") condition = field.includes(search);
        else if (c.operator === "=") condition = field === search;
        else if (c.operator === "!=") condition = field !== search;
        
        blockMatch = blockMatch && condition;
      }
      if (validConds > 0) {
        validBlocks++;
        globalMatch = globalLogic === "OR" ? (globalMatch || blockMatch) : (globalMatch && blockMatch);
      }
    }
    return validBlocks === 0 ? true : globalMatch;
  };

  // Base filter (Drawer Filters) applied to EVERYTHING
  const baseFilteredEvents = useMemo(() => events.filter(applyFilters), [events, filters, globalLogic]);

  // List filter (Drawer Filters + Specific Calendar Day Clicked)
  const listFilteredEvents = useMemo(() => {
    if (viewMode === 'LIST' && selectedDateFilter) {
      return baseFilteredEvents.filter(ev => 
        ev.year === selectedDateFilter.year && 
        ev.monthIndex === selectedDateFilter.monthIndex && 
        ev.day === selectedDateFilter.day
      );
    }
    return baseFilteredEvents;
  }, [baseFilteredEvents, viewMode, selectedDateFilter]);


  // --- Calendar Specific Logic ---
  const eventsByDate = useMemo(() => {
    const map = {}; 
    baseFilteredEvents.forEach(ev => {
      if (ev.year === year && ev.monthIndex === month) {
        if (!map[ev.day]) map[ev.day] = [];
        map[ev.day].push(ev);
      }
    });
    return map;
  }, [baseFilteredEvents, year, month]);

  const handleDayClick = (day, dayEvents) => {
    if (!dayEvents || dayEvents.length === 0) return;
    
    // Set the filter for the specific day clicked and switch to list view
    setSelectedDateFilter({ year, monthIndex: month, day });
    setViewMode("LIST");
    setCurrentPage(1);
  };

  // --- List View Specific Logic ---
  const sortedEvents = useMemo(() => {
    let sortableItems = [...listFilteredEvents];
    if (sortConfig.key) {
      sortableItems.sort((a, b) => {
        let aVal = a[sortConfig.key] || "";
        let bVal = b[sortConfig.key] || "";
        
        if (sortConfig.key === 'date') {
            aVal = new Date(a.year, a.monthIndex, a.day).getTime();
            bVal = new Date(b.year, b.monthIndex, b.day).getTime();
        } else {
            aVal = String(aVal).toLowerCase();
            bVal = String(bVal).toLowerCase();
        }

        if (aVal < bVal) return sortConfig.direction === "asc" ? -1 : 1;
        if (aVal > bVal) return sortConfig.direction === "asc" ? 1 : -1;
        return 0;
      });
    }
    return sortableItems;
  }, [listFilteredEvents, sortConfig]);

  const totalPages = Math.ceil(sortedEvents.length / rowsPerPage);
  const paginatedEvents = sortedEvents.slice((currentPage - 1) * rowsPerPage, currentPage * rowsPerPage);

  useEffect(() => { setCurrentPage(1); }, [filters, rowsPerPage, viewMode, selectedDateFilter]);

  const handleSort = (key) => setSortConfig(prev => ({ key, direction: prev.key === key && prev.direction === "asc" ? "desc" : "asc" }));
  const getSortArrow = (key) => sortConfig.key !== key ? "" : sortConfig.direction === "asc" ? " ↑" : " ↓";

  const handleExport = (fmt) => { 
    setShowExpDrop(false); 
    if (fmt === 'CSV') {
        const header = cols.filter(c => c.show).map(c => c.label);
        const rows = sortedEvents.map(p => cols.filter(c => c.show).map(c => {
            if (c.id === 'date') return `"${MONTH_NAMES[p.monthIndex]} ${p.day}, ${p.year}"`;
            return `"${p[c.id] || ""}"`;
        }));
        const csv = [header.join(','), ...rows.map(r => r.join(','))].join('\n');
        const blob = new Blob([csv], { type: "text/csv" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url; a.download = "patch_schedule_export.csv"; a.click();
    }
  };

  const activeFilterCount = filters.reduce((acc, b) => acc + b.conds.filter(c => c.value).length, 0);

  return (
    <div className="card reveal" style={{ minHeight: '100%', display: 'flex', flexDirection: 'column', padding: 0, overflow: 'visible', boxShadow: 'none', border: 'none', background: 'transparent' }}>
      
      {/* KPI Details-style Sticky Header */}
      <div style={{ position: 'sticky', top: '-24px', background: 'var(--panel)', zIndex: 20, padding: '24px 32px 16px', borderBottom: '1px solid var(--border)', margin: '-24px -32px 24px -32px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: "22px", fontWeight: 600, color: "var(--text)" }}>Patch Calendar</h2>
          <div className="text-13 muted-text" style={{ marginTop: '4px' }}>Manage and view scheduled patch deployments.</div>
        </div>
        <div style={{ display: 'flex', gap: '12px' }}>
          
          {isAdmin && (
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginRight: '12px' }}>
              <button className="btn outline sec small" style={{ height: '36px' }} onClick={downloadTemplate}>Template</button>
              <label className="btn outline sec small" style={{ cursor: 'pointer', margin: 0, display: 'flex', alignItems: 'center', height: '36px' }}>
                {loading ? "..." : "Upload CSV"}
                <input type="file" accept=".csv" onChange={handleFileUpload} hidden disabled={loading} />
              </label>
              <div style={{ width: '1px', height: '24px', background: 'var(--border)', margin: '0 4px' }}></div>
            </div>
          )}

          {viewMode === "LIST" && (
            <>
              <div style={{ position: 'relative' }}>
                <button className="iconbtn" onClick={() => setDrawerOpen(true)} title="Filter Data">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16"><line x1="4" y1="21" x2="4" y2="14"></line><line x1="4" y1="10" x2="4" y2="3"></line><line x1="12" y1="21" x2="12" y2="12"></line><line x1="12" y1="8" x2="12" y2="3"></line><line x1="20" y1="21" x2="20" y2="16"></line><line x1="20" y1="12" x2="20" y2="3"></line><line x1="1" y1="14" x2="7" y2="14"></line><line x1="9" y1="8" x2="15" y2="8"></line><line x1="17" y1="16" x2="23" y2="16"></line></svg>
                </button>
                {activeFilterCount > 0 && <span className="pill blue" style={{ position: 'absolute', top: -8, right: -8, padding: '2px 6px', fontSize: 10 }}>{activeFilterCount}</span>}
              </div>
              <button className="iconbtn" onClick={fetchEvents} title="Refresh Data">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16"><path d="M23 4v6h-6"></path><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path></svg>
              </button>
            </>
          )}
        </div>
      </div>

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>

        {activeFilterCount > 0 && (
          <div className="active-filter-banner active" style={{ marginBottom: "16px" }}>
            <div className="filter-tags">
              {filters.map((b, bIdx) => {
                const validConds = b.conds.filter(c => c.value);
                if (!validConds.length) return null;
                return (
                  <div key={bIdx} style={{display:'inline-flex', alignItems:'center'}}>
                    {bIdx > 0 && <span style={{fontSize:12, fontWeight:600, color:'var(--primary)', margin:'0 8px'}}>{globalLogic}</span>}
                    {validConds.map((c, cIdx) => (
                      <span key={cIdx} style={{display:'inline-flex', alignItems:'center'}}>
                        {cIdx > 0 && <span style={{fontSize:11, fontWeight:600, color:'var(--primary)', margin:'0 6px'}}>AND</span>}
                        <span className="filter-tag"><strong>{propertyOptions.find(o => o.value === c.column)?.label || c.column}</strong>&nbsp;{c.operator}&nbsp;<strong>'{c.value}'</strong></span>
                      </span>
                    ))}
                  </div>
                );
              })}
            </div>
            <button className="btn outline" onClick={() => setFilters([])}>Clear Filters</button>
          </div>
        )}
        
        {error && <div className="banner error" style={{ marginBottom: "16px" }}>{error}</div>}

        <div className="tabs sub" style={{ marginBottom: '20px' }}>
            <button className={`tab small ${viewMode === 'CALENDAR' ? 'active' : ''}`} onClick={() => setViewMode('CALENDAR')}>Calendar View</button>
            <button className={`tab small ${viewMode === 'LIST' ? 'active' : ''}`} onClick={() => { setViewMode('LIST'); setSelectedDateFilter(null); }}>List View</button>
        </div>

        {/* --- CALENDAR VIEW --- */}
        {viewMode === "CALENDAR" && (
            <div className="calendar-layout fade-in" style={{ padding: 0 }}>
              <div className="cal-header-bar flex-row justify-between items-center w-full" style={{ marginBottom: '16px' }}>
                <div className="cal-nav-controls" style={{ margin: 0 }}>
                  <button onClick={prevMonth} className="cal-nav-btn">‹</button>
                  <span className="cal-date-label">{MONTH_NAMES[month]} {year}</span>
                  <button onClick={nextMonth} className="cal-nav-btn">›</button>
                  <button onClick={goToToday} className="btn outline small" style={{ marginLeft: '12px' }}>Today</button>
                </div>
                <div style={{ fontWeight: 600, color: 'var(--text)' }}>
                  {baseFilteredEvents.filter(e => e.year === year && e.monthIndex === month).length} Events This Month
                </div>
              </div>

              <div className="cal-grid-container" style={{ background: 'var(--panel)', borderRadius: '8px', border: '1px solid var(--border)' }}>
                <div className="cal-weekday-row">
                  {DAYS_WEEK.map(d => <div key={d} className="cal-weekday-cell">{d}</div>)}
                </div>

                <div className="cal-days-matrix">
                  {Array.from({ length: firstDayOffset }).map((_, i) => (
                    <div key={`empty-${i}`} className="cal-day-card empty" />
                  ))}

                  {Array.from({ length: daysInMonth }).map((_, i) => {
                    const day = i + 1;
                    const dayEvents = eventsByDate[day] || [];
                    const hasEvent = dayEvents.length > 0;
                    const isToday = new Date().getDate() === day && new Date().getMonth() === month && new Date().getFullYear() === year;

                    return (
                      <div key={day} className={`cal-day-card ${hasEvent ? "active" : ""} ${isToday ? "today" : ""}`} onClick={() => handleDayClick(day, dayEvents)}>
                        <div className="cal-day-header">
                          <span className="cal-day-num">{day}</span>
                        </div>
                        {hasEvent && (
                          <div className="cal-event-block">
                            <span className="cal-event-icon">⚙️</span>
                            <div className="cal-event-info">
                              <span className="cal-event-title">Patch Deployment</span>
                              <span className="cal-event-count">{dayEvents.length} Server{dayEvents.length > 1 ? 's' : ''}</span>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
        )}

        {/* --- LIST VIEW --- */}
        {viewMode === "LIST" && (
            <div className="fade-in" style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                <div className="grid-toolbar" style={{ margin: '0 0 16px 0', padding: 0 }}>
                    <div className="grid-toolbar-left" style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                      
                      {/* Active Date Filter Pill */}
                      {selectedDateFilter && (
                        <span className="pill blue" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                          {MONTH_NAMES[selectedDateFilter.monthIndex]} {selectedDateFilter.day}, {selectedDateFilter.year}
                          <button 
                            style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', padding: '0 0 0 4px', fontSize: '14px', lineHeight: 1 }} 
                            onClick={() => setSelectedDateFilter(null)}
                            title="Clear date filter"
                          >
                            ✕
                          </button>
                        </span>
                      )}
                    </div>
                    <div className="grid-toolbar-right" style={{ display: 'flex', gap: '12px' }}>
                        <div className="dropdown" ref={colRef}>
                            <button className="btn outline sec small" onClick={() => { setShowColDrop(!showColDrop); setShowExpDrop(false); }}>
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16"><line x1="8" y1="6" x2="21" y2="6"></line><line x1="8" y1="12" x2="21" y2="12"></line><line x1="8" y1="18" x2="21" y2="18"></line><line x1="3" y1="6" x2="3.01" y2="6"></line><line x1="3" y1="12" x2="3.01" y2="12"></line><line x1="3" y1="18" x2="3.01" y2="18"></line></svg>
                                &nbsp; Columns
                            </button>
                            {showColDrop && (
                                <div className="dropdown-menu show" style={{ minWidth: "220px", padding: "12px", right: 0 }}>
                                    <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                                        {cols.map((col, i) => (
                                            <label key={col.id} style={{ display: "flex", alignItems: "center", gap: "10px", cursor: "pointer", padding: "6px 12px", borderRadius: "4px", transition: "0.2s" }} onMouseOver={e=>e.currentTarget.style.background="#f8fafc"} onMouseOut={e=>e.currentTarget.style.background="transparent"}>
                                                <input type="checkbox" className="custom-checkbox" checked={col.show} onChange={e => {
                                                    const next = [...cols]; next[i].show = e.target.checked; setCols(next);
                                                }} />
                                                <span style={{ fontSize: "13px", fontWeight: 500 }}>{col.label}</span>
                                            </label>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>

                        <div className="dropdown" ref={expRef}>
                            <button className="btn outline small" onClick={() => { setShowExpDrop(!showExpDrop); setShowColDrop(false); }}>
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"></path></svg>
                                &nbsp; Export
                            </button>
                            {showExpDrop && (
                                <div className="dropdown-menu show" style={{ width: "280px", padding: "16px", right: 0 }}>
                                    <div style={{ fontSize: "11px", fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", marginBottom: "12px", letterSpacing: '0.05em' }}>Format</div>
                                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "8px", marginBottom: "20px" }}>
                                       {['CSV', 'PDF', 'HTML', 'TXT', 'JSON', 'XML'].map(fmt => (
                                         <button key={fmt} className="btn outline small" style={{ fontSize: '11px', height: '32px', padding: 0 }} onClick={() => handleExport(fmt)}>{fmt}</button>
                                       ))}
                                    </div>
                                    <div style={{ height: '1px', background: 'var(--border)', marginBottom: '16px' }}></div>
                                    <div style={{ fontSize: "11px", fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", marginBottom: "12px", letterSpacing: '0.05em' }}>Scope</div>
                                    <button className="item" onClick={() => handleExport('CSV')}>Filtered Data</button>
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                <div className="tableWrap border-top" style={{ flex: 1, overflow: 'auto', margin: '0 -32px', width: 'calc(100% + 64px)', borderLeft: 'none', borderRight: 'none', borderRadius: 0 }}>
                    {loading ? (
                        <div style={{ padding: "40px", textAlign: "center", color: "var(--muted)" }}>Loading records...</div>
                    ) : error ? (
                        <div style={{ padding: "40px", textAlign: "center", color: "var(--danger)" }}>{error}</div>
                    ) : (
                        <table>
                            <thead className="kpi-th-sticky">
                                <tr>
                                    {cols.find(c=>c.id==='server')?.show && <th className="cursor-pointer" onClick={() => handleSort('server')}>Server Name{getSortArrow('server')}</th>}
                                    {cols.find(c=>c.id==='date')?.show && <th className="cursor-pointer" onClick={() => handleSort('date')}>Date{getSortArrow('date')}</th>}
                                    {cols.find(c=>c.id==='time')?.show && <th className="cursor-pointer" onClick={() => handleSort('time')}>Time{getSortArrow('time')}</th>}
                                    {cols.find(c=>c.id==='os')?.show && <th className="cursor-pointer" onClick={() => handleSort('os')}>Operating System{getSortArrow('os')}</th>}
                                </tr>
                            </thead>
                            <tbody>
                                {paginatedEvents.length === 0 ? (
                                    <tr><td colSpan="4" style={{ padding: "40px", textAlign: "center", color: "var(--muted)" }}>No patches scheduled.</td></tr>
                                ) : (
                                    paginatedEvents.map((ev, idx) => (
                                        <tr key={idx}>
                                            {cols.find(c=>c.id==='server')?.show && <td style={{ fontWeight: 600 }}>{ev.server}</td>}
                                            {cols.find(c=>c.id==='date')?.show && <td>{MONTH_NAMES[ev.monthIndex]} {ev.day}, {ev.year}</td>}
                                            {cols.find(c=>c.id==='time')?.show && <td className="cal-mono-time">{ev.time}</td>}
                                            {cols.find(c=>c.id==='os')?.show && (
                                                <td>
                                                    <span className={`cal-os-badge ${ev.os.toLowerCase().includes("win") ? "win" : "linux"}`}>
                                                        {ev.os}
                                                    </span>
                                                </td>
                                            )}
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    )}
                </div>

                <div className="pagination" style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", padding: "16px 32px", gap: "24px", margin: "0 -32px", width: "calc(100% + 64px)", borderBottom: '1px solid var(--border)' }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                        <span className="pager-info" style={{ fontSize: "13px", color: "var(--muted)" }}>Rows per page:</span>
                        <select className="control" style={{ width: "70px", height: "32px", padding: '0 8px' }} value={rowsPerPage} onChange={(e) => { setRowsPerPage(Number(e.target.value)); setCurrentPage(1); }}>
                            <option value={10}>10</option><option value={20}>20</option><option value={50}>50</option>
                        </select>
                    </div>
                    <span className="pager-info" style={{ fontSize: "13px", color: "var(--muted)" }}>
                        {sortedEvents.length > 0 ? (currentPage - 1) * rowsPerPage + 1 : 0}-{Math.min(currentPage * rowsPerPage, sortedEvents.length)} of {sortedEvents.length}
                    </span>
                    <div className="pager-btns" style={{ display: "flex", gap: "4px" }}>
                        <button className="pager-btn" disabled={currentPage === 1} onClick={() => setCurrentPage(p => p - 1)}>&lt;</button>
                        <button className={`pager-btn ${currentPage === 1 ? 'active' : ''}`} onClick={() => setCurrentPage(1)}>1</button>
                        {totalPages > 1 && <button className={`pager-btn ${currentPage === 2 ? 'active' : ''}`} onClick={() => setCurrentPage(2)}>2</button>}
                        {totalPages > 2 && <span style={{ padding: '0 4px', color: 'var(--muted)' }}>..</span>}
                        {totalPages > 2 && currentPage > 2 && currentPage < totalPages && <button className="pager-btn active">{currentPage}</button>}
                        {totalPages > 2 && <button className={`pager-btn ${currentPage === totalPages ? 'active' : ''}`} onClick={() => setCurrentPage(totalPages)}>{totalPages}</button>}
                        <button className="pager-btn" disabled={currentPage === totalPages || totalPages === 0} onClick={() => setCurrentPage(p => p + 1)}>&gt;</button>
                    </div>
                </div>
            </div>
        )}
      </div>

      <FilterDrawer isOpen={drawerOpen} onClose={() => setDrawerOpen(false)} filters={filters} setFilters={setFilters} globalLogic={globalLogic} setGlobalLogic={setGlobalLogic} propertyOptions={propertyOptions} />

    </div>
  );
}