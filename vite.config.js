import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// PokéVendor builds ONE thing: the web bundle that ships inside the native iOS shell
// (ios/Sources/Shell.swift serves `dist/` over a custom URL scheme). There is no PWA and no
// web deployment any more — see the note in ios/README.md for why the service worker was
// removed rather than merely disabled: a service worker does not run under a custom scheme,
// so inside the shell it never executed at all, and the one job it did on the web (caching
// remote card art) is done natively by URLCache.
export default defineConfig({
  // Relative base: the shell loads index.html over `pokevendor://local/`, so every asset
  // reference has to be relative to the document rather than rooted at "/".
  base: './',
  plugins: [react()],
  // Emit imported JSON as JSON.parse("...") instead of a JS object literal — JSON.parse of a
  // big string is ~1.5-2× faster than the engine parsing the equivalent literal, which is
  // worth real milliseconds on the ~2.4MB card-data chunk.
  json: { stringify: true },
  server: { port: 5179, open: true },
  build: {
    rollupOptions: {
      output: {
        // Keep the card database and the framework in their own chunks. This used to be about
        // PWA delta-updates; with the service worker gone the reason is parse cost — WebKit
        // compiles each chunk separately, and the tab-gated screens are split out with
        // React.lazy (see src/ui/lazyChunk.jsx) so boot only pays for what it paints.
        manualChunks(id) {
          if (id.includes('sets.json')) return 'card-data'
          if (id.includes('node_modules')) return 'vendor'
        },
      },
    },
  },
})
