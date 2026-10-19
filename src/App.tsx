/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ProfileProvider } from './context/ProfileContext';
import { ThemeProvider } from './context/ThemeContext';
import { Home } from './pages/Home';
import { Signup } from './pages/Signup';
import { Login } from './pages/Login';
import { ForgotPassword } from './pages/ForgotPassword';
import { Dashboard } from './pages/Dashboard';
import { Material } from './pages/Material';
import { Settings } from './pages/Settings';
import { Privacy } from './pages/Privacy';
import { Terms } from './pages/Terms';
import { Help } from './pages/Help';
import { RefundPolicy } from './pages/RefundPolicy';
import { ContentDisclaimer } from './pages/ContentDisclaimer';
import { FairUse } from './pages/FairUse';
import { CookiePolicy } from './pages/CookiePolicy';
import { AdminOverview } from './pages/admin/AdminOverview';
import { AdminUsers } from './pages/admin/AdminUsers';
import { AdminMaterials } from './pages/admin/AdminMaterials';
import { AdminReader } from './pages/admin/AdminReader';
import { AdminFulfilment } from './pages/admin/AdminFulfilment';
import { AdminAccessDevices } from './pages/admin/AdminAccessDevices';
import { AdminLogs } from './pages/admin/AdminLogs';
import { AdminSettings } from './pages/admin/AdminSettings';
import { AdminPayments } from './pages/admin/AdminPayments';
import { AdminForbidden } from './pages/admin/AdminForbidden';
import { NotFound } from './pages/NotFound';
import { ShieldCheck, Loader2, AlertTriangle } from 'lucide-react';
import { Modal } from './components/ui/Modal';
import { Button } from './components/ui/Button';
import { useProfile } from './context/ProfileContext';

function AppContent() {
  const [currentPath, setCurrentPath] = useState<string>(() => {
    return window.location.pathname === '/' ? '/' : window.location.pathname;
  });

  const { user, loading: authLoading, deviceConflict, resolveDeviceConflict, cancelDeviceConflict } = useAuth();
  const { profile, loading: profileLoading } = useProfile();
  const [takingOver, setTakingOver] = useState(false);

  useEffect(() => {
    const handlePopState = () => {
      setCurrentPath(window.location.pathname);
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const handleNavigate = (path: string) => {
    window.history.pushState({}, '', path);
    setCurrentPath(path);
    window.scrollTo(0, 0);
  };

  // Protected routes check.
  // NOTE: the material route is deliberately NOT protected. It renders the
  // two-page preview and the ₦1,500 gate for guests, and swaps into the
  // protected reader only once an entitlement exists. The paywall is enforced
  // by the entitlement check, never by routing.
  const protectedRoutes = [
    '/dashboard',
    '/settings',
    '/admin',
    '/admin/users',
    '/admin/materials',
    '/admin/reader',
    '/admin/fulfilment',
    '/admin/payments',
    '/admin/access-devices',
    '/admin/logs',
    '/admin/settings'
  ];
  const isProtectedRoute = protectedRoutes.includes(currentPath);
  const isAdminRoute = currentPath.startsWith('/admin');

  useEffect(() => {
    if (!authLoading && isProtectedRoute && !user) {
      handleNavigate('/login');
    }
  }, [authLoading, isProtectedRoute, user]);

  if (authLoading) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-canvas">
        <div className="flex h-11 w-11 items-center justify-center rounded-md bg-gold">
          <ShieldCheck className="h-5 w-5 text-on-gold" />
        </div>
        <div className="flex items-center gap-2 text-sm text-ink-muted">
          <Loader2 className="h-4 w-4 animate-spin text-gold" />
          <span>Loading EduVault…</span>
        </div>
      </div>
    );
  }

  // Admin Route Security Guard
  if (isAdminRoute) {
    if (profileLoading) {
      return (
        <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-canvas">
          <Loader2 className="h-6 w-6 animate-spin text-gold" />
          <p className="text-sm text-ink-muted">Verifying administrator credentials…</p>
        </div>
      );
    }

    if (!user) {
      return (
        <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-canvas">
          <Loader2 className="h-6 w-6 animate-spin text-gold" />
          <p className="text-sm text-ink-muted">Redirecting to login…</p>
        </div>
      );
    }

    if (profile?.role !== 'admin' || profile?.status === 'suspended') {
      return <AdminForbidden onNavigate={handleNavigate} />;
    }
  }

  if (isProtectedRoute && !user) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-canvas">
        <Loader2 className="h-5 w-5 animate-spin text-gold" />
        <span className="text-sm text-ink-muted">Redirecting to login…</span>
      </div>
    );
  }

  const renderPage = () => {
    switch (currentPath) {
      case '/':
        return <Home onNavigate={handleNavigate} />;
      case '/signup':
        return <Signup onNavigate={handleNavigate} />;
      case '/login':
        return <Login onNavigate={handleNavigate} />;
      case '/forgot-password':
        return <ForgotPassword onNavigate={handleNavigate} />;
      case '/dashboard':
        return <Dashboard currentPath={currentPath} onNavigate={handleNavigate} />;
      // One feature, one route. Legacy paths are aliased so old links and
      // bookmarks keep working rather than 404ing.
      case '/material':
      case '/materials':
      case '/reader':
      case (currentPath.startsWith('/material/') ? currentPath : ''):
      case (currentPath.startsWith('/materials/') ? currentPath : ''):
      case (currentPath.startsWith('/reader/') ? currentPath : ''):
        return <Material currentPath={currentPath} onNavigate={handleNavigate} />;
      case '/settings':
        return <Settings currentPath={currentPath} onNavigate={handleNavigate} />;
      case '/privacy':
        return <Privacy currentPath={currentPath} onNavigate={handleNavigate} />;
      case '/terms':
        return <Terms currentPath={currentPath} onNavigate={handleNavigate} />;
      case '/refund-policy':
        return <RefundPolicy currentPath={currentPath} onNavigate={handleNavigate} />;
      case '/content-disclaimer':
        return <ContentDisclaimer currentPath={currentPath} onNavigate={handleNavigate} />;
      case '/fair-use':
        return <FairUse currentPath={currentPath} onNavigate={handleNavigate} />;
      case '/cookie-policy':
        return <CookiePolicy currentPath={currentPath} onNavigate={handleNavigate} />;
      case '/help':
        return <Help currentPath={currentPath} onNavigate={handleNavigate} />;
      case '/admin':
        return <AdminOverview currentPath={currentPath} onNavigate={handleNavigate} />;
      case '/admin/users':
        return <AdminUsers currentPath={currentPath} onNavigate={handleNavigate} />;
      case '/admin/materials':
        return <AdminMaterials currentPath={currentPath} onNavigate={handleNavigate} />;
      case '/admin/reader':
        return <AdminReader currentPath={currentPath} onNavigate={handleNavigate} />;
      case '/admin/fulfilment':
        return <AdminFulfilment currentPath={currentPath} onNavigate={handleNavigate} />;
      case '/admin/payments':
        return <AdminPayments currentPath={currentPath} onNavigate={handleNavigate} />;
      case '/admin/access':
      case '/admin/devices':
      case '/admin/access-devices':
        return <AdminAccessDevices currentPath={currentPath} onNavigate={handleNavigate} />;
      case '/admin/logs':
        return <AdminLogs currentPath={currentPath} onNavigate={handleNavigate} />;
      case '/admin/settings':
        return <AdminSettings currentPath={currentPath} onNavigate={handleNavigate} />;
      case '/404':
      default:
        return <NotFound currentPath={currentPath} onNavigate={handleNavigate} />;
    }
  };

  return (
    <div className="min-h-screen bg-canvas">
      {renderPage()}

      {/* Session Conflict Modal */}
      {deviceConflict && (
        <Modal
          isOpen={!!deviceConflict}
          onClose={() => {}}
          title="Active session conflict"
          footer={
            <div className="flex items-center justify-end gap-3">
              <Button
                variant="secondary"
                size="sm"
                onClick={async () => {
                  await cancelDeviceConflict();
                  handleNavigate('/login');
                }}
              >
                Cancel and sign out
              </Button>
              <Button
                variant="primary"
                size="sm"
                isLoading={takingOver}
                onClick={async () => {
                  setTakingOver(true);
                  const res = await resolveDeviceConflict(true);
                  setTakingOver(false);
                  if (res.success) {
                    handleNavigate('/dashboard');
                  }
                }}
              >
                Sign out other device and continue
              </Button>
            </div>
          }
        >
          <div className="space-y-4 text-sm text-ink-soft">
            <div className="flex items-start gap-3 rounded-md border border-danger/30 bg-danger/10 p-4">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-danger" />
              <div>
                <p className="font-semibold text-ink">
                  Your account is already active on another device.
                </p>
                <p className="mt-1 text-xs text-ink-muted">
                  {deviceConflict.message ||
                    'EduVault enforces a single active browser session per account for security.'}
                </p>
              </div>
            </div>
            <p className="text-ink-muted">
              If you continue on this device, the session on the other device will be immediately revoked
              and signed out.
            </p>
          </div>
        </Modal>
      )}
    </div>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <ProfileProvider>
          <AppContent />
        </ProfileProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}
