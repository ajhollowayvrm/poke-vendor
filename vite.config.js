import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  // relative base so it works on any host path (pages.dev, GitHub Pages subpaths, etc.)
  base: './',
  plugins: [
    react(),
    VitePWA({
      // 'prompt', not 'autoUpdate'. autoUpdate silently swaps the CACHE but leaves the
      // running page on its old JavaScript — and an installed PWA resumes rather than
      // reloads, so a phone can sit on a build for days without knowing. src/game/appUpdate.js
      // registers the worker itself, polls for new builds, and offers the reload.
      registerType: 'prompt',
      // We do the registering (appUpdate.js). Without this the plugin ALSO injects its own
      // bare registerSW.js, which registers the worker and never tells anyone it updated —
      // the exact bug this replaces.
      injectRegister: null,
      includeAssets: ['icon.svg', 'apple-touch-icon.png'],
      // precache the built app + the card images? No — card art is remote (CDN).
      // We precache the app shell + data so it loads instantly and works offline.
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,json}'],
        maximumFileSizeToCacheInBytes: 6 * 1024 * 1024, // sets.json is ~3MB
        // remote card images: cache-on-use so a revisited card shows offline
        runtimeCaching: [
          {
            // Card art lives on BOTH hosts — pokemontcg.io (older sets) and scrydex.com
            // (the newest sets, ~10% of cards and the ones you rip most). Matching only
            // pokemontcg.io meant the newest sets' art re-downloaded every session and
            // never worked offline. maxEntries bumped to cover the full card pool.
            urlPattern: ({ url }) => url.hostname === 'images.pokemontcg.io' || url.hostname === 'images.scrydex.com',
            handler: 'CacheFirst',
            options: {
              cacheName: 'card-images',
              // 6000 entries was ~470-880MB of CacheStorage at real card-art sizes. Browsers
              // budget storage PER ORIGIN across CacheStorage, IndexedDB and localStorage, so a
              // cache that size doesn't just hoard disk — it squeezes the save and can leave the
              // service worker without room to stage a new build, which is one way an "Update
              // ready" prompt never appears at all. 1000 recent cards is still a deep offline
              // pool (you revisit far fewer than that in a session) for a tenth of the footprint.
              expiration: { maxEntries: 1000, maxAgeSeconds: 60 * 60 * 24 * 14, purgeOnQuotaError: true },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
      manifest: {
        name: 'PokéVendor — Rip · Grade · Sell',
        short_name: 'PokéVendor',
        description: 'A Pokémon card vendor sim: rip packs, price hits, grade gems, work shows, sell for profit.',
        theme_color: '#0c0f1a',
        background_color: '#0c0f1a',
        display: 'standalone',
        orientation: 'portrait',
        icons: [
          { src: 'pwa-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'pwa-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
    }),
  ],
  // Emit imported JSON as JSON.parse("...") instead of a JS object literal —
  // JSON.parse of a big string is ~1.5-2x faster than the engine parsing the
  // equivalent literal, which matters for the ~1MB card-data chunk on phones.
  json: { stringify: true },
  server: { port: 5179, open: true },
  build: {
    rollupOptions: {
      output: {
        // Split the bundle so a PWA update only re-downloads what actually changed:
        // the card database (~biggest, changes on data refreshes) and the framework
        // (rarely changes) get their own precache entries separate from game code.
        manualChunks(id) {
          if (id.includes('sets.json')) return 'card-data'
          if (id.includes('node_modules')) return 'vendor'
        },
      },
    },
  },
})
