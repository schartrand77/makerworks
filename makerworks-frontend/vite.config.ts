// vite.config.ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react-swc';
import path from 'node:path';
import fs from 'node:fs';

// Allow overriding the backend origin, but default to local dev backend.
const BACKEND = (process.env.VITE_BACKEND_URL?.replace(/\/$/, '') || 'http://localhost:8000');

// Resolve app version safely across layouts/containers
function resolveVersion(): string {
  // 0) explicit env (CI/CD or docker-compose)
  const envVer = (process.env.VITE_APP_VERSION || process.env.APP_VERSION || '').trim();
  if (envVer) return envVer;

  const tryRead = (p: string) => {
    try {
      if (fs.existsSync(p)) return fs.readFileSync(p, 'utf8').trim();
    } catch (_) { /* ignore */ }
    return '';
  };

  // 1) alongside this config (common in container: /app/VERSION)
  const here = path.resolve(__dirname, 'VERSION');
  const v1 = tryRead(here);
  if (v1) return v1;

  // 2) project CWD (some tools run from repo root)
  const cwd = path.resolve(process.cwd(), 'VERSION');
  const v2 = tryRead(cwd);
  if (v2) return v2;

  // 3) monorepo-ish layout (frontend in subdir)
  const up = path.resolve(__dirname, '../VERSION');
  const v3 = tryRead(up);
  if (v3) return v3;

  // 4) last resort
  return '0.0.0';
}

const APP_VERSION = resolveVersion();

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
  define: {
    'import.meta.env.VITE_APP_VERSION': JSON.stringify(APP_VERSION),
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
    // 👇 The reason your PNG looked like a web page last time was proxying mistakes.
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
        target: BACKEND,  // <- fixed typo
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
    sourcemap: true,
  },
});
