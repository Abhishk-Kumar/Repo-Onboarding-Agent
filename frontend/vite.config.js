import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      '/onboard': 'http://localhost:8000',
      '/ask': 'http://localhost:8000',
      '/trace_flow': 'http://localhost:8000',
      '/start_here': 'http://localhost:8000',
      '/blast_radius': 'http://localhost:8000',
      '/explain_file': 'http://localhost:8000',
    },
  },
})
