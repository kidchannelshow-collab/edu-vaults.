/**
 * Scoped adaptation of Screenshot-PrivacyProtectionWeb.
 *
 * Upstream: https://github.com/dxvzz/Screenshot-PrivacyProtectionWeb
 * The upstream project is not published to npm (`screenshot-privacy-protect`
 * returns 404) and has no library entry point — its protection code is an
 * inline script in the Next.js demo's `app/layout.tsx`. This module keeps the
 * useful, honest parts of that approach (print hiding, selection/drag
 * suppression, an optional watermark, and in-context feedback) while removing
 * the parts that were unsafe or misleading:
 *
 *   - no 1 ms focus polling, no 100 ms handler re-attachment
 *   - no keyboard interception presented as screenshot prevention
 *   - no "screenshot blocked" claim on blur/visibility change
 *   - no clipboard polling (upstream's `useRobustProtection` does this)
 *
 * Android Chrome—like every browser—cannot prevent an OS-level screenshot or
 * screen recording. This module is a deterrent and a watermarking layer, not
 * a guarantee. It never tells the student that a capture was blocked.
 *
 * MIT License — Copyright (c) 2025 Devdatta SM
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 */

export type PrivacyBlockReason = 'print' | 'copy' | 'context-menu' | 'drag';

export interface PrivacyProtectOptions {
  /** Show an in-reader notice when an action is prevented. Default: true. */
  feedback?: boolean;
  /**
   * Hide protected content from print output and intercept `beforeprint`.
   * Default: true. CSS does the real work; `beforeprint` cancelation is only a
   * best-effort supplement because browsers are not required to honour it.
   */
  blockPrint?: boolean;
  /**
   * Text for the built-in watermark. Pass an empty string to disable it.
   *
   * EduVault already renders a per-student watermark, so the reader marks that
   * element with `data-eduvault-watermark` and this module deliberately does
   * not add a second overlay.
   */
  watermarkText?: string;
  /** Shown on the print-blocked page. */
  printNoticeText?: string;
  /** Called for every prevented action, whether or not feedback is shown. */
  onBlocked?: (reason: PrivacyBlockReason) => void;
}

interface ResolvedOptions {
  feedback: boolean;
  blockPrint: boolean;
  watermarkText: string;
  printNoticeText: string;
  onBlocked?: (reason: PrivacyBlockReason) => void;
}

interface ListenerEntry {
  target: EventTarget;
  type: string;
  handler: EventListener;
  capture: boolean;
}

interface Session {
  options: ResolvedOptions;
  styleEl: HTMLStyleElement | null;
  watermarkEl: HTMLElement | null;
  printNoticeEl: HTMLElement | null;
  feedbackEl: HTMLElement | null;
  feedbackTimer: number | null;
  listeners: ListenerEntry[];
}

const PROTECTED_ATTR = 'data-eduvault-protected';
const WATERMARK_ATTR = 'data-eduvault-watermark';
const PRINT_NOTICE_ATTR = 'data-eduvault-print-notice';
const FEEDBACK_ATTR = 'data-eduvault-privacy-feedback';
const STYLE_ID = 'eduvault-privacy-protect-style';

const MESSAGES: Record<PrivacyBlockReason, string> = {
  print: 'Printing is disabled for this protected material.',
  copy: 'Copying is disabled in the secure reader.',
  'context-menu': 'The context menu is disabled in the secure reader.',
  drag: 'Dragging content out of the secure reader is disabled.',
};

/**
 * All rules are scoped to `[data-eduvault-protected]` or to print output, so
 * the rest of the site is untouched. The print rules override index.css's
 * global `body { display: none }` while the reader is open, hide the app, and
 * show a licence notice instead of the document.
 */
const STYLES = `
[${PROTECTED_ATTR}] {
  -webkit-user-select: none;
  user-select: none;
  -webkit-touch-callout: none;
}
[${PROTECTED_ATTR}] canvas,
[${PROTECTED_ATTR}] img {
  -webkit-user-drag: none;
}

[${FEEDBACK_ATTR}] {
  position: fixed;
  left: 50%;
  bottom: 24px;
  transform: translateX(-50%);
  z-index: 2147483646;
  max-width: min(92vw, 28rem);
  padding: 10px 16px;
  border: 1px solid rgba(212, 175, 55, 0.45);
  border-radius: 8px;
  background: rgba(11, 27, 54, 0.96);
  color: #f5f7fa;
  font: 500 13px/1.4 system-ui, -apple-system, sans-serif;
  text-align: center;
  box-shadow: 0 8px 30px rgba(0, 0, 0, 0.45);
  pointer-events: none;
  opacity: 1;
  transition: opacity 0.25s ease;
}
[${FEEDBACK_ATTR}][data-hidden="true"] {
  opacity: 0;
}

[${WATERMARK_ATTR}="library"] {
  position: absolute;
  inset: 0;
  z-index: 10;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4rem;
  overflow: hidden;
  pointer-events: none;
  user-select: none;
  transform: rotate(-25deg);
  opacity: 0.04;
}
[${WATERMARK_ATTR}="library"] span {
  white-space: nowrap;
  font-weight: 900;
  letter-spacing: 0.15em;
  font-size: 1.5rem;
  color: #fff;
}

[${PRINT_NOTICE_ATTR}] {
  display: none;
  position: fixed;
  inset: 0;
  align-items: center;
  justify-content: center;
  padding: 48px;
  background: #fff;
  color: #0b1b36;
  font: 500 16px/1.6 system-ui, -apple-system, sans-serif;
  text-align: center;
}

@media print {
  html,
  body {
    display: block !important;
    background: #fff !important;
  }
  body > *:not([${PRINT_NOTICE_ATTR}]) {
    display: none !important;
  }
  [${PRINT_NOTICE_ATTR}] {
    display: flex !important;
  }
}
`;

let session: Session | null = null;
let refCount = 0;

function resolve(options: PrivacyProtectOptions): ResolvedOptions {
  return {
    feedback: options.feedback ?? true,
    blockPrint: options.blockPrint ?? true,
    watermarkText: options.watermarkText ?? '',
    printNoticeText:
      options.printNoticeText ?? 'Printing is disabled for this protected material.',
    onBlocked: options.onBlocked,
  };
}

function isProtectedEvent(event: Event): boolean {
  const target = event.target;
  return (
    target instanceof Element && target.closest(`[${PROTECTED_ATTR}]`) !== null
  );
}

function protectedHost(): HTMLElement | null {
  return document.querySelector<HTMLElement>(`[${PROTECTED_ATTR}]`);
}

function ensureStyle(current: Session): void {
  let el = document.getElementById(STYLE_ID) as HTMLStyleElement | null;
  if (!el) {
    el = document.createElement('style');
    el.id = STYLE_ID;
    document.head.appendChild(el);
  }
  // Re-assigning keeps a hot-reloaded style in sync with this module.
  if (el.textContent !== STYLES) el.textContent = STYLES;
  current.styleEl = el;
}

function ensurePrintNotice(current: Session): void {
  if (!current.options.blockPrint) {
    current.printNoticeEl?.remove();
    current.printNoticeEl = null;
    return;
  }

  let el = current.printNoticeEl;
  if (!el || !el.isConnected) {
    el = document.createElement('div');
    el.setAttribute(PRINT_NOTICE_ATTR, '');
    el.setAttribute('role', 'note');
    document.body.appendChild(el);
    current.printNoticeEl = el;
  }
  el.textContent = current.options.printNoticeText;
}

/**
 * The upstream watermark is a single generic string. EduVault's reader already
 * renders a per-student, per-session layer; if one is present this is a no-op.
 * A watermark created here is owned by this session and removed on teardown —
 * an existing EduVault watermark is never touched.
 */
function ensureWatermark(current: Session): void {
  if (!current.options.watermarkText) {
    current.watermarkEl?.remove();
    current.watermarkEl = null;
    return;
  }

  const existing = document.querySelector(`[${WATERMARK_ATTR}]`);
  if (existing && existing !== current.watermarkEl) {
    // EduVault (or another consumer) owns the watermark. Do not duplicate it.
    current.watermarkEl?.remove();
    current.watermarkEl = null;
    return;
  }

  const host = protectedHost();
  if (!host) return;

  if (current.watermarkEl?.isConnected) {
    current.watermarkEl.querySelectorAll('span').forEach((span) => {
      span.textContent = current.options.watermarkText;
    });
    return;
  }

  const el = document.createElement('div');
  el.setAttribute(WATERMARK_ATTR, 'library');
  el.setAttribute('aria-hidden', 'true');
  for (let i = 0; i < 3; i += 1) {
    const span = document.createElement('span');
    span.textContent = current.options.watermarkText;
    el.appendChild(span);
  }
  host.appendChild(el);
  current.watermarkEl = el;
}

function showFeedback(current: Session, reason: PrivacyBlockReason): void {
  if (!current.options.feedback) return;

  const host = protectedHost() ?? document.body;
  let el = current.feedbackEl;

  // Fullscreen swaps the reader root, detaching the previous toast. Recreate it
  // inside the current protected element so it also shows above a native
  // fullscreen layer.
  if (!el || !el.isConnected) {
    el = document.createElement('div');
    el.setAttribute(FEEDBACK_ATTR, '');
    el.setAttribute('role', 'status');
    el.setAttribute('aria-live', 'polite');
    current.feedbackEl = el;
  }

  if (el.parentNode !== host) host.appendChild(el);
  el.textContent = MESSAGES[reason];
  el.removeAttribute('data-hidden');

  if (current.feedbackTimer !== null) window.clearTimeout(current.feedbackTimer);
  current.feedbackTimer = window.setTimeout(() => {
    el?.setAttribute('data-hidden', 'true');
  }, 3500);
}

function attach(current: Session): void {
  const block =
    (reason: PrivacyBlockReason): EventListener =>
    (event) => {
      if (!isProtectedEvent(event)) return;
      event.preventDefault();
      current.options.onBlocked?.(reason);
      showFeedback(current, reason);
    };

  const onBeforePrint: EventListener = (event) => {
    if (!current.options.blockPrint || !protectedHost()) return;
    // Best-effort only. The @media print rules above are the actual block; this
    // call also lets the reader log the attempt.
    event.preventDefault();
    current.options.onBlocked?.('print');
    showFeedback(current, 'print');
  };

  const entries: ListenerEntry[] = [
    {
      target: document,
      type: 'contextmenu',
      handler: block('context-menu'),
      capture: true,
    },
    { target: document, type: 'copy', handler: block('copy'), capture: true },
    { target: document, type: 'cut', handler: block('copy'), capture: true },
    { target: document, type: 'dragstart', handler: block('drag'), capture: true },
    { target: window, type: 'beforeprint', handler: onBeforePrint, capture: false },
  ];

  entries.forEach(({ target, type, handler, capture }) =>
    target.addEventListener(type, handler, { capture }),
  );
  current.listeners = entries;

  // Deliberately no keydown/visibilitychange/blur listeners:
  //   - keydown cannot prevent OS screenshots and was the source of upstream's
  //     false "blocked" claims;
  //   - blur/visibilitychange fire for app switches, screen rotation, permission
  //     prompts and the print dialog itself, producing false alarms on Android.
  // The reader's existing, separate keydown handler remains responsible for
  // logging PrintScreen intent.
}

function detach(current: Session): void {
  current.listeners.forEach(({ target, type, handler, capture }) =>
    target.removeEventListener(type, handler, { capture }),
  );
  current.listeners = [];
}

function teardown(current: Session): void {
  detach(current);
  if (current.feedbackTimer !== null) {
    window.clearTimeout(current.feedbackTimer);
    current.feedbackTimer = null;
  }
  current.feedbackEl?.remove();
  current.printNoticeEl?.remove();
  current.watermarkEl?.remove();
  current.styleEl?.remove();
  current.feedbackEl = null;
  current.printNoticeEl = null;
  current.watermarkEl = null;
  current.styleEl = null;
}

export const PrivacyProtect = {
  /**
   * Activate protection for the current protected-material session. Returns a
   * release function; every call must be paired with it. StrictMode's
   * mount/unmount/mount cycle is handled by reference counting, so listeners
   * and overlays are never duplicated and the final release removes them all.
   */
  enable(options: PrivacyProtectOptions = {}): () => void {
    if (typeof window === 'undefined' || typeof document === 'undefined') {
      return () => {};
    }

    const resolved = resolve(options);

    if (!session) {
      session = {
        options: resolved,
        styleEl: null,
        watermarkEl: null,
        printNoticeEl: null,
        feedbackEl: null,
        feedbackTimer: null,
        listeners: [],
      };
      ensureStyle(session);
      ensurePrintNotice(session);
      ensureWatermark(session);
      attach(session);
    } else {
      session.options = {
        ...resolved,
        onBlocked: options.onBlocked ?? session.options.onBlocked,
      };
      ensurePrintNotice(session);
      ensureWatermark(session);
    }

    refCount += 1;
    const current = session;
    let released = false;

    return () => {
      if (released) return;
      released = true;
      refCount = Math.max(0, refCount - 1);
      if (refCount > 0) return;
      if (session === current) {
        teardown(current);
        session = null;
      }
    };
  },

  /** Force-remove every listener, overlay and style created by this module. */
  disable(): void {
    refCount = 0;
    if (session) {
      teardown(session);
      session = null;
    }
  },

  isEnabled(): boolean {
    return session !== null;
  },
};
