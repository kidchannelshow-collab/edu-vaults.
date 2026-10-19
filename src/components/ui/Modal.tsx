import React, { useEffect } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { X } from 'lucide-react';

export interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  maxWidth?: 'sm' | 'md' | 'lg' | 'xl';
}

export const Modal: React.FC<ModalProps> = ({
  isOpen,
  onClose,
  title,
  children,
  footer,
  maxWidth = 'md',
}) => {
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const maxWidthStyles = {
    sm: 'max-w-sm',
    md: 'max-w-md',
    lg: 'max-w-lg',
    xl: 'max-w-2xl',
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex min-h-screen items-center justify-center p-4">
        {/* Deep navy scrim, never pure black — pure black over blur reads harsh. */}
        <motion.div
          initial={reduceMotion ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 bg-scrim backdrop-blur-sm"
          onClick={onClose}
          aria-hidden="true"
        />
        <motion.div
          role="dialog"
          aria-modal="true"
          initial={reduceMotion ? false : { opacity: 0, scale: 0.97, y: 8 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
          className={`glass relative w-full ${maxWidthStyles[maxWidth]} rounded-xl text-left`}
        >
          <div className="flex items-center justify-between border-b border-line-strong px-6 py-4">
            <h3 className="text-base font-semibold text-ink">{title}</h3>
            <button
              onClick={onClose}
              aria-label="Close dialog"
              className="rounded-md p-1 text-ink-faint transition-colors duration-200 hover:bg-overlay hover:text-ink"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
          <div className="max-h-[70vh] overflow-y-auto px-6 py-5 text-ink-muted">
            {children}
          </div>
          {footer && (
            <div className="flex items-center justify-end gap-3 rounded-b-xl border-t border-line-strong bg-surface-deep/60 px-6 py-4">
              {footer}
            </div>
          )}
        </motion.div>
      </div>
    </div>
  );
};
