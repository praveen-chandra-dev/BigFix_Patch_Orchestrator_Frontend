import React, { useState, useEffect } from 'react';

export default function FilterDrawer({ 
  isOpen, 
  onClose, 
  filters, 
  setFilters, 
  globalLogic, 
  setGlobalLogic, 
  propertyOptions 
}) {
  const [draftFilters, setDraftFilters] = useState([]);
  const [draftLogic, setDraftLogic] = useState("AND");

  useEffect(() => {
    if (isOpen) {
      if (filters && filters.length > 0) {
        setDraftFilters(JSON.parse(JSON.stringify(filters)));
      } else {
        setDraftFilters([{ logic: 'Single', conds: [{ column: propertyOptions[0]?.value, operator: 'contains', value: '' }] }]);
      }
      setDraftLogic(globalLogic || "AND");
    }
  }, [isOpen, filters, globalLogic, propertyOptions]);

  const updateBlockLogic = (bIdx, logic) => {
    const d = [...draftFilters];
    d[bIdx].logic = logic;
    if (logic === "Single") d[bIdx].conds = [d[bIdx].conds[0]];
    setDraftFilters(d);
  };

  const addBlock = () => {
    setDraftFilters([...draftFilters, { logic: 'Single', conds: [{ column: propertyOptions[0]?.value, operator: 'contains', value: '' }] }]);
  };

  const removeBlock = (bIdx) => {
    const d = [...draftFilters];
    d.splice(bIdx, 1);
    if (d.length === 0) d.push({ logic: 'Single', conds: [{ column: propertyOptions[0]?.value, operator: 'contains', value: '' }] });
    setDraftFilters(d);
  };

  const addCond = (bIdx) => {
    const d = [...draftFilters];
    d[bIdx].conds.push({ column: propertyOptions[0]?.value, operator: 'contains', value: '' });
    d[bIdx].logic = 'AND';
    setDraftFilters(d);
  };

  const removeCond = (bIdx, cIdx) => {
    const d = [...draftFilters];
    d[bIdx].conds.splice(cIdx, 1);
    if (d[bIdx].conds.length === 0) return removeBlock(bIdx);
    if (d[bIdx].conds.length === 1) d[bIdx].logic = 'Single';
    setDraftFilters(d);
  };

  const updateCond = (bIdx, cIdx, key, val) => {
    const d = [...draftFilters];
    d[bIdx].conds[cIdx][key] = val;
    setDraftFilters(d);
  };

  const drawerRemoveAll = () => {
    setDraftLogic("AND");
    setDraftFilters([{ logic: 'Single', conds: [{ column: propertyOptions[0]?.value, operator: 'contains', value: '' }] }]);
  };

  const applyFromDrawer = () => {
    setGlobalLogic(draftLogic);
    setFilters(draftFilters);
    onClose();
  };

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
            <label className="radio-label">
              <input type="radio" checked={draftLogic === "AND"} onChange={() => { setDraftLogic("AND"); if (draftFilters.length > 1) setDraftFilters([draftFilters[0]]); }} /> Single condition
            </label>
            <label className="radio-label">
              <input type="radio" checked={draftLogic === "OR"} onChange={() => setDraftLogic("OR")} /> Multiple condition (OR)
            </label>
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
                        <select className="control" value={cond.column} onChange={e => updateCond(bIdx, cIdx, "column", e.target.value)}>
                          {propertyOptions.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                        </select>
                      </div>
                      <div className="filter-col">
                        <label>Operator</label>
                        <select className="control" value={cond.operator} onChange={e => updateCond(bIdx, cIdx, "operator", e.target.value)}>
                          <option value="contains">Contains</option>
                          <option value="=">Equals</option>
                          <option value="!=">Not Equals</option>
                          <option value=">">Greater Than</option>
                          <option value="<">Less Than</option>
                        </select>
                      </div>
                      <div className="filter-col">
                        <label>Value</label>
                        <input type="text" className="control" value={cond.value} onChange={e => updateCond(bIdx, cIdx, "value", e.target.value)} placeholder="Enter value..." />
                      </div>
                      {(cIdx > 0 || block.conds.length > 1) && (
                        <div style={{paddingBottom:2}}>
                          <button className="remove-cond-btn" onClick={() => removeCond(bIdx, cIdx)}>
                             <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="18" height="18"><line x1="5" y1="12" x2="19" y2="12"></line></svg>
                          </button>
                        </div>
                      )}
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
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
                Add Block
              </button>
            </div>
          )}
        </div>
        
        <div className="drawer-footer">
          <button className="btn danger ghost" style={{display:'flex', alignItems:'center', gap:8}} onClick={drawerRemoveAll}>
            <svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg> Remove all
          </button>
          <button className="btn pri" onClick={applyFromDrawer} style={{ padding: "8px 32px" }}>Apply</button>
        </div>
      </div>
    </>
  );
}