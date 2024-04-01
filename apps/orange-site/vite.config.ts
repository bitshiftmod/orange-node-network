import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  define: {
    "global.WebSocket": "globalThis.WebSocket",
},
  plugins: [react()],
})
