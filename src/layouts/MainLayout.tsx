import React from 'react';
import { Navbar } from '../components/Navbar';
import { BookOpen, Shield } from 'lucide-react';

export interface MainLayoutProps {
  currentPath: string;
  onNavigate: (path: string) => void;
  children: React.ReactNode;
}

export const MainLayout: React.FC<MainLayoutProps> = ({
  currentPath,
  onNavigate,
  children,
}) => {
  const linkClass = 'text-sm text-ink-muted transition-colors duration-200 hover:text-gold';

  return (
    <div className="flex min-h-screen flex-col bg-canvas">
      <Navbar currentPath={currentPath} onNavigate={onNavigate} />
      <main className="flex-1">{children}</main>

      <footer className="border-t border-line-strong bg-surface-deep/60">
        <div className="mx-auto max-w-7xl px-4 py-14 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 gap-10 md:grid-cols-4">
            <div className="space-y-4">
              <div className="flex items-center gap-2.5">
                <div className="flex h-8 w-8 items-center justify-center rounded-md bg-gold text-on-gold">
                  <BookOpen className="h-4 w-4" />
                </div>
                <span className="text-lg font-semibold tracking-tight text-ink">EduVault</span>
              </div>
              <p className="max-w-xs text-sm text-ink-muted">
                A secure study platform built for students who intend to finish first.
              </p>
            </div>

            <div>
              <h4 className="mb-3 text-xs font-semibold uppercase tracking-wider text-ink">
                Platform
              </h4>
              <ul className="space-y-2.5">
                <li><button onClick={() => onNavigate('/material')} className={linkClass}>Material</button></li>
                <li><button onClick={() => onNavigate('/dashboard')} className={linkClass}>Student Dashboard</button></li>
              </ul>
            </div>

            <div>
              <h4 className="mb-3 text-xs font-semibold uppercase tracking-wider text-ink">
                Support
              </h4>
              <ul className="space-y-2.5">
                <li><button onClick={() => onNavigate('/help')} className={linkClass}>Help Center</button></li>
              </ul>
            </div>

            <div>
              <h4 className="mb-3 text-xs font-semibold uppercase tracking-wider text-ink">
                Legal
              </h4>
              <ul className="space-y-2.5">
                <li><button onClick={() => onNavigate('/privacy')} className={linkClass}>Privacy Policy</button></li>
                <li><button onClick={() => onNavigate('/terms')} className={linkClass}>Terms of Service</button></li>
                <li><button onClick={() => onNavigate('/refund-policy')} className={linkClass}>Refund &amp; Cancellation</button></li>
                <li><button onClick={() => onNavigate('/content-disclaimer')} className={linkClass}>Content Disclaimer</button></li>
                <li><button onClick={() => onNavigate('/fair-use')} className={linkClass}>Fair Use Policy</button></li>
                <li><button onClick={() => onNavigate('/cookie-policy')} className={linkClass}>Cookie Policy</button></li>
              </ul>
            </div>

            <div>
              <h4 className="mb-3 text-xs font-semibold uppercase tracking-wider text-ink">
                Security
              </h4>
              <div className="glass-solid flex items-start gap-2.5 rounded-lg p-3">
                <Shield className="mt-0.5 h-4 w-4 shrink-0 text-success" />
                <span className="text-sm text-ink-muted">
                  Encrypted delivery with row-level security and signed-URL access.
                </span>
              </div>
            </div>
          </div>

          <div className="mt-12 flex flex-col items-center justify-between gap-4 border-t border-line-strong pt-8 sm:flex-row">
            <p className="text-xs text-ink-faint">
              © {new Date().getFullYear()} EduVault. All rights reserved.
            </p>
            <div className="flex items-center gap-6">
              <button onClick={() => onNavigate('/privacy')} className="text-xs text-ink-muted transition-colors hover:text-gold">Privacy</button>
              <button onClick={() => onNavigate('/terms')} className="text-xs text-ink-muted transition-colors hover:text-gold">Terms</button>
              <button onClick={() => onNavigate('/help')} className="text-xs text-ink-muted transition-colors hover:text-gold">Help</button>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
};
