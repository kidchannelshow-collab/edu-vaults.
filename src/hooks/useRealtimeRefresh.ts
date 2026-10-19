import { useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';

export type RealtimeStatus = 'connecting' | 'live' | 'offline';

/**
 * Re-run `onChange` whenever any of `tables` changes in Postgres.
 *
 * Supabase Realtime is RLS-aware: a subscriber only receives change events for
 * rows it is allowed to SELECT. Admin pages read through the "Admins can manage
 * …" policies, so an admin sees the full stream while a student would not.
 *
 * Events are coalesced — a batch of inserts produces one reload, not one per row.
 */
export function useRealtimeRefresh(
  tables: string[],
  onChange: () => void,
  enabled = true
): RealtimeStatus {
  const [status, setStatus] = useState<RealtimeStatus>(enabled ? 'connecting' : 'offline');

  // Keep the callback in a ref so a new inline function each render does not
  // tear down and rebuild the subscription.
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Depend on the table list by value, not identity, so callers can pass an
  // inline array without resubscribing on every render.
  const tableKey = tables.join(',');

  useEffect(() => {
    if (!enabled) {
      setStatus('offline');
      return;
    }

    let disposed = false;
    setStatus('connecting');

    const channel = supabase.channel(
      `rt:${tableKey}:${Math.random().toString(36).slice(2)}`
    );

    tableKey.split(',').forEach((table) => {
      channel.on(
        'postgres_changes',
        { event: '*', schema: 'public', table },
        () => {
          if (timerRef.current) clearTimeout(timerRef.current);
          timerRef.current = setTimeout(() => onChangeRef.current(), 400);
        }
      );
    });

    channel.subscribe((subscribeStatus) => {
      if (disposed) return;
      if (subscribeStatus === 'SUBSCRIBED') {
        setStatus('live');
      } else if (
        subscribeStatus === 'CHANNEL_ERROR' ||
        subscribeStatus === 'TIMED_OUT' ||
        subscribeStatus === 'CLOSED'
      ) {
        setStatus('offline');
      }
    });

    return () => {
      disposed = true;
      if (timerRef.current) clearTimeout(timerRef.current);
      supabase.removeChannel(channel);
    };
  }, [tableKey, enabled]);

  return status;
}
