import { createContext, useContext, useState, useCallback, useMemo } from "react";
import PropTypes from "prop-types";

const ToastContext = createContext();

export const useToast = () => useContext(ToastContext);

export const ToastProvider = ({ children }) => {
  const [toasts, setToasts] = useState([]);

  const removeToast = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const showToast = useCallback((message, type = "info", options = {}) => {
    const cryptoObj = globalThis.crypto || globalThis.msCrypto;
    const randomArray = new Uint32Array(1);
    cryptoObj.getRandomValues(randomArray);
    
    const id = Date.now() + "-" + randomArray[0];

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
  }, [removeToast]);

  const normalToasts = toasts.filter((t) => !t.action);
  const alertToasts = toasts.filter((t) => t.action);

  const contextValue = useMemo(() => ({ showToast }), [showToast]);

  return (
    <ToastContext.Provider value={contextValue}>
      {children}

      <div className="toast-container-top">
        {alertToasts.map((t) => (
          <div key={t.id} className={`toast ${t.type}`}>
            <span>{t.message}</span>
            <div className="toast-actions">
              <button className="toast-btn confirm" onClick={() => { t.action.onConfirm(); removeToast(t.id); }}>
                Delete
              </button>
              <button className="toast-btn cancel" onClick={() => removeToast(t.id)}>
                Cancel
              </button>
            </div>
          </div>
        ))}
      </div>

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

ToastProvider.propTypes = {
  children: PropTypes.node.isRequired
};