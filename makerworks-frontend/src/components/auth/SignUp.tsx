// src/components/auth/SignUp.tsx
import { useState, useEffect } from 'react';
import PageLayout from '@/components/layout/PageLayout';
import { useSignUp } from '@/hooks/useSignUp';
import GlassButton from '@/components/ui/GlassButton';

const SignUp = () => {
  const {
    email,
    setEmail,
    username,
    setUsername,
    password,
    setPassword,
    loading,
    error,
    handleSubmit
  } = useSignUp();

  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);

  // Validate matching passwords in real-time
  useEffect(() => {
    if (confirmPassword && password !== confirmPassword) {
      setPasswordError('Passwords do not match');
    } else {
      setPasswordError(null);
    }
  }, [password, confirmPassword]);

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const trimmedEmail = email.trim();
    const trimmedUsername = username.trim();
    const trimmedPassword = password.trim();
    const trimmedConfirm = confirmPassword.trim();

    if (!trimmedPassword) return; // Prevent submit if no password
    if (trimmedPassword !== trimmedConfirm) {
      setPasswordError('Passwords do not match');
      return;
    }

    setEmail(trimmedEmail);
    setUsername(trimmedUsername);
    setPassword(trimmedPassword);
    setConfirmPassword(trimmedConfirm);
    setPasswordError(null);

    handleSubmit(e);
  };

  const showConfirm = password.trim().length > 0;
  const passwordsMatch = password && confirmPassword && password === confirmPassword;

  return (
    <PageLayout title="Sign Up">
      <form
        className="glass-card p-8 flex flex-col gap-4 max-w-sm mx-auto"
        onSubmit={onSubmit}
        noValidate
      >
        <h1 className="text-2xl font-semibold text-center">
          Create Your Account
        </h1>

        {error && (
          <p
            className="text-red-500 text-sm text-center bg-red-100 border border-red-300 p-2 rounded-full"
            role="alert"
          >
            {error}
          </p>
        )}
        {passwordError && (
          <p
            className="text-red-500 text-sm text-center bg-red-100 border border-red-300 p-2 rounded-full"
            role="alert"
          >
            {passwordError}
          </p>
        )}

        <div className="flex flex-col gap-1">
          <label htmlFor="email" className="text-sm font-medium">
            Email
          </label>
          <input
            id="email"
            type="email"
            autoComplete="email"
            className="input rounded-full px-4 py-2"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value.trimStart())}
            disabled={loading}
            required
          />
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="username" className="text-sm font-medium">
            Username
          </label>
          <input
            id="username"
            className="input rounded-full px-4 py-2"
            placeholder="yourusername"
            value={username}
            onChange={(e) => setUsername(e.target.value.trimStart())}
            disabled={loading}
            required
          />
        </div>

        <div className="flex flex-col gap-1 relative">
          <label htmlFor="password" className="text-sm font-medium">
            Password
          </label>
          <input
            id="password"
            type={showPassword ? 'text' : 'password'}
            autoComplete="new-password"
            className={`input rounded-full px-4 py-2 pr-12 ${
              confirmPassword
                ? passwordsMatch
                  ? 'border-brand-blue focus:ring-brand-blue'
                  : 'border-brand-red focus:ring-brand-red'
                : ''
            }`}
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={loading}
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

        {/* Confirm Password shows only when password is entered */}
        {showConfirm && (
          <div className="flex flex-col gap-1 transition-all duration-300">
            <label htmlFor="confirmPassword" className="text-sm font-medium">
              Confirm Password
            </label>
            <input
              id="confirmPassword"
              type={showPassword ? 'text' : 'password'}
              autoComplete="new-password"
              className={`input rounded-full px-4 py-2 ${
                confirmPassword
                  ? passwordsMatch
                    ? 'border-brand-blue focus:ring-brand-blue'
                    : 'border-brand-red focus:ring-brand-red'
                  : ''
              }`}
              placeholder="Confirm your password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              disabled={loading}
              required
            />
          </div>
        )}

        <GlassButton
          type="submit"
          disabled={
            loading ||
            !email.trim() ||
            !username.trim() ||
            !password.trim() ||
            !confirmPassword.trim() ||
            password !== confirmPassword
          }
          variant="brand"
          className="mt-4 px-6 text-brand-white transition-colors duration-200 disabled:opacity-50"
        >
          {loading ? 'Signing up…' : 'Sign Up'}
        </GlassButton>
      </form>
    </PageLayout>
  );
};

export default SignUp;
