// src/main.tsx — makerworks
import React, { StrictMode, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { HelmetProvider } from 'react-helmet-async';

import App from '@/App';
import ErrorBoundary from '@/components/system/ErrorBoundary';
import { ToastProvider } from '@/context/ToastProvider';
import { UserProvider } from '@/context/UserContext';

import '@/index.css';
import '@/styles/mw-led.css'; // ✅ Global LED buttons + card halo + thumbnail frame

// ------- Theme bootstrap (make DARK the default, no FOUC) -------
const THEME_KEY = 'mw_theme';

(function bootstrapTheme() {
  try {
    const html = document.documentElement;

    // If user has explicitly chosen, use it; otherwise default to dark.
    let theme = localStorage.getItem(THEME_KEY) as 'light' | 'dark' | null;
    if (theme !== 'light' && theme !== 'dark') {
      theme = 'dark'; // default
      localStorage.setItem(THEME_KEY, theme);
    }

    if (theme === 'dark') {
      html.classList.add('dark');
      (html.style as any).colorScheme = 'dark';
    } else {
      html.classList.remove('dark');
      (html.style as any).colorScheme = 'light';
    }

    // Keep tabs/windows in sync if the toggle updates elsewhere.
    window.addEventListener('storage', (e) => {
      if (e.key === THEME_KEY && e.newValue) {
        const next = e.newValue === 'dark' ? 'dark' : 'light';
        if (next === 'dark') {
          html.classList.add('dark');
          (html.style as any).colorScheme = 'dark';
        } else {
          html.classList.remove('dark');
          (html.style as any).colorScheme = 'light';
        }
      }
    });
  } catch {
    // meh.
  }
})();
// ----------------------------------------------------------------

const rootElement = document.getElementById('root');

if (!rootElement) {
  console.error('[MakerWorks] ❌ No #root element found in DOM.');

  const fallback = document.createElement('div');
  fallback.style.color = 'red';
  fallback.style.fontFamily = 'monospace';
  fallback.style.padding = '2rem';
  fallback.style.backgroundColor = '#fff0f0';
  fallback.innerText =
    '⚠️ MakerWorks frontend failed to load: #root not found.\nCheck browser console for details.';
  document.body.appendChild(fallback);

  throw new Error('No #root element found in DOM');
}

console.debug('[MakerWorks] ✅ Found root element:', rootElement);

createRoot(rootElement).render(
  <StrictMode>
    <HelmetProvider>
      <BrowserRouter>
        <UserProvider>
          <ToastProvider>
            <ErrorBoundary>
              <Suspense fallback={<div className="loading">🔄 Loading MakerWorks...</div>}>
                <App />
              </Suspense>
            </ErrorBoundary>
          </ToastProvider>
        </UserProvider>
      </BrowserRouter>
    </HelmetProvider>
  </StrictMode>
);

console.debug('[MakerWorks] ✅ App render initialized.');
