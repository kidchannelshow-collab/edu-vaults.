import React from 'react';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger' | 'link';
  size?: 'sm' | 'md' | 'lg';
  isLoading?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
}

/**
 * One button system, one primary action per view.
 *
 * primary  : gold fill with DARK text. White-on-gold is 1.66:1 and fails WCAG
 *            badly, so the label colour is non-negotiable here.
 * secondary/outline : glass surface with a defined border.
 * ghost    : borderless, for toolbars.
 * danger   : red fill, destructive actions only.
 * link     : informational blue, inline text.
 */
export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(({
  children,
  className = '',
  variant = 'primary',
  size = 'md',
  isLoading = false,
  leftIcon,
  rightIcon,
  disabled,
  ...props
}, ref) => {
  const baseStyles =
    'inline-flex items-center justify-center font-semibold whitespace-nowrap rounded-md border ' +
    'transition-colors duration-200 disabled:opacity-45 disabled:pointer-events-none ' +
    'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold';

  const variantStyles = {
    primary:   'bg-gold text-on-gold border-gold hover:bg-gold-strong hover:border-gold-strong',
    secondary: 'bg-overlay text-ink border-line-strong hover:bg-overlay-strong hover:border-ink-faint',
    outline:   'bg-overlay text-ink border-line-strong hover:bg-overlay-strong hover:border-ink-faint',
    ghost:     'bg-transparent text-ink-muted border-transparent hover:bg-overlay hover:text-ink',
    danger:    'bg-danger text-white border-danger hover:bg-danger-deep hover:border-danger-deep',
    link:      'bg-transparent text-info border-transparent hover:underline px-0',
  };

  const sizeStyles = {
    sm: 'text-sm px-3 py-1.5 gap-1.5',
    md: 'text-sm px-4 py-2.5 gap-2',
    lg: 'text-base px-6 py-3 gap-2.5',
  };

  return (
    <button
      ref={ref}
      className={`${baseStyles} ${variantStyles[variant]} ${sizeStyles[size]} ${className}`}
      disabled={disabled || isLoading}
      {...props}
    >
      {isLoading ? (
        <svg className="h-4 w-4 shrink-0 animate-spin" fill="none" viewBox="0 0 24 24" aria-hidden="true">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
        </svg>
      ) : leftIcon ? (
        <span className="shrink-0">{leftIcon}</span>
      ) : null}
      <span>{children}</span>
      {!isLoading && rightIcon && <span className="shrink-0">{rightIcon}</span>}
    </button>
  );
});

Button.displayName = 'Button';
