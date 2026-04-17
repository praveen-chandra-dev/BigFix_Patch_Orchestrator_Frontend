import { createContext, useContext, useState, useCallback } from "react";

const ToastContext = createContext();

export const useToast = () => useContext(ToastContext);

export const ToastProvider = ({ children }) => {
  const [toasts, setToasts] = useState([]);

  const removeToast = (id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  const showToast = useCallback((message, type = "info", options = {}) => {
    const id = Date.now() + Math.random();

    const toast = {
      id,
      message,
      type,
      action: options.action,
      duration: options.duration ?? 4000,
    };

    setToasts((prev) => [...prev, toast]);

    if (!options.action) {
      setTimeout(() => removeToast(id), toast.duration);
    }
  }, []);

  const normalToasts = toasts.filter((t) => !t.action);
  const alertToasts = toasts.filter((t) => t.action);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}

      {/* TOP ALERTS */}
      <div className="toast-container-top">
        {alertToasts.map((t) => (
          <div key={t.id} className={`toast ${t.type}`}>
            <span>{t.message}</span>

            <div className="toast-actions">
              <button
                className="toast-btn confirm"
                onClick={() => {
                  t.action.onConfirm();
                  removeToast(t.id);
                }}
              >
                Delete
              </button>
              <button
                className="toast-btn cancel"
                onClick={() => removeToast(t.id)}
              >
                Cancel
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* NORMAL TOASTS */}
      <div className="toast-container">
        {normalToasts.map((t) => (
          <div key={t.id} className={`toast ${t.type}`}>
            <span>{t.message}</span>
            <button onClick={() => removeToast(t.id)}>✕</button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
};
