// src/pages/Settings.tsx — makerworks
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
      {/* subtle accent rings */}
      <div className="pointer-events-none absolute inset-0 -z-10">
        <Halo className="absolute -top-24 -right-20 h-48 w-48" strength="md" />
        <Halo className="absolute -bottom-24 -left-24 h-48 w-48" strength="sm" />
      </div>

      {/* unified grey-glass card shell */}
      <div
        className={[
          'relative w-full max-w-md overflow-hidden rounded-2xl mw-led',
          'bg-white/60 dark:bg-white/10 backdrop-blur-xl',
          'border border-amber-300/45 ring-1 ring-amber-300/40',
          'shadow-[inset_0_1px_0_rgba(255,255,255,0.65)]',
          'before:content-[""] before:absolute before:inset-0 before:rounded-2xl before:pointer-events-none',
          'before:shadow-[0_0_0_1px_rgba(251,146,60,0.12),0_0_12px_rgba(251,146,60,0.10),0_0_20px_rgba(251,146,60,0.08)]',
        ].join(' ')}
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

        {/* body */}
        <div className="relative z-10 space-y-6 p-5 pt-4">
          <Section title="Profile">
            {/* ⬇️ make the inner Profile block a halo-able card and scope Save button styling */}
            <div className="mw-profile-scope mw-led rounded-2xl border border-amber-300/35 bg-white/40 p-4 backdrop-blur-xl dark:border-amber-300/20 dark:bg-white/5 ring-1 ring-amber-300/30">
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
            className="relative w-full max-w-sm overflow-hidden rounded-2xl bg-white/90 p-4 shadow-2xl ring-1 ring-white/40 backdrop-blur-2xl dark:bg-[var(--mw-navy)]/70 dark:ring-white/10"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="absolute right-2 top-2">
              {/* ✅ green LED button (glows on hover; card halo is scoped to the modal) */}
              <button
                onClick={() => setShowAvatarEditor(false)}
                className="mw-enter mw-btn-sm rounded-full font-medium text-gray-800 dark:text-gray-200"
              >
                Close
              </button>
            </div>
            <AvatarSection currentAvatar={avatarSrc} onAvatarUpdate={handleAvatarUpdate} />
          </div>
        </div>
      )}

      {/* local LED styles */}
      <style>{`
        .mw-led { transition: box-shadow .18s ease, border-color .18s ease; }
        .mw-led:has(.mw-enter:hover){
          border-color: rgba(22,163,74,0.55) !important;
          box-shadow:
            inset 0 1px 0 rgba(255,255,255,0.65),
            0 0 0 1px rgba(22,163,74,0.14),
            0 0 12px rgba(22,163,74,0.12),
            0 0 24px rgba(22,163,74,0.10);
        }
        .dark .mw-led:has(.mw-enter:hover){
          border-color: rgba(22,163,74,0.70) !important;
          box-shadow:
            inset 0 1px 0 rgba(255,255,255,0.65),
            0 0 0 1px rgba(22,163,74,0.22),
            0 0 24px rgba(22,163,74,0.24),
            0 0 60px rgba(22,163,74,0.22);
        }

        /* Green button token + sizing (shared) */
        .mw-enter {
          --mw-ring:#16a34a;
          background:transparent!important;
          border:1px solid var(--mw-ring)!important;
          box-shadow:
            inset 0 0 8px 1.5px rgba(22,163,74,.36),
            0 0 10px 2.5px rgba(22,163,74,.34);
          transition: box-shadow .18s ease, transform .12s ease, border-color .18s ease;
          padding: .56rem 1.2rem;
        }
        .mw-btn-sm { padding:.38rem .9rem; font-size:.9rem; }
        .mw-enter:hover{
          transform: translateY(-.5px);
          box-shadow:
            inset 0 0 12px 2.5px rgba(22,163,74,.58),
            0 0 16px 5px rgba(22,163,74,.60),
            0 0 32px 12px rgba(22,163,74,.24);
        }
        .mw-enter:focus-visible{
          outline:none!important;
          box-shadow:
            inset 0 0 13px 2.5px rgba(22,163,74,.58),
            0 0 0 2px rgba(255,255,255,.6),
            0 0 0 4px var(--mw-ring),
            0 0 20px 5px rgba(22,163,74,.48);
        }

        /* ——— Save Profile button + card glow, without touching ProfileSection ———
           We assume ProfileSection uses a <button type="submit"> or a .save-profile-btn.
           We style both. */
        .mw-profile-scope button[type="submit"],
        .mw-profile-scope .save-profile-btn{
          background: transparent !important;
          border: 1px solid #16a34a !important;
          border-radius: 9999px; /* rounded-full */
          padding: .38rem .9rem;
          font-size: .9rem;
          font-weight: 500;
          color: inherit;
          box-shadow:
            inset 0 0 8px 1.5px rgba(22,163,74,.36),
            0 0 10px 2.5px rgba(22,163,74,.34);
          transition: box-shadow .18s ease, transform .12s ease, border-color .18s ease;
        }
        .mw-profile-scope button[type="submit"]:hover,
        .mw-profile-scope .save-profile-btn:hover{
          transform: translateY(-.5px);
          box-shadow:
            inset 0 0 12px 2.5px rgba(22,163,74,.58),
            0 0 16px 5px rgba(22,163,74,.60),
            0 0 32px 12px rgba(22,163,74,.24);
        }
        .mw-profile-scope button[type="submit"]:focus-visible,
        .mw-profile-scope .save-profile-btn:focus-visible{
          outline:none !important;
          box-shadow:
            inset 0 0 13px 2.5px rgba(22,163,74,.58),
            0 0 0 2px rgba(255,255,255,.6),
            0 0 0 4px #16a34a,
            0 0 20px 5px rgba(22,163,74,.48);
        }

        /* Green under-glow on the Profile card when hovering Save */
        .mw-profile-scope:has(button[type="submit"]:hover),
        .mw-profile-scope:has(.save-profile-btn:hover){
          border-color: rgba(22,163,74,0.55) !important;
          box-shadow:
            inset 0 1px 0 rgba(255,255,255,0.65),
            0 0 0 1px rgba(22,163,74,0.14),
            0 0 12px rgba(22,163,74,0.12),
            0 0 24px rgba(22,163,74,0.10);
        }
        .dark .mw-profile-scope:has(button[type="submit"]:hover),
        .dark .mw-profile-scope:has(.save-profile-btn:hover){
          border-color: rgba(22,163,74,0.70) !important;
          box-shadow:
            inset 0 1px 0 rgba(255,255,255,0.65),
            0 0 0 1px rgba(22,163,74,0.22),
            0 0 24px rgba(22,163,74,0.24),
            0 0 60px rgba(22,163,74,0.22);
        }
      `}</style>
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
    <div className="mw-danger-scope relative overflow-visible flex items-center justify-between rounded-2xl border border-red-300/40 bg-white/50 p-4 backdrop-blur-xl dark:border-red-400/30 dark:bg-white/5">
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
            className="mw-danger mw-btn-sm rounded-full font-medium text-gray-800 dark:text-gray-200"
          >
            Delete…
          </button>
        ) : (
          <button
            onClick={nuke}
            disabled={busy}
            className="mw-danger mw-btn-sm rounded-full font-medium text-gray-800 dark:text-gray-200 disabled:opacity-60"
          >
            {busy ? 'Deleting…' : 'Confirm delete'}
          </button>
        )}
      </div>

      {/* Scoped red ring/glow + red halo on hover (same as Sign out) */}
      <style>{`
        .mw-danger-scope .mw-danger{
          border: 1px solid rgba(239,68,68,0.70);
          box-shadow: none; /* no glow at rest */
          transition: box-shadow .18s ease, transform .12s ease, border-color .18s ease;
        }
        .mw-danger-scope .mw-danger:hover{
          transform: translateY(-0.5px);
          border-color: rgba(239,68,68,0.90);
          box-shadow:
            inset 0 0 12px 3px rgba(239,68,68,0.70),
            0 0 18px 8px rgba(239,68,68,0.70),
            0 0 44px 18px rgba(239,68,68,0.28);
        }
        .mw-danger-scope .mw-danger:focus-visible{
          outline: none;
          box-shadow:
            0 0 0 2px rgba(239,68,68,0.45),
            inset 0 0 0 1px rgba(239,68,68,0.55);
        }

        /* red under-glow on the danger card while hovering the red button */
        .mw-danger-scope:has(.mw-danger:hover){
          border-color: rgba(239,68,68,0.65) !important;
          box-shadow: inset 0 1px 0 rgba(255,255,255,0.65);
        }
        .mw-danger-scope:has(.mw-danger:hover)::before{
          content: "";
          position: absolute;
          inset: 0;
          border-radius: 16px;
          pointer-events: none;
          box-shadow:
            0 0 0 1px rgba(239,68,68,0.26),
            0 2px 20px rgba(239,68,68,0.22),
            0 8px 42px rgba(239,68,68,0.20),
            0 12px 68px rgba(239,68,68,0.16);
        }
        .dark .mw-danger-scope:has(.mw-danger:hover)::before{
          box-shadow:
            0 0 0 1px rgba(239,68,68,0.34),
            0 0 24px rgba(239,68,68,0.28),
            0 0 56px rgba(239,68,68,0.24),
            0 0 96px rgba(239,68,68,0.18);
        }
      `}</style>
    </div>
  );
}
