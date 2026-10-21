/**
 * Promise.withResolvers fallback for older mobile browsers and Android
 * WebViews.
 *
 * PDF.js 4.10.38 calls `Promise.withResolvers()` in both its main thread and
 * worker code. The API is only available in newer engines (Chrome 119+,
 * Safari 17.4+, Firefox 121+), so older phones can crash with
 * "Promise.withResolvers is not a function".
 *
 * The app also uses PDF.js's legacy build, whose main and worker bundles carry
 * their own core-js polyfill. This guard covers the main thread before those
 * modules evaluate and is easy to unit-test. It is standards-compatible and
 * never overwrites a native implementation.
 *
 * Imported first in `main.tsx` so it executes before React/App/PDF.js.
 */

type Resolve<T> = (value: T | PromiseLike<T>) => void;
type Reject = (reason?: unknown) => void;

export interface PromiseWithResolversResult<T> {
  promise: Promise<T>;
  resolve: Resolve<T>;
  reject: Reject;
}

const promiseConstructor = Promise as PromiseConstructor & {
  withResolvers?: <T>() => PromiseWithResolversResult<T>;
};

export function installPromiseWithResolvers(): void {
  if (typeof promiseConstructor.withResolvers === 'function') {
    return;
  }

  Object.defineProperty(promiseConstructor, 'withResolvers', {
    configurable: true,
    writable: true,
    value: function withResolvers<T>(): PromiseWithResolversResult<T> {
      let resolve!: Resolve<T>;
      let reject!: Reject;
      const promise = new Promise<T>((res, rej) => {
        resolve = res;
        reject = rej;
      });
      return { promise, resolve, reject };
    },
  });
}

installPromiseWithResolvers();
