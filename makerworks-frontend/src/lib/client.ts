// src/lib/client.ts
import axios from 'axios';

// Resolve a stable API base URL (works in dev & prod)
const raw = import.meta.env.VITE_API_PREFIX || '/api/v1';
const guessed =
  raw.startsWith('/') && window.location.port === '5173'
    ? 'http://localhost:8000/api/v1'
    : raw;
const baseURL = guessed.replace(/\/+$/, '');

const client = axios.create({
  baseURL,
  withCredentials: true,
  timeout: 10_000, // hard-stop requests that would otherwise hang
});

// Simple request/response logging with the "orig→fixed" message you saw
client.interceptors.request.use((cfg) => {
  try {
    const token = localStorage.getItem('mw.jwt');
    if (token && !cfg.headers?.Authorization) {
      cfg.headers = { ...(cfg.headers || {}), Authorization: `Bearer ${token}` };
    }
  } catch {}
  if (import.meta.env.DEV) {
    const url = (cfg.baseURL || '') + (cfg.url || '');
    // eslint-disable-next-line no-console
    console.info('[axios]', cfg.method?.toUpperCase() || 'GET', '→', url);
  }
  return cfg;
});

client.interceptors.response.use(
  (r) => r,
  (err) => {
    if (import.meta.env.DEV) {
      const url =
        (err?.config?.baseURL || '') + (err?.config?.url || '');
      // eslint-disable-next-line no-console
      console.warn('[axios:error]', err?.code || err?.response?.status, '→', url);
    }
    return Promise.reject(err);
  }
);

export default client;
