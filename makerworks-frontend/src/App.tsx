// src/App.tsx
import React, { Suspense, useEffect, useState } from "react";
import { useSessionRefresh } from "@/hooks/useSessionRefresh";
import GlassNavbar from "@/components/ui/GlassNavbar";
import RoutesRenderer from "@/routes";
import { useAuthStore } from "@/store/useAuthStore";
import ErrorBoundary from "@/components/system/ErrorBoundary";

// Lightweight loading UI used both for initial auth and lazy chunk fallback
function AppSkeleton() {
  return (
    <div className="min-h-[60vh] w-full flex items-center justify-center">
      <div className="flex items-center gap-3 text-gray-500 dark:text-gray-300">
        <span className="h-5 w-5 animate-spin rounded-full border-2 border-gray-400 border-t-transparent" />
        <span>Loading…</span>
      </div>
    </div>
  );
}

function AppContent() {
  return (
    <div className="pt-16">
      <ErrorBoundary>
        <Suspense fallback={<AppSkeleton />}>
          <RoutesRenderer />
        </Suspense>
      </ErrorBoundary>
    </div>
  );
}

export default function App() {
  // IMPORTANT: do NOT select a freshly-created object from the store.
  // Select individual fields so getSnapshot stays stable.
  const resolved = useAuthStore((s) => s.resolved);
  const fetchUser = useAuthStore((s) => s.fetchUser);
  const setUser = useAuthStore((s) => s.setUser);
  const setResolved = useAuthStore((s) => s.setResolved);

  // Keeps tokens/cookies alive as you designed
  useSessionRefresh();

  // Track theme so Tailwind transitions look correct on toggle
  const [isDark, setIsDark] = useState(
    document.documentElement.classList.contains("dark")
  );

  useEffect(() => {
    const observer = new MutationObserver(() => {
      setIsDark(document.documentElement.classList.contains("dark"));
    });
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });
    return () => observer.disconnect();
  }, []);

  // Initial auth bootstrap with cancellation guard
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const u = await fetchUser?.(true);
        if (cancelled) return;
        if (!u) {
          console.warn("[App.tsx] 🚫 No user returned from fetchUser");
          setUser?.(null);
        } else {
          console.info("[App.tsx] ✅ User fetched successfully:", u);
          setUser?.(u);
        }
      } catch (err) {
        console.error("[App.tsx] ❌ Error in fetchUser:", err);
        if (!cancelled) setUser?.(null);
      } finally {
        // Only flip the flag if it isn't already true to avoid cascaded updates.
        if (!cancelled && !resolved) setResolved?.(true);
      }
    })();
    return () => {
      cancelled = true;
    };
    // fetchUser/setUser/setResolved are stable from the store; listing them keeps ESLint happy
  }, [fetchUser, setUser, setResolved, resolved]);

  return (
    <div className="min-h-screen transition-colors duration-500 text-gray-900 dark:text-white">
      <GlassNavbar />
      {/* Gate the app until we’ve tried to resolve auth at least once */}
      {!resolved ? <AppSkeleton /> : <AppContent />}
    </div>
  );
}
