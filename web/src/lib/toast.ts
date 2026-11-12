import { useSyncExternalStore } from 'react';

let current = { id: 0, text: '' };
const listeners = new Set<() => void>();
let timer: ReturnType<typeof setTimeout> | undefined;

export function toast(text: string) {
  current = { id: current.id + 1, text };
  listeners.forEach(fn => fn());
  clearTimeout(timer);
  timer = setTimeout(() => { current = { ...current, text: '' }; listeners.forEach(fn => fn()); }, 3600);
}

export const useToast = () => useSyncExternalStore(fn => { listeners.add(fn); return () => { listeners.delete(fn); }; }, () => current);
