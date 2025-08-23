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
      {/* Toggle (JUST a circular avatar / placeholder). If admin: king's crown overlay. */}
      <button
        ref={btnRef}
        type="button"
        onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); setOpen((v) => !v); }}
        className={clsx(
          'relative inline-flex items-center justify-center rounded-full w-9 h-9',
          'border border-white/20 dark:border-white/20',
          'bg-white/20 dark:bg-black/20 backdrop-blur-sm',
          'hover:shadow-[0_0_12px_rgba(255,122,26,.22),0_0_36px_rgba(255,122,26,.08)]',
          'transition'
        )}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={isAdmin ? 'Account menu, admin' : 'Account menu'}
        data-admin={isAdmin ? 'true' : 'false'}
        title={isAdmin ? 'Admin' : undefined}
      >
        {/* Avatar image */}
        <img
          src={avatarUrl}
          alt="avatar"
          className="w-9 h-9 rounded-full object-cover"
          onError={(e) => { (e.currentTarget as HTMLImageElement).src = '/static/default-avatar.png'; }}
          draggable={false}
        />

        {/* Crown overlay (ADMIN ONLY) */}
        {isAdmin && (
          <span className="mw-admin-crown" aria-hidden="true">
            {/* King’s crown: gold band, five points, jeweled */}
            <svg className="mw-crown-svg" viewBox="0 0 120 80" xmlns="http://www.w3.org/2000/svg">
              <defs>
                {/* Gold gradients */}
                <linearGradient id="mw-gold" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0%" stopColor="#fff3b0"/>
                  <stop offset="35%" stopColor="#f9d24a"/>
                  <stop offset="70%" stopColor="#f2b705"/>
                  <stop offset="100%" stopColor="#c58f00"/>
                </linearGradient>
                <linearGradient id="mw-goldEdge" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#d6a300"/>
                  <stop offset="100%" stopColor="#8a5d00"/>
                </linearGradient>

                {/* Jewel fills */}
                <radialGradient id="mw-ruby" cx="50%" cy="40%" r="60%">
                  <stop offset="0%" stopColor="#ffb3b3"/>
                  <stop offset="45%" stopColor="#ff3b3b"/>
                  <stop offset="100%" stopColor="#a10018"/>
                </radialGradient>
                <radialGradient id="mw-sapphire" cx="50%" cy="40%" r="60%">
                  <stop offset="0%" stopColor="#b3d1ff"/>
                  <stop offset="45%" stopColor="#2f7bff"/>
                  <stop offset="100%" stopColor="#0a2a6a"/>
                </radialGradient>
                <radialGradient id="mw-emerald" cx="50%" cy="40%" r="60%">
                  <stop offset="0%" stopColor="#b9ffd1"/>
                  <stop offset="45%" stopColor="#27c26e"/>
                  <stop offset="100%" stopColor="#0c4e2a"/>
                </radialGradient>

                {/* Shine bar */}
                <linearGradient id="mw-shine" x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0%" stopColor="rgba(255,255,255,0)" />
                  <stop offset="45%" stopColor="rgba(255,255,255,0.58)" />
                  <stop offset="55%" stopColor="rgba(255,255,255,0.58)" />
                  <stop offset="100%" stopColor="rgba(255,255,255,0)" />
                </linearGradient>
              </defs>

              {/* Band */}
              <rect x="8" y="56" width="104" height="14" rx="4" fill="url(#mw-gold)" stroke="url(#mw-goldEdge)" strokeWidth="2"/>

              {/* Five-point crown silhouette */}
              <path
                d="M10 58
                   L24 30 L40 52
                   L60 22 L80 52
                   L96 26 L110 58"
                fill="none"
                stroke="url(#mw-goldEdge)"
                strokeWidth="10"
                strokeLinejoin="round"
                strokeLinecap="round"
              />
              {/* Fill behind the thick stroke to look solid gold */}
              <path
                d="M10 58
                   L24 30 L40 52
                   L60 22 L80 52
                   L96 26 L110 58 Z"
                fill="url(#mw-gold)"
                opacity="0.95"
              />

              {/* Jewel caps at the tips */}
              <circle cx="24" cy="30" r="5.6" fill="url(#mw-sapphire)" stroke="#123c7a" strokeWidth="1.6"/>
              <circle cx="60" cy="22" r="6.2" fill="url(#mw-ruby)" stroke="#6a0012" strokeWidth="1.6"/>
              <circle cx="96" cy="26" r="5.6" fill="url(#mw-emerald)" stroke="#0c4e2a" strokeWidth="1.6"/>

              {/* Inset gemstones on band */}
              <rect x="26" y="60" width="10" height="8" rx="2" fill="url(#mw-ruby)" stroke="#6a0012" strokeWidth="1"/>
              <rect x="55" y="60" width="10" height="8" rx="2" fill="url(#mw-emerald)" stroke="#0c4e2a" strokeWidth="1"/>
              <rect x="84" y="60" width="10" height="8" rx="2" fill="url(#mw-sapphire)" stroke="#123c7a" strokeWidth="1"/>

              {/* Pearl beading along band */}
              {Array.from({ length: 9 }).map((_, i) => {
                const x = 16 + i * 11.5;
                return (
                  <circle key={i} cx={x} cy={66} r="1.6" fill="#fff8e1" stroke="#c9a800" strokeWidth="0.8"/>
                );
              })}

              {/* Moving shine sweep */}
              <g className="mw-crown-shine">
                <rect x="-40" y="18" width="80" height="56" fill="url(#mw-shine)" transform="skewX(-18)"/>
              </g>
            </svg>
          </span>
        )}
      </button>

      {/* Crown + effects (exists even when menu is closed) */}
      <style>{`
        .mw-admin-crown{
          position: absolute;
          top: -14px;
          left: 50%;
          transform: translateX(-50%);
          pointer-events: none;
          filter:
            drop-shadow(0 1px 0 rgba(255,255,255,.35))
            drop-shadow(0 6px 10px rgba(0,0,0,.35));
        }
        .mw-crown-svg{ width: 46px; height: auto; display: block; }

        @media (prefers-reduced-motion: no-preference){
          .mw-admin-crown{
            animation: mw-crown-bob 2.6s ease-in-out infinite;
          }
          button:hover > .mw-admin-crown{
            animation-duration: 1.6s;
          }
          /* Shine pass glides across the crown */
          .mw-crown-shine{
            opacity: .22;
            transform: translateX(-130%);
            animation: mw-crown-shine 4.2s ease-in-out infinite;
          }
          button:hover > .mw-admin-crown .mw-crown-shine{
            opacity: .35;
            animation-duration: 2s;
          }
        }
        @keyframes mw-crown-bob{
          0%,100% { transform: translateX(-50%) translateY(0); }
          50%     { transform: translateX(-50%) translateY(-2px); }
        }
        @keyframes mw-crown-shine{
          0%   { transform: translateX(-130%); }
          100% { transform: translateX(130%); }
        }

        /* Keep clicks clean on the avatar button */
        .mw-admin-crown, .mw-crown-svg, .mw-crown-shine { pointer-events: none; }

      `}</style>

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
