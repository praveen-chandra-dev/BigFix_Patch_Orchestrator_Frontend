// src/components/PatchCalendar.jsx
import { useState, useMemo, useEffect } from "react";

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
  
  const [selectedDetails, setSelectedDetails] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");

  const isAdmin = (userRole || "").toLowerCase() === "admin";

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth(); 
  
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDayOffset = new Date(year, month, 1).getDay(); 

  useEffect(() => { fetchEvents(); }, [userRole]); 

  const fetchEvents = async () => {
    try {
      setLoading(true);
      const res = await fetch(`${API_BASE}/api/calendar?role=${encodeURIComponent(userRole)}`);
      const data = await res.json();
      if (data.ok) setEvents(data.events || []);
    } catch (err) { console.error(err); } finally { setLoading(false); }
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

  const eventsByDate = useMemo(() => {
    const map = {}; 
    events.forEach(ev => {
      if (ev.year === year && ev.monthIndex === month) {
        if (!map[ev.day]) map[ev.day] = [];
        map[ev.day].push(ev);
      }
    });
    return map;
  }, [events, year, month]);

  const handleDayClick = (day, dayEvents) => {
    if (!dayEvents || dayEvents.length === 0) return;
    setSearchTerm("");
    setSelectedDetails({ title: `${MONTH_NAMES[month]} ${day}, ${year}`, events: dayEvents });
  };

  const filteredModalEvents = useMemo(() => {
    if (!selectedDetails) return [];
    if (!searchTerm) return selectedDetails.events;
    const lower = searchTerm.toLowerCase();
    return selectedDetails.events.filter(ev => ev.server.toLowerCase().includes(lower) || ev.os.toLowerCase().includes(lower));
  }, [selectedDetails, searchTerm]);

  return (
    <div className="calendar-layout fade-in">
      <div className="cal-header-bar flex-row justify-between items-start w-full">
        <div>
          <h2>Patch Calendar</h2>
          <div className="cal-nav-controls">
            <button onClick={prevMonth} className="cal-nav-btn">‹</button>
            <span className="cal-date-label">{MONTH_NAMES[month]} {year}</span>
            <button onClick={nextMonth} className="cal-nav-btn">›</button>
            <button onClick={goToToday} className="btn-outline">Today</button>
          </div>
        </div>

        <div className="flex-row gap-8 items-center" style={{ marginTop: '12px' }}>
          {isAdmin && (
            <>
              <button className="btn outline" onClick={downloadTemplate}>Template</button>
              <label className="btn outline" style={{ cursor: 'pointer', margin: 0 }}>
                {loading ? "Syncing..." : "Upload CSV"}
                <input type="file" accept=".csv" onChange={handleFileUpload} hidden disabled={loading} />
              </label>
            </>
          )}
          <button className="iconbtn" onClick={onClose} title="Close">
             <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
          </button>
        </div>
      </div>

      {error && <div className="banner error">{error}</div>}

      <div className="cal-grid-container">
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

      {selectedDetails && (
        <div className="cal-modal-overlay" onClick={() => setSelectedDetails(null)}>
          <div className="cal-modal" onClick={(e) => e.stopPropagation()}>
            <div className="cal-modal-top">
              <h3>{selectedDetails.title}</h3>
              <button onClick={() => setSelectedDetails(null)}>×</button>
            </div>
            <div className="cal-modal-search">
              <input placeholder="Search server..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} autoFocus />
            </div>
            <div className="cal-modal-list">
              <table className="cal-modal-table">
                <thead><tr><th>Time</th><th>Server</th><th>OS</th></tr></thead>
                <tbody>
                  {filteredModalEvents.map((ev, idx) => (
                    <tr key={idx}>
                      <td className="cal-mono-time">{ev.time}</td>
                      <td className="fw-600">{ev.server}</td>
                      <td><span className={`cal-os-badge ${ev.os.toLowerCase().includes("win") ? "win" : "linux"}`}>{ev.os}</span></td>
                    </tr>
                  ))}
                  {filteredModalEvents.length === 0 && (
                    <tr><td colSpan="3" className="cal-no-data">No servers found</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}