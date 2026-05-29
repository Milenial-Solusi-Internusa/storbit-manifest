// src/hooks/useDebounce.js
// Thin debounce hook. Returns a lagging copy of `value` that only updates
// after `delay` ms of quiet. Safe to use in dependency arrays.

import { useState, useEffect } from 'react';

export function useDebounce(value, delay = 300) {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);

  return debounced;
}
