import { useState, useEffect } from 'react';

const MOBILE_BREAKPOINT = 768;
const TABLET_BREAKPOINT = 1024;

interface ResponsiveState {
  isMobile: boolean;   // < 768px
  isTablet: boolean;   // 768px - 1024px
  isDesktop: boolean;  // > 1024px
}

export function useResponsive(): ResponsiveState {
  const [state, setState] = useState<ResponsiveState>(() => {
    const w = window.innerWidth;
    return {
      isMobile: w < MOBILE_BREAKPOINT,
      isTablet: w >= MOBILE_BREAKPOINT && w <= TABLET_BREAKPOINT,
      isDesktop: w > TABLET_BREAKPOINT,
    };
  });

  useEffect(() => {
    const mobileQuery = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`);
    const tabletQuery = window.matchMedia(`(min-width: ${MOBILE_BREAKPOINT}px) and (max-width: ${TABLET_BREAKPOINT}px)`);

    const update = () => {
      setState({
        isMobile: mobileQuery.matches,
        isTablet: tabletQuery.matches,
        isDesktop: !mobileQuery.matches && !tabletQuery.matches,
      });
    };

    mobileQuery.addEventListener('change', update);
    tabletQuery.addEventListener('change', update);
    return () => {
      mobileQuery.removeEventListener('change', update);
      tabletQuery.removeEventListener('change', update);
    };
  }, []);

  return state;
}
