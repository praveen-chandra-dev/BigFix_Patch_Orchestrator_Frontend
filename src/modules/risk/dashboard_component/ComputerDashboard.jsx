// src/modules/risk/dashboard_component/ComputerDashboard.jsx
import { useEffect, useState, useMemo, useRef } from "react";
import api from "../../../api/api";

function performExport(dataToExport, columns, format, filenamePrefix, getVal = (row, colId) => row[colId]) {
    const visibleCols = columns.filter(c => c.show);
    const headers = visibleCols.map(c => c.label);
    const triggerDownload = (content, type, ext) => {
        const blob = new Blob([content], { type });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url; a.download = `${filenamePrefix}.${ext}`;
        a.click(); URL.revokeObjectURL(url);
    };
    if (format === 'JSON') {
        const json = dataToExport.map(row => { let obj = {}; visibleCols.forEach(c => obj[c.label] = getVal(row, c.id)); return obj; });
        triggerDownload(JSON.stringify(json, null, 2), "application/json", "json");
    } else if (format === 'XML') {
        let xml = '<?xml version="1.0" encoding="UTF-8"?><rows>\n';
        dataToExport.forEach(row => {
            xml += '  <row>\n';
            visibleCols.forEach(c => { const tag = c.label.replace(/[^a-zA-Z0-9]/g, '_'); xml += `    <${tag}>${getVal(row, c.id) || ''}</${tag}>\n`; });
            xml += '  </row>\n';
        });
        xml += '</rows>'; triggerDownload(xml, "application/xml", "xml");
    } else if (format === 'HTML') {
        let html = '<table border="1"><thead><tr>'; headers.forEach(h => html += `<th>${h}</th>`); html += '</tr></thead><tbody>';
        dataToExport.forEach(row => { html += '<tr>'; visibleCols.forEach(c => html += `<td>${getVal(row, c.id) || ''}</td>`); html += '</tr>'; });
        html += '</tbody></table>'; triggerDownload(html, "text/html", "html");
    } else if (format === 'TXT') {
        const txt = [headers.join('\t'), ...dataToExport.map(r => visibleCols.map(c => getVal(r, c.id) || '').join('\t'))].join('\n');
        triggerDownload(txt, "text/plain", "txt");
    } else if (format === 'PDF') {
        const loadScript = (src) => new Promise(resolve => {
            if (document.querySelector(`script[src="${src}"]`)) return resolve();
            const script = document.createElement('script'); script.src = src; script.onload = resolve; document.body.appendChild(script);
        });
        Promise.all([
            loadScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js'),
            loadScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.5.31/jspdf.plugin.autotable.min.js')
        ]).then(() => {
            const { jsPDF } = window.jspdf; const doc = new jsPDF();
            doc.text(`Export: ${filenamePrefix}`, 14, 15);
            const body = dataToExport.map(row => visibleCols.map(c => getVal(row, c.id) || ''));
            doc.autoTable({ head: [headers], body: body, startY: 20 }); doc.save(`${filenamePrefix}.pdf`);
        });
    } else { 
        const csv = [headers.join(','), ...dataToExport.map(r => visibleCols.map(c => `"${String(getVal(r, c.id) || '').replace(/"/g, '""')}"`).join(','))].join('\n');
        triggerDownload(csv, "text/csv", "csv");
    }
}

export default function ComputerDashboard({
  patches = [],
  cves = [],
  parentFilters = [],
  parentLogic = "AND",
  onDataLoaded,
  navigate,
}) {
  const [currentPage, setCurrentPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [sortConfig, setSortConfig] = useState({ key: null, direction: "asc" });

  const [showColDrop, setShowColDrop] = useState(false);
  const [showExpDrop, setShowExpDrop] = useState(false);
  const [exportFormat, setExportFormat] = useState('CSV');
  const colRef = useRef(null);
  const expRef = useRef(null);

  const [cols, setCols] = useState([
    { id: "device_name", label: "Device Name", show: true },
    { id: "patch_count", label: "Missing Patches", show: true },
    { id: "cve_count", label: "CVEs", show: true },
  ]);

  useEffect(() => {
    const handleOutside = (e) => {
      if (colRef.current && !colRef.current.contains(e.target))
        setShowColDrop(false);
      if (expRef.current && !expRef.current.contains(e.target))
        setShowExpDrop(false);
    };
    document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, []);

  useEffect(() => {
    onDataLoaded?.();
  }, []);

  const patchCveMap = useMemo(() => {
    const map = {};
    cves.forEach((c) => {
      if (!map[c.patch_id]) map[c.patch_id] = [];
      map[c.patch_id].push(c.cve_id);
    });
    return map;
  }, [cves]);

  const deviceExposure = useMemo(() => {
    const map = {};
    patches.forEach((patch) => {
      const devices = patch.applicable_computers || [];
      const cvesForPatch = patchCveMap[patch.patch_id] || [];
      devices.forEach((device) => {
        if (!map[device])
          map[device] = {
            device_name: device,
            patches: new Set(),
            cves: new Set(),
          };
        const cleanPatchId = patch.patch_id
          ? patch.patch_id.replace(/^BIGFIX-/i, "")
          : "";
        map[device].patches.add(cleanPatchId);
        cvesForPatch.forEach((cve) => {
          map[device].cves.add(cve);
        });
      });
    });
    return Object.values(map).map((d) => ({
      device_name: d.device_name,
      patch_count: d.patches.size,
      cve_count: d.cves.size,
      patches: Array.from(d.patches),
      cves: Array.from(d.cves),
    }));
  }, [patches, patchCveMap]);

  const applyFilters = (device) => {
    if (!parentFilters.length) return true;
    let globalMatch = parentLogic === "OR" ? false : true;
    for (let b of parentFilters) {
      let blockMatch = true;
      let validConds = 0;
      for (let c of b.conds) {
        if (!c.value) continue;
        validConds++;
        let condition = true;
        const search = String(c.value).toLowerCase();
        if (c.column === "device_name") {
          const field = device.device_name.toLowerCase();
          if (c.operator === "contains") condition = field.includes(search);
          else if (c.operator === "=") condition = field === search;
          else if (c.operator === "!=") condition = field !== search;
        } else if (c.column === "patch_id") {
          condition = (device.patches || []).some((x) =>
            x.toLowerCase().includes(search),
          );
        } else if (c.column === "cve_id") {
          condition = (device.cves || []).some((x) =>
            x.toLowerCase().includes(search),
          );
        }
        blockMatch = blockMatch && condition;
      }
      if (validConds > 0)
        globalMatch =
          parentLogic === "OR"
            ? globalMatch || blockMatch
            : globalMatch && blockMatch;
    }
    return globalMatch;
  };

  const filteredDevices = deviceExposure.filter(applyFilters);

  const sortedDevices = useMemo(() => {
    let sortable = [...filteredDevices];
    if (sortConfig.key) {
      sortable.sort((a, b) => {
        let aVal = a[sortConfig.key];
        let bVal = b[sortConfig.key];
        if (["patch_count", "cve_count"].includes(sortConfig.key)) {
          aVal = Number(aVal || 0);
          bVal = Number(bVal || 0);
        } else {
          aVal = String(aVal || "").toLowerCase();
          bVal = String(bVal || "").toLowerCase();
        }
        if (aVal < bVal) return sortConfig.direction === "asc" ? -1 : 1;
        if (aVal > bVal) return sortConfig.direction === "asc" ? 1 : -1;
        return 0;
      });
    }
    return sortable;
  }, [filteredDevices, sortConfig]);

  const totalPages = Math.ceil(sortedDevices.length / rowsPerPage);
  const paginatedDevices = sortedDevices.slice(
    (currentPage - 1) * rowsPerPage,
    currentPage * rowsPerPage,
  );

  const handleSort = (key) =>
    setSortConfig((prev) => ({
      key,
      direction: prev.key === key && prev.direction === "asc" ? "desc" : "asc",
    }));

  const getSortIcon = (key) => {
    if (sortConfig.key !== key) return <span className="muted-text ml-6">↕</span>;
    return <span className="ml-6">{sortConfig.direction === "asc" ? "↑" : "↓"}</span>;
  };

  const handleExport = (scope) => {
    setShowExpDrop(false);
    let dataToExport = [];
    if (scope === 'page') dataToExport = paginatedDevices;
    else if (scope === 'filtered') dataToExport = sortedDevices;
    else dataToExport = deviceExposure;

    performExport(dataToExport, cols, exportFormat, "computer_exposure", (d, c) => {
      if (c === "patch_count") return d.patches.join(",");
      if (c === "cve_count") return d.cves.join(",");
      return d[c];
    });
  };

  const visibleColCount = cols.filter((c) => c.show).length;
  const colWidth = visibleColCount > 0 ? `${100 / visibleColCount}%` : "auto";

  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1 }}>
      <div
        className="grid-toolbar"
        style={{ margin: "0 0 16px 0", padding: 0 }}
      >
        <div
          className="grid-toolbar-left"
          style={{ fontWeight: 600, color: "var(--text)" }}
        ></div>

        <div
          className="grid-toolbar-right"
          style={{ display: "flex", gap: "12px" }}
        >
          <div className="dropdown" ref={colRef}>
            <button
              className="btn outline sec small"
              onClick={() => {
                setShowColDrop(!showColDrop);
                setShowExpDrop(false);
              }}
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                width="16"
                height="16"
              >
                <line x1="8" y1="6" x2="21" y2="6"></line>
                <line x1="8" y1="12" x2="21" y2="12"></line>
                <line x1="8" y1="18" x2="21" y2="18"></line>
                <line x1="3" y1="6" x2="3.01" y2="6"></line>
                <line x1="3" y1="12" x2="3.01" y2="12"></line>
                <line x1="3" y1="18" x2="3.01" y2="18"></line>
              </svg>
              &nbsp; Columns
            </button>
            {showColDrop && (
              <div
                className="dropdown-menu show"
                style={{ minWidth: "220px", padding: "12px", right: 0 }}
              >
                {cols.map((col, i) => (
                  <label
                    key={col.id}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "10px",
                      cursor: "pointer",
                      padding: "6px 12px",
                      borderRadius: "4px",
                    }}
                  >
                    <input
                      type="checkbox"
                      className="custom-checkbox"
                      checked={col.show}
                      onChange={(e) => {
                        const next = [...cols];
                        next[i].show = e.target.checked;
                        setCols(next);
                      }}
                    />
                    <span style={{ fontSize: "13px", fontWeight: 500 }}>
                      {col.label}
                    </span>
                  </label>
                ))}
              </div>
            )}
          </div>
          <div className="dropdown" ref={expRef}>
            <button
              className="btn outline small"
              onClick={() => {
                setShowExpDrop(!showExpDrop);
                setShowColDrop(false);
              }}
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                width="16"
                height="16"
              >
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"></path>
              </svg>
              &nbsp; Export
            </button>
            {showExpDrop && (
              <div
                className="dropdown-menu show"
                style={{ width: "280px", padding: "16px", right: 0 }}
              >
                <div
                  style={{
                    fontSize: "11px",
                    fontWeight: 700,
                    color: "var(--muted)",
                    textTransform: "uppercase",
                    marginBottom: "12px",
                    letterSpacing: '0.05em'
                  }}
                >
                  Format
                </div>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr 1fr",
                    gap: "8px",
                    marginBottom: "20px",
                  }}
                >
                  {["CSV", "PDF", "HTML", "TXT", "JSON", "XML"].map((fmt) => (
                    <button
                      key={fmt}
                      className={`btn small ${exportFormat === fmt ? 'pri' : 'outline'}`}
                      style={{ fontSize: "11px", height: "32px", padding: 0 }}
                      onClick={(e) => { e.stopPropagation(); setExportFormat(fmt); }}
                    >
                      {fmt}
                    </button>
                  ))}
                </div>
                <div
                  style={{
                    height: "1px",
                    background: "var(--border)",
                    marginBottom: "16px",
                  }}
                ></div>
                <div
                  style={{
                    fontSize: "11px",
                    fontWeight: 700,
                    color: "var(--muted)",
                    textTransform: "uppercase",
                    marginBottom: "12px",
                    letterSpacing: '0.05em'
                  }}
                >
                  Scope
                </div>
                <button className="item" onClick={() => handleExport('page')}>
                  Current Page
                </button>
                <button className="item" onClick={() => handleExport('filtered')}>
                  Filtered Data
                </button>
                <button className="item" onClick={() => handleExport('all')}>
                  All Data
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      <div
        className="tableWrap border-top"
        style={{
          flex: 1,
          overflow: "auto",
          margin: "0 -32px",
          width: "calc(100% + 64px)",
          borderLeft: "none",
          borderRight: "none",
          borderRadius: 0,
        }}
      >
        <table style={{ tableLayout: "fixed", width: "100%" }}>
          <thead className="kpi-th-sticky">
            <tr>
              {cols.find((c) => c.id === "device_name")?.show && (
                <th
                  className="cursor-pointer"
                  style={{ width: colWidth }}
                  onClick={() => handleSort("device_name")}
                >
                  Device Name{getSortIcon("device_name")}
                </th>
              )}
              {cols.find((c) => c.id === "patch_count")?.show && (
                <th
                  className="cursor-pointer"
                  style={{ textAlign: "center", width: colWidth }}
                  onClick={() => handleSort("patch_count")}
                >
                  Missing Patches{getSortIcon("patch_count")}
                </th>
              )}
              {cols.find((c) => c.id === "cve_count")?.show && (
                <th
                  className="cursor-pointer"
                  style={{ textAlign: "center", width: colWidth }}
                  onClick={() => handleSort("cve_count")}
                >
                  CVEs{getSortIcon("cve_count")}
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {paginatedDevices.length === 0 ? (
              <tr>
                <td
                  colSpan="3"
                  style={{
                    textAlign: "center",
                    padding: "40px",
                    color: "var(--muted)",
                  }}
                >
                  No devices found.
                </td>
              </tr>
            ) : (
              paginatedDevices.map((d) => (
                <tr key={d.device_name}>
                  {cols.find((c) => c.id === "device_name")?.show && (
                    <td style={{ wordBreak: "break-word" }}>{d.device_name}</td>
                  )}
                  {cols.find((c) => c.id === "patch_count")?.show && (
                    <td style={{ textAlign: "center", wordBreak: "break-word" }}>
                      <span
                        className="cell-link"
                        onClick={() =>
                          navigate(
                            "patch",
                            [
                              {
                                conds: [
                                  {
                                    column: "device",
                                    operator: "=",
                                    value: d.device_name,
                                  },
                                ],
                              },
                            ],
                            "AND",
                          )
                        }
                      >
                        {d.patch_count}
                      </span>
                    </td>
                  )}
                  {cols.find((c) => c.id === "cve_count")?.show && (
                    <td style={{ textAlign: "center", wordBreak: "break-word" }}>
                      <span
                        className="cell-link"
                        onClick={() =>
                          navigate(
                            "cve",
                            [
                              {
                                conds: [
                                  {
                                    column: "device_name",
                                    operator: "=",
                                    value: d.device_name,
                                  },
                                ],
                              },
                            ],
                            "AND",
                          )
                        }
                      >
                        {d.cve_count}
                      </span>
                    </td>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div
        className="pagination"
        style={{
          display: "flex",
          justifyContent: "flex-end",
          alignItems: "center",
          padding: "16px 32px",
          gap: "24px",
          margin: "0 -32px",
          width: "calc(100% + 64px)",
          borderBottom: "1px solid var(--border)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <span className="pager-info">Rows per page:</span>
          <select
            className="control"
            style={{ width: "70px", height: "32px", padding: "0 8px" }}
            value={rowsPerPage}
            onChange={(e) => {
              setRowsPerPage(Number(e.target.value));
              setCurrentPage(1);
            }}
          >
            <option value={10}>10</option>
            <option value={20}>20</option>
            <option value={50}>50</option>
          </select>
        </div>
        <span
          className="pager-info"
          style={{ fontSize: "13px", color: "var(--muted)" }}
        >
          {sortedDevices.length > 0 ? (currentPage - 1) * rowsPerPage + 1 : 0}-
          {Math.min(currentPage * rowsPerPage, sortedDevices.length)} of{" "}
          {sortedDevices.length}
        </span>
        <div className="pager-btns" style={{ display: "flex", gap: "4px" }}>
          <button
            className="pager-btn"
            disabled={currentPage === 1}
            onClick={() => setCurrentPage((p) => p - 1)}
          >
            &lt;
          </button>
          <button
            className={`pager-btn ${currentPage === 1 ? "active" : ""}`}
            onClick={() => setCurrentPage(1)}
          >
            1
          </button>
          {totalPages > 1 && (
            <button
              className={`pager-btn ${currentPage === 2 ? "active" : ""}`}
              onClick={() => setCurrentPage(2)}
            >
              2
            </button>
          )}
          {totalPages > 2 && (
            <span style={{ padding: "0 4px", color: "var(--muted)" }}>..</span>
          )}
          {totalPages > 2 && currentPage > 2 && currentPage < totalPages && (
            <button className="pager-btn active">{currentPage}</button>
          )}
          {totalPages > 2 && (
            <button
              className={`pager-btn ${currentPage === totalPages ? "active" : ""}`}
              onClick={() => setCurrentPage(totalPages)}
            >
              {totalPages}
            </button>
          )}
          <button
            className="pager-btn"
            disabled={currentPage === totalPages || totalPages === 0}
            onClick={() => setCurrentPage((p) => p + 1)}
          >
            &gt;
          </button>
        </div>
      </div>
    </div>
  );
}