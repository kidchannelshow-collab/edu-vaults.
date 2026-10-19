import React from 'react';
import { motion, useReducedMotion } from 'motion/react';

export interface RevealProps {
  children: React.ReactNode;
  className?: string;
  /** Seconds. Use small increments (0, 0.06, 0.12) to stagger siblings. */
  delay?: number;
  /** Travel distance in px. Keep small — this should read as a settle, not a slide. */
  y?: number;
}

/**
 * The single motion primitive for the app.
 *
 * Deliberately restrained: a short fade + small vertical settle, played once
 * when the element scrolls into view. No bounce, no spring overshoot, no
 * looping decoration — those are what make an interface feel cheap.
 *
 * Automatically renders statically when the OS requests reduced motion.
 */
export const Reveal: React.FC<RevealProps> = ({
  children,
  className = '',
  delay = 0,
  y = 16,
}) => {
  const reduceMotion = useReducedMotion();

  if (reduceMotion) {
    return <div className={className}>{children}</div>;
  }

  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-60px' }}
      transition={{ duration: 0.45, delay, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </motion.div>
  );
};
