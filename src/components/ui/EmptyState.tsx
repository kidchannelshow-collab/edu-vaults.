import React from 'react';
import { FolderOpen } from 'lucide-react';
import { Button } from './Button';

export interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  icon,
  title,
  description,
  actionLabel,
  onAction,
}) => {
  return (
    <div className="glass-solid flex flex-col items-center justify-center rounded-lg p-12 text-center">
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-lg border border-line-strong bg-overlay text-ink-faint">
        {icon || <FolderOpen className="h-5 w-5" />}
      </div>
      <h3 className="mb-1 text-base font-semibold text-ink">{title}</h3>
      <p className="mb-6 max-w-sm text-sm text-ink-muted">{description}</p>
      {actionLabel && onAction && (
        <Button onClick={onAction} variant="primary" size="sm">
          {actionLabel}
        </Button>
      )}
    </div>
  );
};
