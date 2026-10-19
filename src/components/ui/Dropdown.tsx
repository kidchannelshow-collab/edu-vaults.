import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown } from 'lucide-react';

export interface DropdownItem {
  label: string;
  value: string;
  icon?: React.ReactNode;
  onClick?: () => void;
}

export interface DropdownProps {
  trigger?: React.ReactNode;
  label?: string;
  items: DropdownItem[];
  align?: 'left' | 'right';
  className?: string;
}

export const Dropdown: React.FC<DropdownProps> = ({
  trigger,
  label = 'Options',
  items,
  align = 'left',
  className = '',
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div className={`relative inline-block text-left ${className}`} ref={dropdownRef}>
      <div onClick={() => setIsOpen(!isOpen)}>
        {trigger ? (
          trigger
        ) : (
          <button
            type="button"
            className="inline-flex items-center justify-center gap-2 rounded-md border border-line-strong bg-overlay px-3 py-2 text-sm font-medium text-ink transition-colors duration-200 hover:bg-overlay-strong focus:outline-none"
          >
            <span>{label}</span>
            <ChevronDown className={`h-4 w-4 text-ink-faint transition-transform ${isOpen ? 'rotate-180' : ''}`} />
          </button>
        )}
      </div>

      {isOpen && (
        <div
          className={`absolute z-40 mt-1 w-56 rounded-lg border border-line-strong bg-surface py-1 ${
            align === 'right' ? 'right-0' : 'left-0'
          }`}
        >
          {items.map((item, index) => (
            <button
              key={index}
              onClick={() => {
                item.onClick?.();
                setIsOpen(false);
              }}
              className="flex w-full items-center gap-2.5 px-4 py-2 text-left text-sm text-ink-muted transition-colors duration-200 hover:bg-overlay hover:text-ink"
            >
              {item.icon && <span className="text-ink-faint">{item.icon}</span>}
              <span>{item.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
