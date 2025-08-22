// src/components/ui/UserDropdown.tsx — makerworks
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { createPortal } from 'react-dom';
import { useAuthStore } from '@/store/useAuthStore';
import api from '@/api/client';
import clsx from 'clsx';

/** Normalize anything role-like to a lowercase array of strings. */
function normalizeRoleTokens(user: any): string[] {
  const tokens: string[] = [];
  const pushToken = (v: unknown) => {
    if (!v) return;
    if (typeof v === 'string') v.split(/[,\s]+/).forEach((t) => t && tokens.push(t.toLowerCase()));
    else if (Array.isArray(v)) v.forEach((x) => pushToken(x));
    else if (typeof v === 'object') {
      const nameLike = (v as any).name ?? (v as any).role ?? (v as any).title;
      if (nameLike) pushToken(nameLike);
    }
  };
  pushToken(user?.role);
  pushToken(user?.roles);
  pushToken(user?.permissions);
  pushToken(user?.claims);
  pushToken(user?.scopes);
  pushToken(user?.groups);
  if (typeof user?.role_string === 'string') pushToken(user.role_string);
  return tokens;
}

/** Simple local admin guess (fast path + cheap flags). */
function localIsAdmin(user: any): boolean {
  if (!user) return false;
  const tokens = new Set(normalizeRoleTokens(user));
  const adminSynonyms = [
    'admin', 'administrator', 'superuser', 'owner', 'root', 'staff', 'site_admin', 'system_admin',
  ];
  const tokenHit = adminSynonyms.some((k) => tokens.has(k));
  const flagHit =
    user.is_admin === true ||
    user.isAdmin === true ||
    user.admin === true ||
    user.is_staff === true ||
    user.isSuperuser === true ||
    user.superuser === true;
  return tokenHit || flagHit;
}

/** Robust admin status (local hints + server probe /api/v1/admin/me). */
function useAdminStatus(user: any) {
  const localGuess = useMemo(() => localIsAdmin(user), [user]);
  const [serverAdmin, setServerAdmin] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!user || localGuess) {
      setServerAdmin(null);
      return;
    }
    (async () => {
      try {
        const res = await api.get('/api/v1/admin/me');
        if (!cancelled) setServerAdmin(res?.status === 200);
      } catch {
        if (!cancelled) setServerAdmin(false);
      }
    })();
    return () => { cancelled = true; };
  }, [user, localGuess]);

  return localGuess || serverAdmin === true;
}

export default function UserDropdown() {
  const { user, setUser } = useAuthStore();
  const isAdmin = useAdminStatus(user);
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const navigate = useNavigate();

  // Fixed-position portal coordinates (so the menu DROPS DOWN without pushing layout)
  const [coords, setCoords] = useState<{ top: number; right: number } | null>(null);
  const recalc = () => {
    const el = btnRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setCoords({
      top: Math.round(r.bottom + 8),
      right: Math.round(window.innerWidth - r.right),
    });
  };

  useEffect(() => {
    if (!open) return;
    recalc();
    const onScroll = () => recalc();
    const onResize = () => recalc();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onResize);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onResize);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const handleSignOut = async () => {
    try { await api.post('/api/v1/auth/signout'); } catch { /* meh */ }
    finally { setUser(null); navigate('/signin'); }
  };

  const avatarUrl = user?.avatar_url || user?.avatar || '/static/default-avatar.png';

  return (
    <>
      {/* Toggle (PILL with avatar + username, like before) */}
      <button
        ref={btnRef}
        type="button"
        onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); setOpen((v) => !v); }}
        className={clsx(
          'inline-flex items-center gap-2 rounded-full px-2.5 py-1.5',
          'border border-white/20 dark:border-white/20',
          'bg-white/20 dark:bg-black/20 backdrop-blur-sm',
          'text-brand-text dark:text-white',
          'hover:shadow-[0_0_12px_rgba(255,122,26,.22),0_0_36px_rgba(255,122,26,.08)]',
          'transition'
        )}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Account menu"
      >
        <img
          src={avatarUrl}
          alt="avatar"
          className="w-7 h-7 rounded-full object-cover"
          onError={(e) => { (e.currentTarget as HTMLImageElement).src = '/static/default-avatar.png'; }}
          draggable={false}
        />
        <span className="text-sm font-semibold">{user?.username ?? 'Account'}</span>
        <svg width="16" height="16" viewBox="0 0 24 24" className="opacity-70" aria-hidden>
          <path d="M7 10l5 5 5-5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </button>

      {/* DROPDOWN via portal (overlay; no layout shove). */}
      {open && createPortal(
        <div
          onMouseDown={(e) => {
            const target = e.target as HTMLElement;
            if (btnRef.current && btnRef.current.contains(target)) return; // ignore clicks on opener
            if (!target.closest('[data-mw-dropdown]')) setOpen(false);
          }}
          className="fixed inset-0 z-[999]"
        >
          <div
            data-mw-dropdown
            role="menu"
            className={clsx(
              'fixed w-56 z-[1000]',
              // Grey glass with subtle amber vibes (card keeps orange look)
              'rounded-xl border border-amber-300/35 ring-1 ring-amber-300/30',
              'bg-white/70 dark:bg-zinc-900/80 backdrop-blur-md shadow-xl',
              'p-1.5'
            )}
            style={{ top: coords?.top ?? 64, right: coords?.right ?? 16 }}
          >
            <div className="px-2 py-2">
              <div className="text-[12px] uppercase tracking-wider text-zinc-600 dark:text-zinc-400">Account</div>
            </div>

            {/* Profile & Admin stay green LED */}
            <div className="px-2 pb-2 space-y-2">
              <button
                role="menuitem"
                onClick={() => { setOpen(false); navigate('/profile'); }}
                className="mw-enter mw-btn-sm w-full justify-center rounded-full font-medium text-gray-800 dark:text-gray-200"
                title={user?.email ?? undefined}
              >
                Profile
              </button>

              {isAdmin && (
                <button
                  role="menuitem"
                  onClick={() => { setOpen(false); navigate('/admin'); }}
                  className="mw-enter mw-btn-sm w-full justify-center rounded-full font-medium text-gray-800 dark:text-gray-200"
                  data-testid="admin-link"
                >
                  Admin
                </button>
              )}
            </div>

            <div className="h-px my-1 bg-white/35 dark:bg-white/10" />

            {/* 🔴 Sign out = red ring, NO glow until hover */}
            <div className="px-2 pb-2">
              <button
                role="menuitem"
                onClick={handleSignOut}
                className="mw-danger mw-btn-sm w-full justify-center rounded-full font-medium text-gray-800 dark:text-gray-200"
              >
                Sign out
              </button>
            </div>
          </div>

          {/* Local red-LED spec (no glow at rest; glow only on hover) */}
          <style>{`
            .mw-danger{
              border: 1px solid rgba(239,68,68,0.65);
              box-shadow: none; /* no glow until hover */
              transition: box-shadow .18s ease, transform .12s ease, border-color .18s ease;
            }
            .mw-danger:hover{
              transform: translateY(-0.5px);
              border-color: rgba(239,68,68,0.80);
              box-shadow:
                inset 0 0 12px 3px rgba(239,68,68,0.70),
                0 0 18px 8px rgba(239,68,68,0.70),
                0 0 44px 18px rgba(239,68,68,0.28);
            }
            .mw-danger:focus-visible{
              outline: none;
              box-shadow:
                0 0 0 2px rgba(239,68,68,0.45),
                inset 0 0 0 1px rgba(239,68,68,0.55);
            }
          `}</style>
        </div>,
        document.body
      )}
    </>
  );
}
