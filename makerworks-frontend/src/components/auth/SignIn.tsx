// src/components/auth/SignIn.tsx
import { useEffect, useState } from 'react';
import { useNavigate, Link, useLocation } from 'react-router-dom';
import PageLayout from '@/components/layout/PageLayout';
import { useSignIn } from '@/hooks/useSignIn';
import { useAuthStore } from '@/store/useAuthStore';
import GlassButton from '@/components/ui/GlassButton';

const SignIn: React.FC = () => {
  const [emailOrUsername, setEmailOrUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const navigate = useNavigate();
  const location = useLocation();
  const { signIn, loading, error } = useSignIn();
  const { resolved, isAuthenticated } = useAuthStore();

  // ✅ Only redirect after hydration + successful auth, and avoid looping
  useEffect(() => {
    if (resolved && isAuthenticated() && location.pathname !== '/dashboard') {
      navigate('/dashboard', { replace: true });
    }
  }, [resolved, isAuthenticated, navigate, location.pathname]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await signIn(emailOrUsername, password);
  };

  return (
    <PageLayout title="Sign In">
      <form
        onSubmit={onSubmit}
        /* Exact shared card shell: grey glass, amber ring, subtle top gloss,
           and green halo when the primary button is hovered. */
        className={[
          'relative overflow-visible rounded-2xl mw-led mw-card',
          'bg-white/60 dark:bg-white/10 backdrop-blur-xl',
          'border border-amber-300/45 ring-1 ring-amber-300/40 hover:ring-amber-400/55',
          'shadow-[inset_0_1px_0_rgba(255,255,255,0.65)]',
          'before:content-[""] before:absolute before:inset-0 before:rounded-2xl before:pointer-events-none',
          'before:opacity-0 hover:before:opacity-100 before:transition-opacity',
          'before:shadow-[0_0_0_1px_rgba(251,146,60,0.12),0_0_12px_rgba(251,146,60,0.10),0_0_20px_rgba(251,146,60,0.08)]',
          'p-8 flex flex-col gap-4 max-w-sm mx-auto',
        ].join(' ')}
        noValidate
      >
        {/* removed inner <h1> to prevent double title; PageLayout already renders it */}

        {error && (
          <p
            className="text-red-500 text-sm text-center bg-red-100 border border-red-300 p-2 rounded-full"
            role="alert"
          >
            {error}
          </p>
        )}

        <div className="flex flex-col gap-1">
          <label htmlFor="emailOrUsername" className="text-sm font-medium">
            Email or Username
          </label>
          <input
            id="emailOrUsername"
            className="input rounded-full px-4 py-2"
            placeholder="you@example.com or yourusername"
            value={emailOrUsername}
            onChange={(e) => setEmailOrUsername(e.target.value)}
            autoComplete="username"
            required
          />
        </div>

        <div className="flex flex-col gap-1 relative">
          <label htmlFor="password" className="text-sm font-medium">
            Password
          </label>
          <input
            id="password"
            className="input rounded-full px-4 py-2 pr-12"
            type={showPassword ? 'text' : 'password'}
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            required
          />
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            className="absolute right-3 top-7 text-xs text-brand-orange hover:text-brand-green"
          >
            {showPassword ? 'Hide' : 'Show'}
          </button>
        </div>

        {/* LED ring/glow button, same design as everywhere (no solid hover, text color unchanged) */}
        <GlassButton
          className="mt-4 mw-enter mw-enter--slim rounded-full font-medium shadow-lg text-gray-800 dark:text-gray-200 transition-all duration-200 disabled:opacity-60"
          type="submit"
          disabled={loading}
          variant="brand"
          aria-busy={loading}
        >
          {loading ? 'Signing in…' : 'Sign In'}
        </GlassButton>

        <p className="text-center text-sm mt-2">
          Not a member?{' '}
          <Link to="/auth/signup" className="text-brand-orange hover:text-brand-green font-medium underline">
            Sign up
          </Link>
        </p>
      </form>

      {/* Local styles for the LED ring + card halo on hover */}
      <style>
        {`
          /* --- LED green token --- */
          .mw-enter { --mw-ring: #16a34a; } /* Tailwind green-600 */

          /* --- Slim, modern pill sizing --- */
          .mw-enter--slim {
            padding: 0.56rem 1.95rem !important;
            font-size: 0.95rem !important;
            line-height: 1.2 !important;
            letter-spacing: 0.01em;
          }

          /* --- Base LED ring look (transparent base; inner+outer glow) --- */
          .mw-enter {
            background: transparent !important;            /* never solid */
            border: 1px solid var(--mw-ring) !important;
            box-shadow:
              inset 0 0 8px 1.5px rgba(22,163,74,0.36),
              0 0 10px 2.5px rgba(22,163,74,0.34);
          }

          /* Hover: stronger glow only (no bg fill; NO text-color change) */
          .mw-enter:hover {
            background: transparent !important;
            box-shadow:
              inset 0 0 12px 2.5px rgba(22,163,74,0.58),
              0 0 16px 5px rgba(22,163,74,0.60),
              0 0 32px 12px rgba(22,163,74,0.24);
          }

          .mw-enter:focus-visible {
            outline: none !important;
            box-shadow:
              inset 0 0 13px 2.5px rgba(22,163,74,0.58),
              0 0 0 2px rgba(255,255,255,0.6),
              0 0 0 4px var(--mw-ring),
              0 0 20px 5px rgba(22,163,74,0.48);
          }

          /* Glow the whole card subtly when the sign-in button is hovered */
          .mw-card { transition: box-shadow 180ms ease, border-color 180ms ease; }
          .mw-card:has(.mw-enter:hover) {
            box-shadow:
              0 0 0 1px rgba(22,163,74,0.35),
              0 0 22px 8px rgba(22,163,74,0.30),
              0 0 50px 20px rgba(22,163,74,0.18);
          }

          /* Give the form card a touch of depth in dark mode so it doesn't disappear */
          .dark .mw-card {
            box-shadow:
              0 0 0 1px rgba(255,255,255,0.10),
              inset 0 1px 0 rgba(255,255,255,0.08),
              inset 0 -1px 0 rgba(0,0,0,0.55),
              0 12px 36px rgba(0,0,0,0.55);
            background-clip: padding-box;
          }
          .dark .mw-card::before {
            content: "";
            position: absolute;
            inset: 0;
            border-radius: inherit;
            pointer-events: none;
            box-shadow: 0 0 0 1px rgba(22,163,74,0.12) inset;
          }
        `}
      </style>
    </PageLayout>
  );
};

export default SignIn;
