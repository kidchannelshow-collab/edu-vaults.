import React from 'react';
import { MainLayout } from '../layouts/MainLayout';
import { Button } from '../components/ui/Button';
import { FileQuestion, ArrowLeft } from 'lucide-react';

export interface NotFoundProps {
  currentPath: string;
  onNavigate: (path: string) => void;
}

export const NotFound: React.FC<NotFoundProps> = ({ currentPath, onNavigate }) => {
  return (
    <MainLayout currentPath={currentPath} onNavigate={onNavigate}>
      <div className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center px-4 py-16 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-lg border border-line-strong bg-canvas text-ink-muted">
          <FileQuestion className="h-6 w-6" aria-hidden="true" />
        </div>
        <h1 className="mt-6 text-2xl font-semibold text-ink">Page Not Found</h1>
        <p className="mt-2 text-sm text-ink-muted">
          The educational material or page you are looking for does not exist or has been relocated.
        </p>
        <div className="mt-8">
          <Button variant="primary" size="md" onClick={() => onNavigate('/')} leftIcon={<ArrowLeft className="w-4 h-4" aria-hidden="true" />}>
            Return to Overview
          </Button>
        </div>
      </div>
    </MainLayout>
  );
};
