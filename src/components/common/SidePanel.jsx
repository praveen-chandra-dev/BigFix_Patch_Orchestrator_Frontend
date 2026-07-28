import React from "react";
import PropTypes from "prop-types";

export default function SidePanel({ open, onClose, title, children }) {
  if (!open) return null;

  return (
    <>
      <div
        role="button"
        tabIndex={0}
        onClick={onClose}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClose(); } }}
        style={{
          position: "fixed",
          inset: 0,
          background: "rgba(0,0,0,0.3)",
          zIndex: 2000,
        }}
      />

      <div
        style={{
          position: "fixed",
          top: 0,
          right: 0,
          height: "100%",
          width: "40vw",
          maxWidth: "600px",
          minWidth: "420px",
          background: "var(--panel)",
          boxShadow: "-4px 0 12px rgba(0,0,0,0.15)",
          zIndex: 2001,
          display: "flex",
          flexDirection: "column",
        }}
      >
        <div
          style={{
            padding: "16px",
            borderBottom: "1px solid var(--border)",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: "8px",
          }}
        >
          <strong style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {title}
          </strong>

          <button onClick={onClose} style={{ background: "transparent", border: "none", cursor: "pointer", fontSize: "18px", color: "red", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }} title="Close">
            <svg viewBox="0 0 384 512" fill="currentColor" width="1em" height="1em">
              <path d="M342.6 150.6c12.5-12.5 12.5-32.8 0-45.3s-32.8-12.5-45.3 0L192 210.7 86.6 105.4c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3L146.7 256 41.4 361.4c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0L192 301.3 297.4 406.6c12.5 12.5 32.8 12.5 45.3 0s12.5-32.8 0-45.3L237.3 256 342.6 150.6z"/>
            </svg>
          </button>
        </div>

        <div style={{ padding: "16px", overflowY: "auto", flex: 1 }}>
          {children}
        </div>
      </div>
    </>
  );
}

SidePanel.propTypes = {
  open: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  title: PropTypes.string.isRequired,
  children: PropTypes.node
};