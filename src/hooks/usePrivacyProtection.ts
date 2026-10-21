import { useCallback, useEffect, useRef } from 'react';
import {
  PrivacyProtect,
  type PrivacyBlockReason,
  type PrivacyProtectOptions,
} from '../lib/privacyProtect';

export interface UsePrivacyProtectionOptions extends PrivacyProtectOptions {
  /** Only run while the authenticated protected-material session is open. */
  enabled: boolean;
}

/**
 * React wrapper around the vendored `PrivacyProtect` module.
 *
 * The manager reference-counts activations, so React Strict Mode's
 * mount → cleanup → mount cycle tears down the first activation and creates a
 * single replacement instead of leaving duplicate document listeners behind.
 * `onBlocked` is held in a ref so changing callbacks never re-attach handlers.
 */
export function usePrivacyProtection({
  enabled,
  feedback,
  blockPrint,
  watermarkText,
  printNoticeText,
  onBlocked,
}: UsePrivacyProtectionOptions): void {
  const onBlockedRef = useRef(onBlocked);

  // Keep the latest closure without making it an effect dependency: the manager
  // captures a stable wrapper, so re-renders never re-register listeners.
  useEffect(() => {
    onBlockedRef.current = onBlocked;
  });

  const stableOnBlocked = useCallback((reason: PrivacyBlockReason) => {
    onBlockedRef.current?.(reason);
  }, []);

  useEffect(() => {
    if (!enabled) return;
    return PrivacyProtect.enable({
      feedback,
      blockPrint,
      watermarkText,
      printNoticeText,
      onBlocked: stableOnBlocked,
    });
  }, [enabled, feedback, blockPrint, watermarkText, printNoticeText, stableOnBlocked]);
}
