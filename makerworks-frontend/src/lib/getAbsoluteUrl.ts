// src/lib/getAbsoluteUrl.ts
// Resolve a provided path to an absolute URL.
// Handles both static assets served from API origin (e.g. /uploads/, /thumbnails/)
// and API routes that require the configured API base URL.

export default function getAbsoluteUrl(path?: string | null): string | null {
  if (!path) return null;

  // Already absolute URL? Return as-is.
  if (/^https?:\/\//i.test(path)) {
    return path;
  }

  // Normalize leading slash
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;

  // Determine base API URL from env or fallback
  const base =
    import.meta.env.VITE_API_BASE_URL?.replace(/\/+$/, '') ||
    'http://localhost:8000';

  // Extract origin (protocol + host[:port]) for static asset serving
  let origin: string;
  try {
    const u = new URL(base, window.location.origin);
    origin = `${u.protocol}//${u.host}`;
  } catch {
    origin = base;
  }

  // If it's a static asset path, serve from API origin root, not API prefix
  if (
    normalizedPath.startsWith('/uploads/') ||
    normalizedPath.startsWith('/thumbnails/')
  ) {
    return `${origin}${normalizedPath}`;
  }

  // Otherwise, treat as API route
  return `${base}${normalizedPath}`;
}
