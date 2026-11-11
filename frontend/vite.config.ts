import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// En desarrollo, Vite (5173) redirige /api al servicio (3000): un solo origen, sin CORS.
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: { '/api': 'http://localhost:3000' },
  },
})
