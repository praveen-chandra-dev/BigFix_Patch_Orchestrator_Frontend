// src/components/common/Paginator.jsx
import FancySelect from "./FancySelect";

export default function Paginator({ total, rpp, setRpp, page, setPage, edgeToEdge = false }) {
    const totalPages = Math.ceil(total / rpp) || 1;
    const rppOptions = [{value: 10, label: "10"}, {value: 20, label: "20"}, {value: 50, label: "50"}, {value: 10000, label: "All"}];
    const edgeStyles = edgeToEdge 
        ? { margin: '0 -32px', width: 'calc(100% + 64px)', borderBottom: '1px solid var(--border)', padding: '16px 32px' } 
        : { padding: '16px 20px', borderTop: '1px solid var(--border)' };

    return (
        <div className="pagination" style={{ position: 'relative', zIndex: 50, display: "flex", justifyContent: "flex-end", alignItems: "center", gap: "24px", background: 'var(--panel)', ...edgeStyles }}>
            <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                <span className="pager-info" style={{ fontSize: "13px", color: "var(--muted)" }}>Rows per page:</span>
                <FancySelect options={rppOptions} value={rpp} onChange={v => { setRpp(Number(v)); setPage(1); }} width="80px" menuPlacement="top" searchable={false} />
            </div>
            <span className="pager-info" style={{ fontSize: "13px", color: "var(--muted)" }}>
                {total > 0 ? (page - 1) * rpp + 1 : 0}-{Math.min(page * rpp, total)} of {total}
            </span>
            <div className="pager-btns" style={{ display: "flex", gap: "4px" }}>
                <button className="pager-btn" disabled={page === 1} onClick={() => setPage(p => p - 1)}>&lt;</button>
                <button className={`pager-btn ${page === 1 ? 'active' : ''}`} onClick={() => setPage(1)}>1</button>
                {totalPages > 1 && <button className={`pager-btn ${page === 2 ? 'active' : ''}`} onClick={() => setPage(2)}>2</button>}
                {totalPages > 2 && <span style={{ padding: '0 4px', color: 'var(--muted)' }}>..</span>}
                {totalPages > 2 && page > 2 && page < totalPages && <button className="pager-btn active">{page}</button>}
                {totalPages > 2 && <button className={`pager-btn ${page === totalPages ? 'active' : ''}`} onClick={() => setPage(totalPages)}>{totalPages}</button>}
                <button className="pager-btn" disabled={page === totalPages || totalPages === 0} onClick={() => setPage(p => p + 1)}>&gt;</button>
            </div>
        </div>
    );
}