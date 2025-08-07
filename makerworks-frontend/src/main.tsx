import React, { StrictMode, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { HelmetProvider } from 'react-helmet-async';

import App from '@/App';
import ErrorBoundary from '@/components/system/ErrorBoundary';
import { ToastProvider } from '@/context/ToastProvider';
import { UserProvider } from '@/context/UserContext';

import '@/index.css';

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
