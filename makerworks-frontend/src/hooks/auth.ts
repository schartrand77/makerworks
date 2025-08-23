// src/hooks/auth/useSignIn.ts
import { useCallback, useState } from 'react';
import type { AxiosError } from 'axios';
import client from '@/lib/client';

// Shape we expect back from /auth/me
export type Me = {
  id: string;
  email: string;
  username: string | null;
  name?: string | null;
  is_verified?: boolean;
  is_active?: boolean;
  avatar_url?: string | null;
};

type LoginResponse = {
  access_token?: string;   // backend may use any of these keys
  token?: string;
  accessToken?: string;
};

function extractToken(data: LoginResponse | unknown): string | null {
  if (!data || typeof data !== 'object') return null;
  const d = data as LoginResponse;
  return d.access_token || d.token || d.accessToken || null;
}

function setGlobalAuthHeader(tok: string) {
  try {
    localStorage.setItem('mw.jwt', tok);
  } catch {}
  client.defaults.headers.common['Authorization'] = `Bearer ${tok}`;
}

export function useSignIn() {
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState<string | null>(null);

  const signIn = useCallback(
    async (email: string, password: string): Promise<Me> => {
      setLoading(true);
      setError(null);

      // We try /auth/signin first (if you add it later), then fall back to /auth/login
      const endpoints = ['/auth/signin', '/auth/login'];

      let lastErr: unknown = null;
      for (const ep of endpoints) {
        try {
          const loginRes = await client.post<LoginResponse>(
            ep,
            { email, password },
            {
              // 10s is plenty; a 30s hang usually means wrong URL
              timeout: 10_000,
              withCredentials: true,
            }
          );

          // If backend sends a JWT in the body, adopt it.
          const tok = extractToken(loginRes.data);
          if (tok) setGlobalAuthHeader(tok);

          // Either way (cookie or token), hydrate user from /auth/me
          const meRes = await client.get<Me>('/auth/me', {
            withCredentials: true,
            timeout: 10_000,
          });

          // helpful trace
          if (import.meta.env.DEV) {
            // eslint-disable-next-line no-console
            console.info('[useSignIn] Signed in as', meRes.data?.email);
          }

          setLoading(false);
          return meRes.data;
        } catch (e) {
          lastErr = e;
          const ax = e as AxiosError;
          // If it's clearly a wrong endpoint, try the next one.
          if (ax?.response?.status && [404, 405, 422].includes(ax.response.status)) {
            continue;
          }
          // If it’s a network/CORS/timeout error, no point retrying a different path immediately.
          break;
        }
      }

      // Surface a friendly error
      let message = 'Sign in failed';
      const ax = lastErr as AxiosError | undefined;
      if (ax?.code === 'ECONNABORTED') message = 'Login request timed out.';
      else if (ax?.response?.status)   message = `Login failed (${ax.response.status}).`;
      else if (ax?.message)            message = ax.message;

      setLoading(false);
      setError(message);
      throw new Error(message);
    },
    []
  );

  return { signIn, loading, error };
}

export default useSignIn;
