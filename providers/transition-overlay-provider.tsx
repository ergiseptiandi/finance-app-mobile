import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';

type TransitionOverlayContextValue = {
  isTransitionOverlayVisible: boolean;
  showTransitionOverlay: () => void;
  hideTransitionOverlay: () => void;
};

const TransitionOverlayContext = createContext<TransitionOverlayContextValue | null>(null);

export function TransitionOverlayProvider({ children }: { children: ReactNode }) {
  const [isTransitionOverlayVisible, setIsTransitionOverlayVisible] = useState(false);

  const showTransitionOverlay = useCallback(() => {
    setIsTransitionOverlayVisible(true);
  }, []);

  const hideTransitionOverlay = useCallback(() => {
    setIsTransitionOverlayVisible(false);
  }, []);

  const value = useMemo(
    () => ({
      isTransitionOverlayVisible,
      showTransitionOverlay,
      hideTransitionOverlay,
    }),
    [hideTransitionOverlay, isTransitionOverlayVisible, showTransitionOverlay]
  );

  return <TransitionOverlayContext.Provider value={value}>{children}</TransitionOverlayContext.Provider>;
}

export function useTransitionOverlay() {
  const context = useContext(TransitionOverlayContext);

  if (!context) {
    throw new Error('useTransitionOverlay must be used inside TransitionOverlayProvider');
  }

  return context;
}
