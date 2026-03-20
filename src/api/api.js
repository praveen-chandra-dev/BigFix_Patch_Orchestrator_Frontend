import axios from "axios";

// Use the dynamic environment variable provided by Patch Setu's backend, 
// or fallback to localhost:5174 during local development.
const API_BASE = window.env?.VITE_API_BASE || "http://localhost:5174";

export default axios.create({
  baseURL: `${API_BASE}/api`,
  withCredentials: true, // SECURE: Automatically sends the HTTP-Only cookie with every request
});