// src/hooks/useUrlState.js
// Syncs one piece of string state to a URL query param. Read once on mount,
// written via history.replaceState (never pushState, so Back/Forward isn't an
// "undo"). Setting a value equal to defaultValue removes the param, keeping
// the URL clean for the default state. Popstate (Back/Forward) re-syncs the
// state. Safe with multiple keys on one page — each read/write re-parses the
// live query string and only touches its own key. Strings only; callers
// convert other types themselves.

import { useState, useCallback, useEffect } from 'react';

function readParam(key, defaultValue) {
  const params = new URLSearchParams(window.location.search);
  const raw = params.get(key);
  return raw === null ? defaultValue : raw;
}

function writeParam(key, value, defaultValue) {
  const params = new URLSearchParams(window.location.search);
  if (value === defaultValue) {
    params.delete(key);
  } else {
    params.set(key, value);
  }
  const query = params.toString();
  const url = `${window.location.pathname}${query ? `?${query}` : ''}${window.location.hash}`;
  window.history.replaceState(window.history.state, '', url);
}

export function useUrlState(key, defaultValue) {
  const [value, setValueState] = useState(() => readParam(key, defaultValue));

  const setValue = useCallback((next) => {
    setValueState(next);
    writeParam(key, next, defaultValue);
  }, [key, defaultValue]);

  useEffect(() => {
    const onPopState = () => setValueState(readParam(key, defaultValue));
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, [key, defaultValue]);

  return [value, setValue];
}
