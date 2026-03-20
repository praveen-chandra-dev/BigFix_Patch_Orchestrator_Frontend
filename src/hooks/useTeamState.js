// src/hooks/useTeamState.js
import { useState, useEffect, useCallback } from 'react';

const API = window.env.VITE_API_BASE;

export function useTeamState() {
  const [state, setState] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeRole, setActiveRole] = useState(sessionStorage.getItem('user_role') || '');

  // Function to pull the synchronized state from the Backend DB
  const fetchState = useCallback(async (roleToFetch) => {
    if (!roleToFetch) {
        setLoading(false); // CRITICAL FIX: Ensure loading doesn't hang if no role is present
        return;
    }
    setLoading(true);
    try {
      const res = await fetch(`${API}/api/auth/team-state?role=${encodeURIComponent(roleToFetch)}`, {
          headers: { "x-user-role": roleToFetch }
      });
      const data = await res.json();
      if (data.ok) {
        setState(data.state || {});
      }
    } catch (e) {
      console.error("Failed to sync team state from database", e);
    } finally {
      setLoading(false);
    }
  }, []);

  // Listen for the Role Switcher dropdown event
  useEffect(() => {
    fetchState(activeRole);

    const handleRoleChanged = (e) => {
      const newRole = e.detail;
      setActiveRole(newRole);
      fetchState(newRole);
    };

    window.addEventListener('role:changed', handleRoleChanged);
    return () => window.removeEventListener('role:changed', handleRoleChanged);
  }, [fetchState, activeRole]);

  // Function to save progress (e.g. user completes Pilot)
  const saveState = async (newStateUpdates) => {
    const roleToUpdate = sessionStorage.getItem('user_role');
    if (!roleToUpdate) return;

    const mergedState = { ...state, ...newStateUpdates };
    
    // Instantly update UI for smooth experience
    setState(mergedState); 

    // Blindly sync to DB in the background
    try {
      await fetch(`${API}/api/auth/team-state?role=${encodeURIComponent(roleToUpdate)}`, {
        method: "POST",
        headers: { 
            "Content-Type": "application/json",
            "x-user-role": roleToUpdate
        },
        body: JSON.stringify(mergedState)
      });
    } catch (e) {
      console.error("Failed to commit team state to database", e);
    }
  };

  return { state, saveState, loading };
}