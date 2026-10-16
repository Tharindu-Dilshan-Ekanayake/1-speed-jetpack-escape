import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  // Relative asset URLs, so the build zip runs wherever it is served
  // (Boxity frontend hosting, the game server, any static host).
  base: './',
  server: {
    // ../shared holds the game config + world generator used by the server too.
    fs: { allow: ['..'] },
  },
  build: {
    chunkSizeWarningLimit: 2000,
  },
})
