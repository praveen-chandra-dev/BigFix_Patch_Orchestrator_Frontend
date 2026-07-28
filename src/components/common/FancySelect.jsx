// src/components/common/FancySelect.jsx
import { useState, useEffect, useRef } from "react";
import PropTypes from "prop-types";

const getOptVal = (opt) => opt?.value === undefined ? opt : opt.value;
const getOptLabel = (opt) => opt?.label === undefined ? opt : opt.label;

function getMultiSelectText(value) {
  if (Array.isArray(value) && value.length > 0) {
    return value.length <= 2 ? value.join(", ") : `${value.length} selected`;
  }
  return null;
}

function getSingleSelectText(value, options) {
  const selectedOption = options.find(o => String(getOptVal(o)) === String(value));
  if (selectedOption) {
    return getOptLabel(selectedOption);
  }
  return value || null;
}

function getDisplayText(value, options, multiSelect, isLoading, placeholder) {
  if (isLoading) return "Loading...";

  const text = multiSelect 
    ? getMultiSelectText(value) 
    : getSingleSelectText(value, options);

  return text || placeholder || "— Select —";
}

function toggleMultiSelectValue(currentValue, optVal) {
  const current = Array.isArray(currentValue) ? currentValue : [];
  const newSet = new Set(current);
  
  if (newSet.has(optVal)) {
    newSet.delete(optVal);
  } else {
    newSet.add(optVal);
  }
  
  return Array.from(newSet);
}

const FancyOption = ({ opt, value, multiSelect, onSelect }) => {
  const optVal = getOptVal(opt);
  const optLabel = getOptLabel(opt);
  const isSelected = multiSelect ? (value || []).includes(optVal) : String(value) === String(optVal);

  const setBg = (e, color) => {
    if (!isSelected) e.currentTarget.style.background = color;
  };

  return (
    <button
      type="button"
      onClick={(e) => onSelect(opt, e)}
      onMouseOver={(e) => setBg(e, 'var(--bg)')}
      onFocus={(e) => setBg(e, 'var(--bg)')}
      onMouseOut={(e) => setBg(e, 'transparent')}
      onBlur={(e) => setBg(e, 'transparent')}
      style={{
        width: '100%',
        textAlign: 'left',
        border: 'none',
        outline: 'none',
        padding: '8px 12px', fontSize: '13px', cursor: 'pointer',
        background: isSelected ? 'var(--bg)' : 'transparent',
        color: isSelected ? 'var(--primary)' : 'var(--text)',
        whiteSpace: 'nowrap', display: 'flex', alignItems: 'center'
      }}
    >
      {multiSelect && (
        <input type="checkbox" className="custom-checkbox mr-10 no-events" checked={isSelected} readOnly style={{ margin: '0 8px 0 0' }} tabIndex={-1} />
      )}
      <span className="fx-label">{optLabel}</span>
    </button>
  );
};

FancyOption.propTypes = {
  opt: PropTypes.any,
  value: PropTypes.any,
  multiSelect: PropTypes.bool,
  onSelect: PropTypes.func
};

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
    if (open && searchable && searchInputRef.current) {
      searchInputRef.current.focus();
    }
  }, [open, searchable]);

  const displayText = getDisplayText(value, options, multiSelect, isLoading, placeholder);
  const isPlaceholder = !isLoading && (!value || (Array.isArray(value) && value.length === 0));

  const handleOptionClick = (opt, e) => {
    const optVal = getOptVal(opt);
    if (multiSelect) {
      e.stopPropagation();
      onChange(toggleMultiSelectValue(value, optVal));
    } else {
      onChange(optVal);
      setOpen(false);
      setSearchTerm("");
    }
  };

  const filteredOptions = searchable && searchTerm.trim() !== ""
    ? options.filter(opt => String(getOptLabel(opt)).toLowerCase().includes(searchTerm.toLowerCase()))
    : options;

  return (
    <div className="field flex-1 m-0" style={{ width, minWidth: label ? '200px' : 'auto' }}>
      {label && <span className="label">{label}</span>}
      {isLoading && !label && <div className="sub label-loading-sub">Loading...</div>}

      <div className={`fx-wrap flex-1 ${open ? "fx-open" : ""} ${(disabled || isLoading) ? "disabled" : ""}`} ref={wrapperRef} style={{ position: 'relative' }}>
        <button type="button" className="fx-trigger" onClick={() => !disabled && !isLoading && setOpen(!open)} style={{ height: '32px', minHeight: '32px', padding: '0 10px', background: (disabled || isLoading) ? 'var(--bg)' : 'var(--panel)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }} disabled={disabled || isLoading}>
          <span className={`fx-value ${isPlaceholder ? "fx-placeholder" : ""}`} title={isPlaceholder ? "" : String(displayText)} style={{ fontSize: '13px', fontWeight: 500, color: (disabled || isLoading) ? 'var(--muted)' : 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{String(displayText)}</span>
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
              {filteredOptions.length === 0 ? (
                <div className="fx-item fx-empty" style={{ fontSize: '13px', padding: '8px' }}>No options</div>
              ) : (
                filteredOptions.map((opt) => (
                  <FancyOption
                    key={getOptVal(opt)}
                    opt={opt}
                    value={value}
                    multiSelect={multiSelect}
                    onSelect={handleOptionClick}
                  />
                ))
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

FancySelect.propTypes = {
  label: PropTypes.string,
  options: PropTypes.array,
  value: PropTypes.oneOfType([PropTypes.string, PropTypes.number, PropTypes.array, PropTypes.bool]),
  onChange: PropTypes.func,
  disabled: PropTypes.bool,
  placeholder: PropTypes.string,
  searchable: PropTypes.bool,
  isLoading: PropTypes.bool,
  multiSelect: PropTypes.bool,
  width: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
  menuPlacement: PropTypes.string
};