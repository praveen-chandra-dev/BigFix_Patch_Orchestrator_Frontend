// src/components/common/FancySelect.jsx
import { useState, useEffect, useRef } from "react";

export default function FancySelect({ label, options = [], value, onChange, disabled, placeholder, searchable, isLoading, multiSelect, width = '100%', menuPlacement = 'bottom' }) {
  const [open, setOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const wrapperRef = useRef(null);
  const searchInputRef = useRef(null);

  useEffect(() => {
    function handleClickOutside(event) { 
      if (wrapperRef.current && !wrapperRef.current.contains(event.target)) {
        setOpen(false);
        setSearchTerm("");
      }
    }
    document.addEventListener("mousedown", handleClickOutside); 
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    if (open && searchable && searchInputRef.current) searchInputRef.current.focus();
  }, [open, searchable]);

  let displayText = placeholder || "— Select —"; 
  let isPlaceholder = true;

  if (multiSelect) {
    if (Array.isArray(value) && value.length > 0) { 
        isPlaceholder = false; 
        displayText = value.length <= 2 ? value.join(", ") : `${value.length} selected`; 
    }
  } else {
    const selectedOption = options.find(o => String(o.value !== undefined ? o.value : o) === String(value));
    if (selectedOption) { 
        displayText = selectedOption.label !== undefined ? selectedOption.label : selectedOption; 
        isPlaceholder = false; 
    } else if (value && !isLoading) {
        displayText = value;
        isPlaceholder = false;
    }
  }
  if (isLoading) displayText = "Loading...";

  const handleOptionClick = (opt, e) => {
    const optVal = opt.value !== undefined ? opt.value : opt;
    if (multiSelect) { 
      e.stopPropagation(); 
      const current = Array.isArray(value) ? value : []; 
      const newSet = new Set(current); 
      if (newSet.has(optVal)) newSet.delete(optVal); else newSet.add(optVal); 
      onChange(Array.from(newSet)); 
    } else { 
      onChange(optVal); 
      setOpen(false); 
      setSearchTerm("");
    }
  };

  const filteredOptions = searchable && searchTerm.trim() !== ""
    ? options.filter(opt => String(opt.label !== undefined ? opt.label : opt).toLowerCase().includes(searchTerm.toLowerCase()))
    : options;

  return (
    <div className="field flex-1 m-0" style={{ width, minWidth: label ? '200px' : 'auto' }}>
      {label && <span className="label">{label}</span>}
      {isLoading && !label && <div className="sub label-loading-sub">Loading...</div>}
      
      <div className={`fx-wrap flex-1 ${open ? "fx-open" : ""} ${(disabled || isLoading) ? "disabled" : ""}`} ref={wrapperRef} style={{ position: 'relative' }}>
        <button type="button" className="fx-trigger" onClick={() => !disabled && !isLoading && setOpen(!open)} style={{ height: '32px', minHeight: '32px', padding: '0 10px', background: (disabled || isLoading) ? 'var(--bg)' : 'var(--panel)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }} disabled={disabled || isLoading}>
          <span className={`fx-value ${isPlaceholder ? "fx-placeholder" : ""}`} title={!isPlaceholder ? String(displayText) : ""} style={{ fontSize: '13px', fontWeight: 500, color: (disabled || isLoading) ? 'var(--muted)' : 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{String(displayText)}</span>
          <span className="fx-chevron" style={{ fontSize: '10px', marginLeft: '8px' }}>▼</span>
        </button>
        {open && (
          <div className="fx-menu" style={{ 
              position: 'absolute',
              top: menuPlacement === 'bottom' ? 'calc(100% + 4px)' : 'auto', 
              bottom: menuPlacement === 'top' ? 'calc(100% + 4px)' : 'auto',
              left: 0, minWidth: '100%', width: 'max-content',
              boxShadow: '0 4px 12px rgba(0,0,0,0.15)', border: '1px solid var(--border)',
              zIndex: 99999, background: 'var(--panel)', borderRadius: '6px'
          }}>
            {searchable && (
              <div style={{ padding: '6px 8px', borderBottom: '1px solid var(--border)', position: 'sticky', top: 0, background: 'var(--panel)', zIndex: 2, borderRadius: '6px 6px 0 0' }}>
                <input ref={searchInputRef} type="text" className="control" placeholder="Search..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} onClick={e => e.stopPropagation()} style={{ width: '100%', height: '28px', fontSize: '12px', padding: '0 8px' }} />
              </div>
            )}
            <div className="fx-menu-inner" style={{ maxHeight: '200px', overflowY: 'auto' }}>
              {filteredOptions.length === 0 ? ( <div className="fx-item fx-empty" style={{ fontSize: '13px', padding: '8px' }}>No options</div> ) : (
                filteredOptions.map((opt) => {
                  const optVal = opt.value !== undefined ? opt.value : opt;
                  const optLabel = opt.label !== undefined ? opt.label : opt;
                  const isSelected = multiSelect ? (value || []).includes(optVal) : String(value) === String(optVal);
                  return (
                    <div key={optVal} className={`fx-item ${isSelected ? "fx-active" : ""}`} onClick={(e) => handleOptionClick(opt, e)} style={{ padding: '8px 12px', fontSize: '13px', cursor: 'pointer', background: isSelected ? 'var(--bg)' : 'transparent', color: isSelected ? 'var(--primary)' : 'var(--text)', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center' }} onMouseOver={e => !isSelected && (e.currentTarget.style.background = 'var(--bg)')} onMouseOut={e => !isSelected && (e.currentTarget.style.background = 'transparent')}>
                      {multiSelect && <input type="checkbox" className="custom-checkbox mr-10 no-events" checked={isSelected} readOnly style={{ margin: '0 8px 0 0' }} />}
                      <span className="fx-label">{optLabel}</span>
                      {!multiSelect && isSelected && <span style={{ marginLeft: 'auto' }}>✓</span>}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}