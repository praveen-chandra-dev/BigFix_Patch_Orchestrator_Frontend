import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { ToastProvider } from './components/common/CustomToast'
import './styles/toast.css'
import App from './App.jsx'

createRoot(document.getElementById('root')).render(
 
    <ToastProvider>
      <App />
    </ToastProvider>
)


