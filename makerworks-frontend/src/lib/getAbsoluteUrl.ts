export default function getAbsoluteUrl(path?: string | null): string | null {
  if (!path) return null;
  const base =
    import.meta.env.VITE_API_BASE_URL?.replace(/\/+$/, '') || 'http://localhost:8000';
  return path.startsWith('http') ? path : `${base}${path}`;
}
