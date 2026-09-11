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
      includeAssets: ['favicon.svg', 'qr-placeholder.svg'],
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
        icons: [
          {
            src: '/pwa-icon.svg',
            sizes: 'any',
            type: 'image/svg+xml',
            purpose: 'any maskable',
          },
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
