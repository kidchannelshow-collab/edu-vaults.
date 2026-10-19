import React from 'react';
import { BookOpen, ArrowLeft } from 'lucide-react';

export interface AuthLayoutProps {
  currentPath: string;
  onNavigate: (path: string) => void;
  title: string;
  subtitle: string;
  children: React.ReactNode;
}

export const AuthLayout: React.FC<AuthLayoutProps> = ({
  onNavigate,
  title,
  subtitle,
  children,
}) => {
  return (
    <div className="flex min-h-screen flex-col justify-center bg-canvas px-4 py-12 sm:px-6 lg:px-8">
      <div className="mx-auto w-full max-w-md">
        <div
          onClick={() => onNavigate('/')}
          className="mb-8 flex cursor-pointer items-center justify-center gap-2.5"
        >
          <div className="flex h-9 w-9 items-center justify-center rounded-md bg-gold text-on-gold">
            <BookOpen className="h-5 w-5" />
          </div>
          <span className="text-lg font-semibold tracking-tight text-ink">EduVault</span>
        </div>

        <div className="mb-6 text-center">
          <h1 className="text-2xl font-semibold tracking-tight text-ink">{title}</h1>
          <p className="mt-2 text-sm text-ink-muted">{subtitle}</p>
        </div>

        <div className="rounded-lg border border-line-strong bg-surface p-6 sm:p-8">{children}</div>

        <div className="mt-6 text-center">
          <button
            onClick={() => onNavigate('/')}
            className="inline-flex items-center gap-1.5 text-sm text-ink-muted transition-colors hover:text-ink"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to home
          </button>
        </div>
      </div>
    </div>
  );
};
