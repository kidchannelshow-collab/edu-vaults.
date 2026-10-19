import React from 'react';
import { RealtimeStatus } from '../../hooks/useRealtimeRefresh';

export interface LiveIndicatorProps {
  status: RealtimeStatus;
  className?: string;
}

/**
 * Connection state for a live-updating panel.
 *
 * Green is used only for the genuine "receiving updates" state — the same rule
 * that reserves functional colour for real status, never decoration.
 */
export const LiveIndicator: React.FC<LiveIndicatorProps> = ({ status, className = '' }) => {
  const config = {
    live: {
      dot: 'bg-success',
      text: 'text-success',
      label: 'Live',
    },
    connecting: {
      dot: 'bg-ink-faint',
      text: 'text-ink-muted',
      label: 'Connecting…',
    },
    offline: {
      dot: 'bg-ink-faint',
      text: 'text-ink-faint',
      label: 'Manual refresh',
    },
  }[status];

  return (
    <span
      className={`inline-flex items-center gap-1.5 text-xs font-medium ${config.text} ${className}`}
      title={
        status === 'live'
          ? 'Updating automatically as records change'
          : status === 'connecting'
            ? 'Establishing live connection'
            : 'Live updates unavailable — reload to refresh'
      }
    >
      <span className="relative flex h-1.5 w-1.5">
        {status === 'live' && (
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-60" />
        )}
        <span className={`relative inline-flex h-1.5 w-1.5 rounded-full ${config.dot}`} />
      </span>
      {config.label}
    </span>
  );
};
