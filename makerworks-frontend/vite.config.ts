// vite.config.ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react-swc'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    host: '0.0.0.0',  // bind to all interfaces so LAN clients can connect
    port: 5173,
    strictPort: true,
    open: false,
    cors: true,
  },
  preview: {
    host: '0.0.0.0',
    port: 4173,
  },
})
