import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': { target: 'http://localhost:3000', changeOrigin: true },
    },
  },
  define: {
     CESIUM_BASE_URL: JSON.stringify(
      "/node_modules/cesium/Build/Cesium"
    ),
  },
})
