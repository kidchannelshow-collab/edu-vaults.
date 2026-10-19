import React from 'react';

export interface LoadingStateProps {
  message?: string;
  size?: 'sm' | 'md' | 'lg';
}

export const LoadingState: React.FC<LoadingStateProps> = ({
  message = 'Loading...',
  size = 'md',
}) => {
  const sizeClasses = {
    sm: 'w-5 h-5 border-2',
    md: 'w-8 h-8 border-2',
    lg: 'w-12 h-12 border-[3px]',
  };

  return (
    <div className="flex w-full flex-col items-center justify-center px-4 py-12">
      <div className={`animate-spin rounded-full border-line-strong border-t-gold ${sizeClasses[size]}`} />
      {message && <p className="mt-4 text-sm text-ink-muted">{message}</p>}
    </div>
  );
};
