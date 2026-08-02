
import { createContext, useContext, useEffect, useState } from 'react';

const STORAGE_KEY = 'bp-mock-mode';

const MockModeContext = createContext<[boolean, (enabled: boolean) => void] | null>(null);

export function MockModeProvider({ children }: { children: React.ReactNode }) {
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    setEnabled(window.localStorage.getItem(STORAGE_KEY) === '1');
  }, []);

  function set(next: boolean) {
    setEnabled(next);
    window.localStorage.setItem(STORAGE_KEY, next ? '1' : '0');
  }

  return (
    <MockModeContext.Provider value={[enabled, set]}>{children}</MockModeContext.Provider>
  );
}

export function useMockMode(): [boolean, (enabled: boolean) => void] {
  const context = useContext(MockModeContext);
  if (!context) {
    throw new Error('useMockMode must be used within a MockModeProvider');
  }
  return context;
}
