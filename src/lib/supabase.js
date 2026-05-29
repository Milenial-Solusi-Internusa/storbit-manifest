// src/lib/supabase.js
// Supabase client singleton — import dari sini di seluruh app.

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error(
    '[Supabase] Missing env vars. Pastikan .env.local sudah ada VITE_SUPABASE_URL dan VITE_SUPABASE_KEY.'
  );
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
  realtime: {
    // Disable auto-connect; kita gak pake realtime sub di Phase 5 awal.
    // Bisa di-enable lagi nanti kalau perlu live updates.
    params: {
      eventsPerSecond: 1,
    },
  },
  global: {
    headers: {
      'X-Client-Info': 'storbit-manifest',
    },
  },
});