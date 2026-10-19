import React from 'react';
import { ShieldAlert, ArrowLeft, Lock } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';

interface AdminForbiddenProps {
  onNavigate: (path: string) => void;
}

export const AdminForbidden: React.FC<AdminForbiddenProps> = ({ onNavigate }) => {
  return (
    <div className="flex min-h-screen items-center justify-center bg-canvas p-6">
      <Card variant="glass" padding="lg" className="w-full max-w-md space-y-6 text-center">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-lg bg-danger/10 text-danger">
          <ShieldAlert className="w-8 h-8" />
        </div>
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold text-ink">Access Forbidden</h1>
          <p className="text-sm text-ink-muted leading-relaxed">
            You do not possess administrative privileges required to access the EduVault Admin Control Center. This attempt has been securely logged.
          </p>
        </div>
        <div className="flex flex-col gap-3 border-t border-line-strong pt-4">
          <Button
            variant="primary"
            size="md"
            onClick={() => onNavigate('/dashboard')}
            leftIcon={<ArrowLeft className="w-4 h-4" />}
            className="w-full justify-center"
          >
            Return to User Dashboard
          </Button>
        </div>
      </Card>
    </div>
  );
};
