import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      // Not 'autoUpdate': a mid-shift takeover can discard a live cart and the
      // IndexedDB queue of unsynced sales. The update waits for a real reload.
      registerType: 'prompt',
      includeAssets: ['favicon-64.png', 'apple-touch-icon.png', 'qr-placeholder.svg', 'pwa-icon-192.png', 'pwa-icon-512.png', 'pwa-maskable-512.png'],
      manifest: {
        name: 'Vista Cashier POS',
        short_name: 'Vista POS',
        description: 'Cashless point of sale for the Vista shared F&B counter.',
        theme_color: '#101826',
        background_color: '#f4f1ea',
        display: 'standalone',
        orientation: 'landscape',
        start_url: '/',
        scope: '/',
        // The PNGs are not decoration: Android's TWA wrapper (and the Play
        // Store) refuse an icon set that is SVG-only, so the installable
        // build needs a real 512px raster. The SVG stays for browsers that
        // prefer it.
        icons: [
          { src: '/pwa-icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/pwa-icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          // Smaller cat inside the launcher's safe circle, so Android's mask never clips the ears.
          { src: '/pwa-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      devOptions: { enabled: true },
    }),
  ],
  test: {
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
  },
})
