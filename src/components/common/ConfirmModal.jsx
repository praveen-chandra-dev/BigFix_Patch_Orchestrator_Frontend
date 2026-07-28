import React from "react";
import PropTypes from "prop-types";

export default function ConfirmModal({
  open,
  title = "Confirm Action",
  message = "Are you sure?",
  confirmText = "Confirm",
  cancelText = "Cancel",
  loading = false,
  onConfirm,
  onCancel,
}) {
  if (!open) return null;

  return (
    <div className="modal-backdrop">
      <div className="modal-card">
        <div className="modal-header">
          <span className="modal-title">{title}</span>
        </div>

        <div className="modal-body">
          {message}
        </div>

        <div className="modal-footer">
          <button className="btn outline" onClick={onCancel}>
            {cancelText}
          </button>

          <button
            className="btn danger"
            onClick={onConfirm}
            disabled={loading}
          >
            {loading ? "Processing..." : confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}

ConfirmModal.propTypes = {
  open: PropTypes.bool.isRequired,
  title: PropTypes.string,
  message: PropTypes.node,
  confirmText: PropTypes.string,
  cancelText: PropTypes.string,
  loading: PropTypes.bool,
  onConfirm: PropTypes.func.isRequired,
  onCancel: PropTypes.func.isRequired,
};