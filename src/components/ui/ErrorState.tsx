import React from 'react';
import { AlertCircle } from 'lucide-react';
import { Button } from './Button';

export interface ErrorStateProps {
  title?: string;
  message: string;
  onRetry?: () => void;
}

export const ErrorState: React.FC<ErrorStateProps> = ({
  title = 'Something went wrong',
  message,
  onRetry,
}) => {
  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-danger/30 bg-danger/5 p-10 text-center">
      <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-lg border border-danger/30 bg-danger/10 text-danger">
        <AlertCircle className="h-5 w-5" />
      </div>
      <h3 className="mb-1 text-base font-semibold text-ink">{title}</h3>
      <p className="mb-5 max-w-md text-sm text-ink-muted">{message}</p>
      {onRetry && (
        <Button onClick={onRetry} variant="secondary" size="sm">
          Try again
        </Button>
      )}
    </div>
  );
};
