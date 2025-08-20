// src/pages/Settings.tsx
import { useEffect, useMemo, useState } from 'react';
import AvatarSection from '@/components/settings/AvatarSection';
import ProfileSection from '@/components/settings/ProfileSection';
import { useAuthStore } from '@/store/useAuthStore';
import getAbsoluteUrl from '@/lib/getAbsoluteUrl';
import http from '@/api/axios';

export default function Settings() {
  const user = useAuthStore((s) => s.user);
  const setUser = useAuthStore((s) => s.setUser);

  const [showAvatarEditor, setShowAvatarEditor] = useState(false);

  const cachedAvatar =
    typeof window !== 'undefined' ? localStorage.getItem('avatar_url') : null;

  const avatarSrc = useMemo(
    () =>
      getAbsoluteUrl(user?.avatar_url) ||
      getAbsoluteUrl((user as any)?.thumbnail_url) ||
      (cachedAvatar ? getAbsoluteUrl(cachedAvatar) : null) ||
      '/default-avatar.png',
    [user?.avatar_url, (user as any)?.thumbnail_url, cachedAvatar]
  );

  const handleAvatarUpdate = (newUrl: string) => {
    const updatedUser = { ...user, avatar_url: newUrl };
    setUser(updatedUser as any);
    if (typeof window !== 'undefined') localStorage.setItem('avatar_url', newUrl);
    setShowAvatarEditor(false);
  };

  useEffect(() => {
    if (!user?.avatar_url && cachedAvatar) {
      setUser({ ...(user as any), avatar_url: cachedAvatar });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const displayName =
    (user?.name && String(user.name)) ||
    (user?.username && `@${user.username}`) ||
    (user?.email ?? 'Account');

  return (
    <div className="relative mx-auto flex min-h-[60vh] items-start justify-center p-6">
      {/* subtle rings */}
      <div className="pointer-events-none absolute inset-0 -z-10">
        <Halo className="absolute -top-24 -right-20 h-48 w-48" strength="md" />
        <Halo className="absolute -bottom-24 -left-24 h-48 w-48" strength="sm" />
      </div>

      {/* single compact card */}
      <div
        className="
          relative w-full max-w-md overflow-hidden rounded-[22px]
          bg-white/65 dark:bg-[#0b0f1a]/55 backdrop-blur-2xl
          shadow-[0_10px_40px_-10px_rgba(0,0,0,0.35)]
          ring-1 ring-white/25 dark:ring-white/10
          border border-white/25 dark:border-white/10
        "
      >
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-white/45 via-transparent to-white/10 dark:from-white/10 dark:to-transparent" />

        {/* header: live avatar + tiny theme toggle */}
        <header className="relative z-10 flex items-center gap-4 p-5">
          <button
            type="button"
            onClick={() => setShowAvatarEditor(true)}
            className="group relative h-14 w-14 overflow-hidden rounded-2xl shadow-lg ring-4 ring-orange-500/45 ring-offset-2 ring-offset-white/40 dark:ring-orange-400/45 dark:ring-offset-white/10"
            title="Change avatar"
          >
            <RingOverlay />
            <img
              src={avatarSrc || '/default-avatar.png'}
              alt="Avatar"
              className="h-full w-full object-cover transition-transform group-active:scale-[0.98]"
              draggable={false}
            />
            <span className="pointer-events-none absolute inset-x-0 bottom-0 m-1 rounded-full bg-black/45 px-2 py-0.5 text-center text-[10px] font-medium text-white">
              Change
            </span>
          </button>

          <div className="min-w-0">
            <h1 className="truncate text-lg font-semibold tracking-tight text-gray-900 dark:text-gray-50">
              {displayName}
            </h1>
            <p className="mt-0.5 text-[13px] text-gray-600/90 dark:text-gray-300/90">
              Settings — one card to rule them all
            </p>
          </div>

          <div className="ml-auto">
            <ThemeToggle />
          </div>
        </header>

        <Divider />

        {/* body: just Profile details; avatar editor moved to header modal */}
        <div className="relative z-10 space-y-6 p-5 pt-4">
          <Section title="Profile">
            <div className="rounded-2xl border border-white/20 bg-white/40 p-4 backdrop-blur-xl dark:border-white/10 dark:bg-white/5 ring-1 ring-orange-500/10">
              <ProfileSection />
            </div>
          </Section>

          <Section title="Danger Zone" subtitle="This cannot be undone. Like, at all.">
            <DangerDelete userId={user?.id} />
          </Section>
        </div>
      </div>

      {/* lightweight modal for avatar editing */}
      {showAvatarEditor && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4"
          onClick={() => setShowAvatarEditor(false)}
        >
          <div
            className="relative w-full max-w-sm overflow-hidden rounded-2xl bg-white/90 p-4 shadow-2xl ring-1 ring-white/40 backdrop-blur-2xl dark:bg-[#0b0f1a]/70 dark:ring-white/10"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="absolute right-2 top-2">
              <button
                onClick={() => setShowAvatarEditor(false)}
                className="rounded-full bg-white/80 px-2 py-1 text-xs font-semibold text-gray-700 ring-1 ring-gray-300 hover:bg-white dark:bg-white/10 dark:text-gray-200 dark:ring-white/20"
              >
                Close
              </button>
            </div>
            <AvatarSection currentAvatar={avatarSrc} onAvatarUpdate={handleAvatarUpdate} />
          </div>
        </div>
      )}
    </div>
  );
}

/* ——— tiny components ———————————————————————— */

function Divider() {
  return (
    <div className="relative z-10 h-px w-full bg-gradient-to-r from-transparent via-black/10 to-transparent dark:via-white/10" />
  );
}

function Section(props: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <section aria-labelledby={slugify(props.title)}>
      <div className="mb-2">
        <h2
          id={slugify(props.title)}
          className="text-sm font-semibold uppercase tracking-wider text-gray-900/80 dark:text-gray-100/80"
        >
          {props.title}
        </h2>
        {props.subtitle && (
          <p className="mt-1 text-xs text-gray-700/80 dark:text-gray-300/80">{props.subtitle}</p>
        )}
      </div>
      {props.children}
    </section>
  );
}

function RingOverlay() {
  return <div className="pointer-events-none absolute -inset-1 rounded-3xl ring-1 ring-orange-400/25" />;
}

function Halo({
  className = '',
  strength = 'md',
}: {
  className?: string;
  strength?: 'sm' | 'md';
}) {
  const base = strength === 'sm' ? 'border border-orange-400/25' : 'border-2 border-orange-500/35';
  return <div className={`${className} rounded-full ${base} blur-[1px]`} />;
}

function slugify(s: string) {
  return s.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
}

/* ——— theme toggle (small pill) ——————————————————— */

function ThemeToggle() {
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    if (typeof window === 'undefined') return 'light';
    const saved = localStorage.getItem('theme') as 'light' | 'dark' | null;
    if (saved) return saved;
    return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  });

  useEffect(() => {
    if (typeof document !== 'undefined') {
      document.documentElement.classList.toggle('dark', theme === 'dark');
      localStorage.setItem('theme', theme);
    }
  }, [theme]);

  return (
    <button
      onClick={() => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))}
      className="
        group relative inline-flex items-center gap-2 rounded-full
        bg-white/70 px-3 py-1.5 text-[12px] font-medium
        ring-1 ring-inset ring-white/40 backdrop-blur-xl
        dark:bg-white/10 dark:ring-white/10
      "
      title="Toggle theme"
    >
      <span
        className={`
          inline-block h-4 w-4 rounded-full
          ${theme === 'dark' ? 'bg-orange-500' : 'bg-orange-300'}
          ring-2 ring-orange-400/60 transition-colors
        `}
      />
      <span className="text-gray-700/90 dark:text-gray-200/90">{theme === 'dark' ? 'Dark' : 'Light'}</span>
    </button>
  );
}

/* ——— delete account button ——————————————————— */

function DangerDelete({ userId }: { userId?: string }) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  async function nuke() {
    if (!userId) return;
    setBusy(true);
    try {
      try {
        await http.delete('users/me');
      } catch {
        await http.delete(`admin/users/${userId}`);
      }
      try {
        await http.post('auth/signout', {});
      } catch {}
      window.location.href = '/';
    } catch {
      alert('Delete failed.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex items-center justify-between rounded-2xl border border-red-300/40 bg-red-50/70 p-4 backdrop-blur-xl dark:border-red-400/30 dark:bg-red-400/10">
      <div>
        <p className="text-sm font-semibold text-red-900/90 dark:text-red-200">Delete account</p>
        <p className="text-xs text-red-900/70 dark:text-red-300/80">
          Removes your account and associated data. This is permanent.
        </p>
      </div>
      <div className="flex items-center gap-2">
        {!confirming ? (
          <button
            onClick={() => setConfirming(true)}
            className="rounded-full bg-white/90 px-3 py-1.5 text-xs font-semibold text-red-700 ring-1 ring-red-300/60 hover:bg-white dark:bg-white/10 dark:text-red-300 dark:ring-red-400/60"
          >
            Delete…
          </button>
        ) : (
          <button
            onClick={nuke}
            disabled={busy}
            className="rounded-full bg-red-600 px-3 py-1.5 text-xs font-semibold text-white ring-1 ring-red-700/40 hover:bg-red-700 disabled:opacity-60"
          >
            {busy ? 'Deleting…' : 'Confirm delete'}
          </button>
        )}
      </div>
    </div>
  );
}
