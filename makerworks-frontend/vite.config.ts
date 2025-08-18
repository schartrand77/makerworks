// vite.config.ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react-swc'
import path from 'node:path'

// Allow overriding the backend origin, but default to local dev backend.
const BACKEND = process.env.VITE_BACKEND_URL?.replace(/\/$/, '') || 'http://localhost:8000'

// Helpful note:
// Vite proxies only apply to the dev server. In production you should serve absolute URLs
// from the API (e.g. thumbnail_url = `${BASE_URL}/thumbnails/<id>.png`) or use a real reverse proxy.

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  css: {
    postcss: path.resolve(__dirname, './postcss.config.js'),
  },
  server: {
    host: true,          // '0.0.0.0' for Docker/LAN
    port: 5173,
    strictPort: true,
    open: false,
    cors: true,
    watch: {
      usePolling: true,  // helps with file change detection in Docker/VM mounts
    },
    // 👇 The reason your PNG looked like a web page.
    proxy: {
      // API
      '/api': {
        target: BACKEND,
        changeOrigin: true,
      },
      // Static assets served by the backend (FastAPI StaticFiles)
      '/static': {
        target: BACKEND,
        changeOrigin: true,
      },
      // User uploads (if the backend serves them directly)
      '/uploads': {
        target: BACKEND,
        changeOrigin: true,
      },
      // Generated thumbnails (your STL → PNG output)
      '/thumbnails': {
        target: BACKEND,
        changeOrigin: true,
      },
    },
  },
  preview: {
    host: true,
    port: 4173,
    // Note: vite preview does NOT support proxy. Use absolute URLs from the API in prod.
  },
  optimizeDeps: {
    include: ['react', 'react-dom'],
    exclude: ['ioredis'],
  },
  build: {
    rollupOptions: {
      external: ['ioredis'],
    },
  },
})
