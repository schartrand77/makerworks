// src/routes/RoutesRenderer.tsx
import { Suspense, lazy } from 'react';
import { Routes, Route } from 'react-router-dom';
import RequireAuth from '@/components/auth/RequireAuth';
import RoutePaths from '@/routes/routePaths';

const Landing = lazy(() => import('@/pages/Landing'));
const Admin = lazy(() => import('@/pages/Admin'));
const Dashboard = lazy(() => import('@/pages/Dashboard'));
const Browse = lazy(() => import('@/pages/Browse'));
const Estimate = lazy(() => import('@/pages/Estimate'));
const Upload = lazy(() => import('@/pages/Upload'));
const Cart = lazy(() => import('@/pages/Cart'));
const Checkout = lazy(() => import('@/pages/Checkout'));
const Settings = lazy(() => import('@/pages/Settings'));
const ModelPage = lazy(() => import('@/pages/ModelPage'));
const SignIn = lazy(() => import('@/components/auth/SignIn'));
const SignUp = lazy(() => import('@/components/auth/SignUp'));
const PageNotFound = lazy(() => import('@/pages/PageNotFound'));

export default function RoutesRenderer() {
  return (
    <Suspense fallback={<div className="text-center mt-8">Loading…</div>}>
      <Routes>
        {/* Public */}
        <Route path={RoutePaths.landing} element={<Landing />} />
        <Route path={RoutePaths.signin} element={<SignIn />} />
        <Route path={RoutePaths.signup} element={<SignUp />} />

        {/* Protected */}
        <Route element={<RequireAuth fallbackTo={RoutePaths.signin} />}>
          <Route path={RoutePaths.dashboard} element={<Dashboard />} />
          <Route path={RoutePaths.browse} element={<Browse />} />
          <Route path={RoutePaths.estimate} element={<Estimate />} />
          <Route path={RoutePaths.upload} element={<Upload />} />
          <Route path={RoutePaths.cart} element={<Cart />} />
          <Route path={RoutePaths.checkout} element={<Checkout />} />
          <Route path={RoutePaths.model} element={<ModelPage />} />
          <Route path={RoutePaths.settings} element={<Settings />} />
        </Route>

        {/* Admin-only */}
        <Route
          element={<RequireAuth requiredRoles={['admin']} fallbackTo={RoutePaths.signin} />}
        >
          <Route path={RoutePaths.admin} element={<Admin />} />
        </Route>

        <Route path="*" element={<PageNotFound />} />
      </Routes>
    </Suspense>
  );
}
