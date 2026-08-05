'use client';

import * as React from 'react';

const MOBILE_BREAKPOINT = 768;

/**
 * Reports whether the viewport is mobile-sized. Returns `false` during SSR and the
 * first client render so the markup matches, then updates on mount.
 */
export function useIsMobile() {
  const [isMobile, setIsMobile] = React.useState(false);

  React.useEffect(() => {
    const query = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`);
    const update = () => setIsMobile(query.matches);
    update();
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);

  return isMobile;
}
