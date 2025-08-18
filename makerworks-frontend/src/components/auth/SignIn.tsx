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
  const { user, resolved, isAuthenticated } = useAuthStore();

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
        className="glass-card p-8 flex flex-col gap-4 max-w-sm mx-auto"
        noValidate
      >
        <h1 className="text-2xl font-semibold text-center">Sign In</h1>

        {error && (
          <p className="text-red-500 text-sm text-center bg-red-100 border border-red-300 p-2 rounded-full" role="alert">
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
            className="absolute right-3 top-7 text-xs text-brand-blue hover:text-brand-red"
          >
            {showPassword ? 'Hide' : 'Show'}
          </button>
        </div>

        <GlassButton
          className="mt-4 px-6 text-brand-white transition-colors duration-200 disabled:opacity-50"
          type="submit"
          disabled={loading}
          variant="brand"
        >
          {loading ? 'Signing in…' : 'Sign In'}
        </GlassButton>

        <p className="text-center text-sm mt-2">
          Not a member?{' '}
          <Link to="/auth/signup" className="text-brand-blue hover:text-brand-red font-medium underline">
            Sign up
          </Link>
        </p>
      </form>
    </PageLayout>
  );
};

export default SignIn;
