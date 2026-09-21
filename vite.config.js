import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    // Batch FS Fase 2.5 G0 — satu alias `@/` → `src/` (Fase 0 §7). Bentuk regex
    // `^@/` (bukan string '@') supaya paket ber-scope seperti `@supabase/*`,
    // `@react-pdf/*`, `@sentry/*` mustahil ikut ter-alias. Dipakai hanya oleh
    // `src/routes/*` dulu; file lain tetap impor relatif sampai gilirannya.
    alias: [
      { find: /^@\//, replacement: fileURLToPath(new URL('./src/', import.meta.url)) },
    ],
  },
  build: {
    rolldownOptions: {
      output: {
        // Split heavy vendor libraries into separate cached chunks.
        // Uses the native Vite 8 / Rolldown codeSplitting API (not deprecated manualChunks).
        // This does NOT change any source code or business logic.
        codeSplitting: {
          groups: [
            {
              name: 'vendor-react',
              test: /node_modules[\\/](react|react-dom)[\\/]/,
              priority: 10,
            },
            {
              name: 'vendor-supabase',
              test: /node_modules[\\/]@supabase[\\/]/,
              priority: 9,
            },
            {
              name: 'vendor-recharts',
              test: /node_modules[\\/]recharts[\\/]/,
              priority: 8,
            },
            {
              name: 'vendor-lucide',
              test: /node_modules[\\/]lucide-react[\\/]/,
              priority: 7,
            },
            {
              // G0: react-router terpasang tapi BELUM diimpor siapa pun — chunk ini
              // baru muncul di dist/ begitu G1 mulai memakainya (Fase 0 §6).
              name: 'vendor-router',
              test: /node_modules[\\/]react-router[\\/]/,
              priority: 6,
            },
            {
              // G0: @sentry/* dipisah supaya ukurannya terbaca sendiri di output build.
              name: 'vendor-sentry',
              test: /node_modules[\\/]@sentry[\\/]/,
              priority: 5,
            },
          ],
        },
      },
    },
  },
})
