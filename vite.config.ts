import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

// `package.json` declares "type": "module", so this config is loaded as ESM.
// `__dirname` does not exist in ESM and evaluating it throws during config
// load — which surfaces as an opaque "failed to resolve entry" build error.
// fileURLToPath(import.meta.url) is the ESM-safe equivalent.
const rootDir = fileURLToPath(new URL('.', import.meta.url));
const srcDir = fileURLToPath(new URL('./src', import.meta.url));

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        // Conventional alias: `@/components/...` -> `src/components/...`.
        // Kept in sync with tsconfig.json "paths".
        '@': srcDir,
      },
    },
    // Root-relative asset URLs. The app is served from the domain root on
    // Vercel, and vercel.json's SPA rewrite falls back to index.html for any
    // non-file path, so /assets/* keeps resolving after a deep-link refresh.
    base: '/',
    // Keep build output at the project root `dist/`, which vercel.json points at.
    build: {
      outDir: 'dist',
      emptyOutDir: true,
      sourcemap: false,
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var. Do not modify —
      // file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
    // `rootDir` is exported for any future config that needs the absolute path.
    define: {},
    envPrefix: 'VITE_',
    root: rootDir,
  };
});
