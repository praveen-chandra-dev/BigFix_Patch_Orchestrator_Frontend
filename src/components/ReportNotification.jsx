/**
 * ReportNotification
 *
 * Props:
 *  - onExportCSV?: () => void
 *  - onExportPDF?: () => void
 *  - onEmail?: () => void
 *  - decisions?: Array<{ id: string|number, name: string, outcome: string, when: string }>
 */
export default function ReportNotification({
  onExportCSV,
  onExportPDF,
  onEmail,
  decisions = [
    { id: 1, name: "Pilot Gate (Sep)", outcome: "PASS", when: "2h ago" },
    { id: 2, name: "Sandbox Gate (Sep)", outcome: "PASS", when: "3h ago" },
  ],
}) {
  return (
    <section className="card reveal" id="card-reports" data-reveal>
      <h2>Reports &amp; Notifications</h2>

      {/* Buttons */}
      <div className="row" style={{ marginTop: 6, marginBottom: 12 }}>
        <button type="button" className="btn" onClick={onExportCSV}>
          Export Pilot Summary (CSV)
        </button>
        <button type="button" className="btn" onClick={onExportPDF}>
          Export Decision Snapshot (Print/PDF)
        </button>
        <button type="button" className="btn ok" onClick={onEmail}>
          Email Stakeholders (sim)
        </button>
      </div>

      {/* Recent decisions list */}
      <div className="sub" style={{ marginTop: 4 }}>Recent Decisions</div>
      <div className="tableWrap" style={{ marginTop: 6 }}>
        <table>
          <thead>
            <tr>
              <th>Decision</th>
              <th>Outcome</th>
              <th>When</th>
            </tr>
          </thead>
          <tbody>
            {decisions.length === 0 ? (
              <tr>
                <td colSpan={3} style={{ padding: 14, color: "var(--muted)" }}>
                  No recent decisions.
                </td>
              </tr>
            ) : (
              decisions.map((d) => (
                <tr key={d.id}>
                  <td>{d.name}</td>
                  <td>
                    <span
                      className={
                        "rowchip " +
                        (d.outcome?.toLowerCase() === "pass"
                          ? "succ"
                          : d.outcome?.toLowerCase() === "fail"
                          ? "hf"
                          : "")
                      }
                    >
                      {d.outcome}
                    </span>
                  </td>
                  <td>{d.when}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
