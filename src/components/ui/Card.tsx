import React from 'react';

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  className?: string;
  /**
   * `glass`  — translucent, blurred. For hero cards, floating panels, feature tiles.
   * `solid`  — opaque surface. Use for anything dense or form-like: translucent
   *            fills make text contrast depend on whatever is behind them.
   */
  variant?: 'glass' | 'solid' | 'interactive' | 'deep';
  /**
   * Padding is a prop, not a className override: `p-5` and `p-6` are emitted at
   * equal specificity, so whichever lands later in the stylesheet wins —
   * passing "p-0" in className would silently keep the default padding.
   */
  padding?: 'none' | 'sm' | 'md' | 'lg';
}

export const Card: React.FC<CardProps> = ({
  children,
  className = '',
  variant = 'glass',
  padding = 'md',
  ...props
}) => {
  const variantStyles = {
    glass:       'glass rounded-lg',
    solid:       'glass-solid rounded-lg',
    deep:        'bg-surface-deep border border-line-strong rounded-lg',
    interactive: 'glass rounded-lg transition-colors duration-200 hover:border-gold cursor-pointer',
  };

  const paddingStyles = {
    none: '',
    sm: 'p-4',
    md: 'p-6',
    lg: 'p-8',
  };

  return (
    <div className={`${variantStyles[variant]} ${paddingStyles[padding]} ${className}`} {...props}>
      {children}
    </div>
  );
};
