import assert from 'node:assert/strict';
import { installPromiseWithResolvers } from '../src/lib/polyfills';

/**
 * Simulates an older mobile engine that has no native Promise.withResolvers,
 * then verifies the fallback and its "never overwrite native" behaviour.
 *
 * Run with: npx tsx scripts/test-promise-with-resolvers.ts
 */

const original = Object.getOwnPropertyDescriptor(Promise, 'withResolvers');

try {
  // Remove the native implementation (Node 22 has it).
  Object.defineProperty(Promise, 'withResolvers', {
    configurable: true,
    writable: true,
    value: undefined,
  });
  assert.equal(typeof (Promise as any).withResolvers, 'undefined');

  installPromiseWithResolvers();
  assert.equal(typeof (Promise as any).withResolvers, 'function');

  // Resolve path.
  const resolved = (Promise as any).withResolvers<number>();
  assert.ok(resolved.promise instanceof Promise);
  resolved.resolve(42);
  assert.equal(await resolved.promise, 42);

  // Reject path.
  const rejected = (Promise as any).withResolvers<number>();
  const rejection = assert.rejects(rejected.promise, /expected rejection/);
  rejected.reject(new Error('expected rejection'));
  await rejection;

  // An existing implementation must be left untouched.
  const marker = function marker() {};
  Object.defineProperty(Promise, 'withResolvers', {
    configurable: true,
    writable: true,
    value: marker,
  });
  installPromiseWithResolvers();
  assert.equal(
    (Promise as any).withResolvers,
    marker,
    'the fallback must not overwrite an existing implementation',
  );

  console.log('Promise.withResolvers fallback: all assertions passed');
} finally {
  if (original) {
    Object.defineProperty(Promise, 'withResolvers', original);
  } else {
    delete (Promise as any).withResolvers;
  }
}
