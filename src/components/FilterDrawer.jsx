// src/components/FilterDrawer.jsx
import React, { useState, useEffect, useRef } from 'react';

const DrawerSelect = ({ options, value, onChange }) => {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const handleClickOutside = (e) => { 
      if (ref.current && !ref.current.contains(e.target)) setOpen(false); 
    };
    document.addEventListener("mousedown", handleClickOutside); 
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const selectedLabel = options.find(o => String(o.value) === String(value))?.label || "Select";

  return (
    <div className={`fx-wrap flex-1 ${open ? "fx-open" : ""}`} ref={ref} style={{ position: 'relative', width: '100%' }}>
      <button type="button" className="fx-trigger" onClick={() => setOpen(!open)} style={{ height: '36px', minHeight: '36px', padding: '0 12px', background: 'var(--panel)' }}>
        <span className="fx-value" style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{selectedLabel}</span>
        <span className="fx-chevron" style={{ fontSize: '10px', marginLeft: '8px' }}>▼</span>
      </button>
      {open && (
        <div className="fx-menu" style={{ position: 'absolute', top: 'calc(100% + 4px)', left: 0, minWidth: '100%', width: 'max-content', boxShadow: '0 4px 12px rgba(0,0,0,0.15)', border: '1px solid var(--border)', zIndex: 99999, background: 'var(--panel)', borderRadius: '6px' }}>
          <div className="fx-menu-inner" style={{ maxHeight: '200px', overflowY: 'auto' }}>
            {options.map((opt) => {
              const isSelected = String(value) === String(opt.value);
              return (
                <div key={opt.value} className={`fx-item ${isSelected ? "fx-active" : ""}`} onClick={() => { onChange(opt.value); setOpen(false); }} style={{ padding: '8px 12px', fontSize: '13px', cursor: 'pointer', background: isSelected ? 'var(--bg)' : 'transparent', color: isSelected ? 'var(--primary)' : 'var(--text)' }} onMouseOver={e => !isSelected && (e.currentTarget.style.background = 'var(--bg)')} onMouseOut={e => !isSelected && (e.currentTarget.style.background = 'transparent')}>
                  <span className="fx-label">{opt.label}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

export default function FilterDrawer({ isOpen, onClose, filters, setFilters, globalLogic, setGlobalLogic, propertyOptions }) {
  const [draftFilters, setDraftFilters] = useState([]);
  const [draftLogic, setDraftLogic] = useState("AND");

  // Fix: Only run when isOpen transitions to true to prevent overwriting inputs on background renders
  useEffect(() => {
    if (isOpen) {
      if (filters && filters.length > 0) setDraftFilters(JSON.parse(JSON.stringify(filters)));
      else setDraftFilters([{ logic: 'Single', conds: [{ column: propertyOptions[0]?.value || '', operator: 'contains', value: '' }] }]);
      setDraftLogic(globalLogic || "AND");
    }
  }, [isOpen]);

  const updateBlockLogic = (bIdx, logic) => {
    const d = [...draftFilters]; d[bIdx].logic = logic;
    if (logic === "Single") d[bIdx].conds = [d[bIdx].conds[0]];
    setDraftFilters(d);
  };
  const addBlock = () => setDraftFilters([...draftFilters, { logic: 'Single', conds: [{ column: propertyOptions[0]?.value || '', operator: 'contains', value: '' }] }]);
  const removeBlock = (bIdx) => {
    const d = [...draftFilters]; d.splice(bIdx, 1);
    if (d.length === 0) d.push({ logic: 'Single', conds: [{ column: propertyOptions[0]?.value || '', operator: 'contains', value: '' }] });
    setDraftFilters(d);
  };
  const addCond = (bIdx) => {
    const d = [...draftFilters]; d[bIdx].conds.push({ column: propertyOptions[0]?.value || '', operator: 'contains', value: '' }); d[bIdx].logic = 'AND';
    setDraftFilters(d);
  };
  const removeCond = (bIdx, cIdx) => {
    const d = [...draftFilters]; d[bIdx].conds.splice(cIdx, 1);
    if (d[bIdx].conds.length === 0) return removeBlock(bIdx);
    if (d[bIdx].conds.length === 1) d[bIdx].logic = 'Single';
    setDraftFilters(d);
  };
  const updateCond = (bIdx, cIdx, key, val) => { const d = [...draftFilters]; d[bIdx].conds[cIdx][key] = val; setDraftFilters(d); };
  const drawerRemoveAll = () => { setDraftLogic("AND"); setDraftFilters([{ logic: 'Single', conds: [{ column: propertyOptions[0]?.value || '', operator: 'contains', value: '' }] }]); };
  const applyFromDrawer = () => { setGlobalLogic(draftLogic); setFilters(draftFilters); onClose(); };

  const operatorOptions = [
      { value: "contains", label: "Contains" },
      { value: "=", label: "Equals" },
      { value: "!=", label: "Not Equals" },
      { value: ">", label: "Greater Than" },
      { value: "<", label: "Less Than" }
  ];

  return (
    <>
      <div className={`drawer-overlay ${isOpen ? 'active' : ''}`} onClick={onClose}></div>
      <div className={`drawer ${isOpen ? 'active' : ''}`}>
        <div className="drawer-header">
          <div className="drawer-title">Filter data</div>
          <button className="drawer-close" onClick={onClose}>✕</button>
        </div>
        <div className="drawer-body">
          <div className="filter-desc">Set conditions on properties</div>
          <div style={{ marginBottom: "24px", display: "flex", gap: "24px" }}>
            <label className="radio-label"><input type="radio" checked={draftLogic === "AND"} onChange={() => { setDraftLogic("AND"); if (draftFilters.length > 1) setDraftFilters([draftFilters[0]]); }} /> Single condition</label>
            <label className="radio-label"><input type="radio" checked={draftLogic === "OR"} onChange={() => setDraftLogic("OR")} /> Multiple condition (OR)</label>
          </div>
          {draftFilters.map((block, bIdx) => (
            <React.Fragment key={bIdx}>
              {bIdx > 0 && <div className="or-divider">OR</div>}
              <div className="filter-block">
                <div className="block-header">
                  <div className="radio-group">
                    <label className="radio-label"><input type="radio" checked={block.logic === "Single"} onChange={() => updateBlockLogic(bIdx, "Single")} /> Single condition</label>
                    <label className="radio-label"><input type="radio" checked={block.logic === "AND"} onChange={() => updateBlockLogic(bIdx, "AND")} /> Multiple condition (AND)</label>
                  </div>
                  <button className="remove-block-btn" onClick={() => removeBlock(bIdx)}>
                    <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg> Remove block
                  </button>
                </div>
                {block.conds.map((cond, cIdx) => (
                  <div key={cIdx}>
                    {cIdx > 0 && <div style={{display:'flex', justifyContent:'center', padding:'4px 0'}}><span style={{fontSize:11, fontWeight:600, color:'var(--muted)', background:'var(--bg)', padding:'2px 8px', borderRadius:12}}>AND</span></div>}
                    <div className="filter-row">
                      <div className="filter-col">
                        <label>Property</label>
                        <DrawerSelect options={propertyOptions} value={cond.column} onChange={v => updateCond(bIdx, cIdx, "column", v)} />
                      </div>
                      <div className="filter-col">
                        <label>Operator</label>
                        <DrawerSelect options={operatorOptions} value={cond.operator} onChange={v => updateCond(bIdx, cIdx, "operator", v)} />
                      </div>
                      <div className="filter-col flex-15">
                        <label>Value</label>
                        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                            <input type="text" className="control" style={{height:'36px', flex:1}} value={cond.value} onChange={e => updateCond(bIdx, cIdx, "value", e.target.value)} placeholder="Enter value..." />
                            {(cIdx > 0 || block.conds.length > 1) && (
                              <button className="remove-cond-btn" onClick={() => removeCond(bIdx, cIdx)} title="Remove Condition">
                                 <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="18" height="18"><line x1="5" y1="12" x2="19" y2="12"></line></svg>
                              </button>
                            )}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
                {block.logic === "AND" && (
                  <div style={{ textAlign: "center", marginTop: 16 }}>
                    <button className="add-cond-btn" onClick={() => addCond(bIdx)}>+ Add Condition</button>
                  </div>
                )}
              </div>
            </React.Fragment>
          ))}
          {draftLogic === "OR" && (
            <div style={{ marginTop: 16 }}>
              <button className="add-block-btn" onClick={addBlock}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg> Add Block
              </button>
            </div>
          )}
        </div>
        <div className="drawer-footer">
          <button className="remove-block-btn" style={{display:'flex', alignItems:'center', gap:8}} onClick={drawerRemoveAll}>
            <svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg> Remove all
          </button>
          <button className="btn pri" onClick={applyFromDrawer} style={{ padding: "8px 32px" }}>Apply</button>
        </div>
      </div>
    </>
  );
}