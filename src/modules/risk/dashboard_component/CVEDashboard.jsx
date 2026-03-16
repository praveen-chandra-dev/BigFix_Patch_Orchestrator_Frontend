// src/modules/risk/dashboard_component/CVEDashboard.jsx
import { useEffect, useState, useMemo, useRef } from "react";

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

export default function CVEDashboard({
  patches = [],
  cves = [],
  baselines = [],
  parentFilters = [],
  parentLogic = "AND",
  onDataLoaded,
  navigate,
}) {
  const [modalData, setModalData] = useState(null);

  const [currentPage, setCurrentPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [sortConfig, setSortConfig] = useState({ key: null, direction: "asc" });

  const [showColDrop, setShowColDrop] = useState(false);
  const [showExpDrop, setShowExpDrop] = useState(false);
  const [exportFormat, setExportFormat] = useState('CSV');
  const colRef = useRef(null);
  const expRef = useRef(null);

  const [cols, setCols] = useState([
    { id: "cve_id", label: "CVE ID", show: true },
    { id: "severity", label: "Severity", show: true },
    { id: "kev", label: "KEV", show: true },
    { id: "patch_count", label: "Patches", show: true },
    { id: "device_count", label: "Devices", show: true },
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

  const patchDeviceMap = useMemo(() => {
    const map = {};
    patches.forEach((p) => {
      const patchId = p.patch_id ? p.patch_id.replace(/^BIGFIX-/i, "") : "";
      map[patchId] = p.applicable_computers || [];
    });
    return map;
  }, [patches]);

  const baselinePatchMap = useMemo(() => {
    const map = {};
    baselines.forEach((b) => {
      const name = (b.baseline_name || b.name || "").toLowerCase();
      const patchIds = (b.patch_ids || []).map((id) =>
        String(id).replace(/^BIGFIX-/i, ""),
      );
      map[name] = patchIds;
    });
    return map;
  }, [baselines]);

  const cveExposure = useMemo(() => {
    const map = {};
    cves.forEach((c) => {
      if (!map[c.cve_id]) {
        map[c.cve_id] = {
          cve_id: c.cve_id,
          patches: new Set(),
          devices: new Set(),
          severity: (c.cvss_severity || "UNKNOWN").toUpperCase(),
          kev: c.is_kev ? "YES" : "NO",
        };
      }
      const patchId = c.patch_id ? c.patch_id.replace(/^BIGFIX-/i, "") : "";

      map[c.cve_id].patches.add(patchId);

      const devices = patchDeviceMap[patchId] || [];
      devices.forEach((d) => {
        map[c.cve_id].devices.add(d);
      });
    });
    return Object.values(map).map((c) => ({
      cve_id: c.cve_id,
      severity: c.severity,
      kev: c.kev,
      patch_count: c.patches.size,
      device_count: c.devices.size,
      patches: Array.from(c.patches),
      devices: Array.from(c.devices),
    }));
  }, [cves, patchDeviceMap]);

  const applyFilters = (cve) => {
    if (!parentFilters.length) return true;
    let globalMatch = parentLogic === "OR" ? false : true;
    for (let b of parentFilters) {
      let blockMatch = true;
      let validConds = 0;
      for (let c of b.conds) {
        if (!c.value) continue;
        validConds++;
        let condition = true;
        const search = String(c.value).toLowerCase().trim();
        if (c.column === "cve_id") {
          const field = (cve.cve_id || "").toLowerCase().trim();
          if (c.operator === "contains") condition = field.includes(search);
          else if (c.operator === "=") condition = field === search;
          else if (c.operator === "!=") condition = field !== search;
        } else if (c.column === "patch_id") {
          condition = (cve.patches || []).some((x) =>
            x.toLowerCase().includes(search),
          );
        } else if (c.column === "baseline_name") {
          const matchedBaseline = baselines.find(
            (b) => String(b.baseline_name || "").toLowerCase() === search,
          );

          if (!matchedBaseline) {
            condition = false;
          } else {
            const baselinePatchIds = (matchedBaseline.patch_ids || []).map(
              (id) => String(id).replace(/^BIGFIX-/i, ""),
            );

            condition = (cve.patches || []).some((p) =>
              baselinePatchIds.includes(String(p).replace(/^BIGFIX-/i, "")),
            );
          }
        } else if (c.column === "device_name") {
          if (c.operator === "=") {
            condition = (cve.devices || []).some(
              (x) => String(x).toLowerCase() === search,
            );
          } else {
            condition = (cve.devices || []).some((x) =>
              String(x).toLowerCase().includes(search),
            );
          }
        } else if (c.column === "kev") {
          condition = cve.kev.toLowerCase() === search;
        } else if (c.column === "severity") {
          const field = (cve.severity || "").toLowerCase();

          if (c.operator === "contains") condition = field.includes(search);
          else if (c.operator === "=") condition = field === search;
          else if (c.operator === "!=") condition = field !== search;
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

  const filteredCVEs = cveExposure.filter(applyFilters);

  const sortedCVEs = useMemo(() => {
    let sortable = [...filteredCVEs];
    if (sortConfig.key) {
      sortable.sort((a, b) => {
        let aVal = a[sortConfig.key];
        let bVal = b[sortConfig.key];
        if (["patch_count", "device_count"].includes(sortConfig.key)) {
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
  }, [filteredCVEs, sortConfig]);

  const totalPages = Math.ceil(sortedCVEs.length / rowsPerPage);
  const paginatedCVEs = sortedCVEs.slice(
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
    if (scope === 'page') dataToExport = paginatedCVEs;
    else if (scope === 'filtered') dataToExport = sortedCVEs;
    else dataToExport = cveExposure;

    performExport(dataToExport, cols, exportFormat, "cve_exposure", (cve, c) => {
      if (c === "patch_count") return cve.patches.join(",");
      if (c === "device_count") return cve.devices.join(",");
      return cve[c];
    });
  };

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
        <table>
          <thead className="kpi-th-sticky">
            <tr>
              {cols.find((c) => c.id === "cve_id")?.show && (
                <th
                  className="cursor-pointer"
                  onClick={() => handleSort("cve_id")}
                >
                  CVE{getSortIcon("cve_id")}
                </th>
              )}

              {cols.find((c) => c.id === "severity")?.show && (
                <th
                  className="cursor-pointer"
                  onClick={() => handleSort("severity")}
                >
                  Severity{getSortIcon("severity")}
                </th>
              )}

              {cols.find((c) => c.id === "kev")?.show && (
                <th
                  className="cursor-pointer"
                  style={{ textAlign: "center" }}
                  onClick={() => handleSort("kev")}
                >
                  KEV{getSortIcon("kev")}
                </th>
              )}
              {cols.find((c) => c.id === "patch_count")?.show && (
                <th
                  className="cursor-pointer"
                  style={{ textAlign: "center" }}
                  onClick={() => handleSort("patch_count")}
                >
                  Patches{getSortIcon("patch_count")}
                </th>
              )}
              {cols.find((c) => c.id === "device_count")?.show && (
                <th
                  className="cursor-pointer"
                  style={{ textAlign: "center" }}
                  onClick={() => handleSort("device_count")}
                >
                  Devices{getSortIcon("device_count")}
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {paginatedCVEs.length === 0 ? (
              <tr>
                <td
                  colSpan="5"
                  style={{
                    textAlign: "center",
                    padding: "40px",
                    color: "var(--muted)",
                  }}
                >
                  No CVEs found.
                </td>
              </tr>
            ) : (
              paginatedCVEs.map((c) => (
                <tr key={c.cve_id}>
                  {cols.find((c) => c.id === "cve_id")?.show && (
                    <td className="cve-id-cell">{c.cve_id}</td>
                  )}

                  {cols.find((c) => c.id === "severity")?.show && (
                    <td style={{ textAlign: "left" }}>
                      <span
                        className={`severity-badge severity-${c.severity.toLowerCase()}`}
                      >
                        {c.severity}
                      </span>
                    </td>
                  )}

                  {cols.find((c) => c.id === "kev")?.show && (
                    <td style={{ textAlign: "center" }}>
                      {c.kev === "YES" ? (
                        <span className="kev-yes-badge">YES</span>
                      ) : (
                        <span className="kev-no-badge">NO</span>
                      )}
                    </td>
                  )}
                  {cols.find((c) => c.id === "patch_count")?.show && (
                    <td style={{ textAlign: "center" }}>
                      <span
                        className="cell-link"
                        onClick={() =>
                          navigate(
                            "patch",
                            [
                              {
                                conds: [
                                  {
                                    column: "cve_id",
                                    operator: "contains",
                                    value: c.cve_id,
                                  },
                                ],
                              },
                            ],
                            "AND",
                          )
                        }
                      >
                        {c.patch_count}
                      </span>
                    </td>
                  )}
                  {cols.find((c) => c.id === "device_count")?.show && (
                    <td style={{ textAlign: "center" }}>
                      <span
                        className="cell-link"
                        onClick={() =>
                          navigate(
                            "computer",
                            [
                              {
                                conds: [
                                  {
                                    column: "cve_id",
                                    operator: "contains",
                                    value: c.cve_id,
                                  },
                                ],
                              },
                            ],
                            "AND",
                          )
                        }
                      >
                        {c.device_count}
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
          {sortedCVEs.length > 0 ? (currentPage - 1) * rowsPerPage + 1 : 0}-
          {Math.min(currentPage * rowsPerPage, sortedCVEs.length)} of{" "}
          {sortedCVEs.length}
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

      {modalData && (
        <div className="risk-modal-overlay" onClick={() => setModalData(null)}>
          <div className="risk-modal" onClick={(e) => e.stopPropagation()}>
            <div className="risk-modal-header">
              <h3 style={{ margin: 0, fontSize: "16px", fontWeight: 600 }}>
                {modalData.title} ({modalData.items.length})
              </h3>
              <button
                className="risk-modal-close"
                onClick={() => setModalData(null)}
              >
                ✕
              </button>
            </div>
            <div className="risk-modal-body">
              <ul>
                {modalData.items.map((item, i) => (
                  <li key={i}>{item}</li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}