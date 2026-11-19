'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';

export function startNavigationLoading() {
  window.dispatchEvent(new Event('satvic:navigation-start'));
}

export default function NavigationLoading() {
  const pathname = usePathname();
  const [visible, setVisible] = useState(false);
  const originPath = useRef(pathname);
  const showTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const safetyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (originPath.current !== pathname) {
      originPath.current = pathname;
      if (showTimer.current) clearTimeout(showTimer.current);
      if (safetyTimer.current) clearTimeout(safetyTimer.current);
      setVisible(false);
    }
  }, [pathname]);

  useEffect(() => {
    const begin = () => {
      if (showTimer.current) clearTimeout(showTimer.current);
      if (safetyTimer.current) clearTimeout(safetyTimer.current);
      originPath.current = pathname;
      showTimer.current = setTimeout(() => setVisible(true), 120);
      safetyTimer.current = setTimeout(() => {
        setVisible(false);
        showTimer.current = null;
        safetyTimer.current = null;
      }, 15_000);
    };

    const onLinkClick = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const target = event.target;
      if (!(target instanceof Element)) return;
      const link = target.closest<HTMLAnchorElement>('a[href]');
      if (!link || link.target === '_blank' || link.hasAttribute('download')) return;
      const destination = new URL(link.href, window.location.href);
      if (destination.origin !== window.location.origin || destination.pathname === window.location.pathname) return;
      begin();
    };

    window.addEventListener('satvic:navigation-start', begin);
    window.addEventListener('popstate', begin);
    document.addEventListener('click', onLinkClick, true);
    return () => {
      window.removeEventListener('satvic:navigation-start', begin);
      window.removeEventListener('popstate', begin);
      document.removeEventListener('click', onLinkClick, true);
      if (showTimer.current) clearTimeout(showTimer.current);
      if (safetyTimer.current) clearTimeout(safetyTimer.current);
    };
  }, [pathname]);

  if (!visible) return null;
  return (
    <div className="route-loading" role="status" aria-live="polite" aria-label="Loading page">
      <span className="route-loading-mark" aria-hidden="true" />
      <span className="route-loading-label">Loading</span>
    </div>
  );
}
