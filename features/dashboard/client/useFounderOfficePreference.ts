'use client';

import { useCallback, useEffect, useState } from 'react';

export function useFounderOfficePreference(_accountEmail?: string) {
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    let active = true;
    fetch('/api/preferences/founder-office', { cache: 'no-store' })
      .then(async response => ({ response, body: await response.json().catch(() => ({})) }))
      .then(({ response, body }) => { if (active && response.ok) setEnabled(body.enabled === true); })
      .catch(() => {});
    return () => { active = false; };
  }, []);

  const savePreference = useCallback(async (nextEnabled: boolean) => {
    const response = await fetch('/api/preferences/founder-office', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ enabled: nextEnabled }),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error || 'Could not update Founder Office.');
    setEnabled(body.enabled === true);
  }, []);

  return [enabled, savePreference] as const;
}
