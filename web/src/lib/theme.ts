import { useSyncExternalStore } from 'react';

export type Theme = 'studio' | 'ledger';
const KEY = 'aushadhitrack.theme';
const listeners = new Set<() => void>();

function read(): Theme {
  try { return localStorage.getItem(KEY) === 'ledger' ? 'ledger' : 'studio'; } catch { return 'studio'; }
}

/** Applies the saved look before the first render, so the page doesn't flash the other one. */
export function applyTheme(theme: Theme = read()) {
  document.documentElement.dataset.theme = theme;
}

export function setTheme(theme: Theme) {
  try { localStorage.setItem(KEY, theme); } catch { /* ignore */ }
  applyTheme(theme);
  listeners.forEach(fn => fn());
}

export const useTheme = () => useSyncExternalStore(
  fn => { listeners.add(fn); return () => { listeners.delete(fn); }; },
  () => (document.documentElement.dataset.theme as Theme) ?? 'studio',
);
