// src/App.tsx
import { useEffect, useState } from 'react';
import { useSessionRefresh } from '@/hooks/useSessionRefresh';
import GlassNavbar from '@/components/ui/GlassNavbar';
import RoutesRenderer from '@/routes';
import { useAuthStore } from '@/store/useAuthStore';

function AppContent() {
  return (
    <div className="pt-16">
      <RoutesRenderer />
    </div>
  );
}

export default function App() {
  const { setUser, fetchUser, setResolved, resolved } = useAuthStore.getState();
  useSessionRefresh();

  const [isDark, setIsDark] = useState(document.documentElement.classList.contains('dark'));

  useEffect(() => {
    // Watch for theme changes (ThemeSection toggles .dark on <html>)
    const observer = new MutationObserver(() => {
      setIsDark(document.documentElement.classList.contains('dark'));
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    let mounted = true;

    const runAuthFetch = async () => {
      try {
        const u = await fetchUser(true);
        if (!u && mounted) {
          console.warn('[App.tsx] 🚫 No user returned from fetchUser');
          typeof setUser === 'function' && setUser(null);
        } else if (u) {
          console.info('[App.tsx] ✅ User fetched successfully:', u);
        }
      } catch (err) {
        console.error('[App.tsx] ❌ Error in fetchUser:', err);
        if (mounted && typeof setUser === 'function') {
          setUser(null);
        }
      } finally {
        if (mounted && typeof setResolved === 'function' && !resolved) {
          setResolved(true);
        }
      }
    };

    runAuthFetch();
    return () => {
      mounted = false;
    };
  }, []);

  return (
    <div
      className={
        'min-h-screen transition-colors duration-500 text-gray-900 dark:text-white'
      }
    >
      <GlassNavbar />
      <AppContent />
    </div>
  );
}
