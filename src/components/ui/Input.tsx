import React from 'react';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  helperText?: string;
}

/**
 * Inputs sit on an OPAQUE surface, never glass: a translucent fill makes the
 * text contrast depend on whatever is behind the field.
 */
export const Input = React.forwardRef<HTMLInputElement, InputProps>(({
  label,
  error,
  leftIcon,
  rightIcon,
  helperText,
  className = '',
  id,
  ...props
}, ref) => {
  const inputId = id || (label ? label.toLowerCase().replace(/\s+/g, '-') : undefined);

  return (
    <div className="w-full space-y-1.5">
      {label && (
        <label htmlFor={inputId} className="block text-sm font-medium text-ink-soft">
          {label}
        </label>
      )}
      <div className="relative">
        {leftIcon && (
          <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-ink-faint">
            {leftIcon}
          </div>
        )}
        <input
          ref={ref}
          id={inputId}
          className={`w-full rounded-md border bg-surface-deep text-ink placeholder-ink-faint text-sm transition-colors duration-200 focus:outline-none focus:ring-2 ${
            error
              ? 'border-danger focus:border-danger focus:ring-danger/25'
              : 'border-line-strong focus:border-gold focus:ring-gold/25'
          } ${leftIcon ? 'pl-10' : 'pl-3'} ${rightIcon ? 'pr-10' : 'pr-3'} py-2.5 ${className}`}
          {...props}
        />
        {rightIcon && (
          <div className="absolute inset-y-0 right-0 flex items-center pr-3 text-ink-faint">
            {rightIcon}
          </div>
        )}
      </div>
      {error && <p className="text-xs text-danger">{error}</p>}
      {helperText && !error && <p className="text-xs text-ink-faint">{helperText}</p>}
    </div>
  );
});

Input.displayName = 'Input';
