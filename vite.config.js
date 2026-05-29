import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
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
          ],
        },
      },
    },
  },
})
