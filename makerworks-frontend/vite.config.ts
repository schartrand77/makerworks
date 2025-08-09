// vite.config.ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react-swc'
import path from 'node:path'

export default defineConfig({
  plugins: [
    react(),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  css: {
    postcss: path.resolve(__dirname, './postcss.config.js'),
  },
  server: {
    host: true,          // equivalent to '0.0.0.0', works better with Vite 7 in Docker/LAN
    port: 5173,
    strictPort: true,
    open: false,
    cors: true,
    watch: {
      usePolling: true,  // helps with file change detection in Docker/VM mounts
    },
  },
  preview: {
    host: true,
    port: 4173,
  },
  optimizeDeps: {
    include: ['react', 'react-dom'],
  },
})
