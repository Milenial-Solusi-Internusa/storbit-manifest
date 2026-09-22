import { useContext } from 'react';
import { AppShellContext } from './appShellCtx';

export function useAppShell() {
  const ctx = useContext(AppShellContext);
  if (!ctx) {
    throw new Error('useAppShell must be used inside <AppShellContext.Provider> (App.jsx)');
  }
  return ctx;
}
