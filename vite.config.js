import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    // Makes DocuMend installable and lets it open with no connection.
    // The service worker is only built for `npm run build`; the dev server
    // stays as it was. Test it with `npm run build` then `npm run preview`.
    VitePWA({
      // The app shows its own "new version" prompt (src/components/PwaStatus.jsx),
      // so nothing reloads under someone who is in the middle of writing.
      registerType: 'prompt',
      injectRegister: false,
      manifest: {
        name: 'DocuMend',
        short_name: 'DocuMend',
        description: 'A privacy-first document editor that finds contradictions and gaps on your own device.',
        start_url: '/dashboard',
        scope: '/',
        display: 'standalone',
        background_color: '#f3eee3',
        theme_color: '#172d26',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          { src: '/icons/icon.svg', sizes: 'any', type: 'image/svg+xml' },
        ],
      },
      workbox: {
        // Everything the app is made of, including the Rust engine (.wasm),
        // is stored on first visit, so the editor and its checks work offline.
        globPatterns: ['**/*.{js,css,html,svg,png,wasm,webmanifest,woff2}'],
        // Default is 2 MiB. The spell-check word list (engine/src/wordlist.txt,
        // ~370k words so ordinary words like "comma" aren't flagged as typos)
        // pushes both the worker bundle and the .wasm past that on its own —
        // raised with room to spare rather than to the exact current size.
        maximumFileSizeToCacheInBytes: 8 * 1024 * 1024,
        // Any page address (/editor, /documents…) is the same single-page app.
        navigateFallback: '/index.html',
        cleanupOutdatedCaches: true,
        runtimeCaching: [
          {
            // The fonts come from Google. Kept after the first load, so the
            // type does not change when the connection goes.
            urlPattern: ({ url }) => url.origin === 'https://fonts.googleapis.com' || url.origin === 'https://fonts.gstatic.com',
            handler: 'CacheFirst',
            options: {
              cacheName: 'documend-fonts',
              expiration: { maxEntries: 30, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
  ],
})
