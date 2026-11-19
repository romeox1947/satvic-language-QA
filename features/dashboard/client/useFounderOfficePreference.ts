'use client';

/** Founder Office is not available yet, including for accounts with an old saved preference. */
export function useFounderOfficePreference(_accountEmail: string) {
  return [false, () => undefined] as const;
}
