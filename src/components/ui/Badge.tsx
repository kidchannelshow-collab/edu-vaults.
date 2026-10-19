import React from 'react';

/**
 * Semantic badges. Functional colours (green/red/blue) are status-only —
 * they must never be used decoratively, or they stop meaning anything.
 *
 * Legacy variant names are kept as aliases so existing call sites resolve.
 */
export type BadgeVariant =
  | 'gold' | 'success' | 'danger' | 'info' | 'neutral'
  | 'emerald' | 'green' | 'violet' | 'gray' | 'warning' | 'error' | 'blue' | 'red';

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  children: React.ReactNode;
  variant?: BadgeVariant;
  size?: 'sm' | 'md';
}

export const Badge: React.FC<BadgeProps> = ({
  children,
  className = '',
  variant = 'neutral',
  size = 'md',
  ...props
}) => {
  const variantStyles: Record<BadgeVariant, string> = {
    // Gold marks brand/priority — use sparingly.
    gold:    'bg-gold/10 text-gold border-gold/30',
    success: 'bg-success/10 text-success border-success/30',
    danger:  'bg-danger/10 text-danger border-danger/30',
    info:    'bg-info/10 text-info border-info/30',
    neutral: 'bg-overlay text-ink-muted border-line-strong',

    // legacy aliases
    emerald: 'bg-success/10 text-success border-success/30',
    green:   'bg-success/10 text-success border-success/30',
    violet:  'bg-info/10 text-info border-info/30',
    blue:    'bg-info/10 text-info border-info/30',
    gray:    'bg-overlay text-ink-muted border-line-strong',
    warning: 'bg-danger/10 text-danger border-danger/30',
    error:   'bg-danger/10 text-danger border-danger/30',
    red:     'bg-danger/10 text-danger border-danger/30',
  };

  const sizeStyles = {
    sm: 'text-[11px] px-2 py-0.5 rounded',
    md: 'text-xs px-2.5 py-1 rounded-md font-medium',
  };

  return (
    <span
      className={`inline-flex items-center gap-1 whitespace-nowrap border font-medium ${variantStyles[variant]} ${sizeStyles[size]} ${className}`}
      {...props}
    >
      {children}
    </span>
  );
};
