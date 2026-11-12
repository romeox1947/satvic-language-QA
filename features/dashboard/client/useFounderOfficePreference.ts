'use client';

import { useCallback, useEffect, useState } from 'react';

const preferenceEvent = 'satvic-founder-office-preference';

export function useFounderOfficePreference(accountEmail: string) {
  const storageKey = `satvic:${accountEmail.trim().toLowerCase() || 'workspace'}:founder-office-enabled`;
  const [enabled, setEnabled] = useState(true);

  useEffect(() => {
    const sync = () => {
      try { setEnabled(window.localStorage.getItem(storageKey) !== 'false'); }
      catch { setEnabled(true); }
    };
    sync();
    window.addEventListener('storage', sync);
    window.addEventListener(preferenceEvent, sync);
    return () => {
      window.removeEventListener('storage', sync);
      window.removeEventListener(preferenceEvent, sync);
    };
  }, [storageKey]);

  const updateEnabled = useCallback((nextEnabled: boolean) => {
    try { window.localStorage.setItem(storageKey, String(nextEnabled)); }
    catch { /* Keep the current session usable when browser storage is unavailable. */ }
    setEnabled(nextEnabled);
    window.dispatchEvent(new Event(preferenceEvent));
  }, [storageKey]);

  return [enabled, updateEnabled] as const;
}
