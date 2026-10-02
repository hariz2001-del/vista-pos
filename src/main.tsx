import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import './index.css'
import { ErrorBoundary } from './components/ErrorBoundary'
import { IS_DEMO } from './lib/api'
import { ensureFreshDemo, scheduleDemoReset } from './lib/demo'

/**
 * Paired with `registerType: 'prompt'` in vite.config.ts. A newly deployed
 * service worker stays in the waiting state instead of taking over immediately,
 * so a deploy cannot swap the app out from under a cashier holding a half-built
 * cart or sales still queued in IndexedDB. It activates on the next deliberate
 * reload — which, for a terminal, is between shifts.
 *
 * A waiting worker only takes over once every window running the old one has
 * closed, which a tablet left on all day, or the Android app sitting in the
 * background, never does — so a deploy could sit unused for days. The update is
 * therefore applied as the app starts, before the cashier has touched anything:
 * nothing is in a cart yet, and queued sales live in IndexedDB, which a reload
 * keeps. Found later, mid-shift, it waits for the next start instead.
 */
let hasInteracted = false
for (const event of ['pointerdown', 'keydown'] as const) {
  window.addEventListener(event, () => (hasInteracted = true), { once: true, capture: true })
}
const updateSW = registerSW({
  immediate: true,
  onNeedRefresh() {
    if (!hasInteracted) void updateSW(true)
  },
})

const rootElement = document.getElementById('root')
if (!rootElement) {
  throw new Error('Cannot start Vista POS: #root is missing from index.html')
}

async function start(root: HTMLElement) {
  if (IS_DEMO) {
    // Before App is imported: it reads the remembered shift as it loads.
    await ensureFreshDemo()
    scheduleDemoReset()
  }
  const { default: App } = await import('./App.tsx')
  createRoot(root).render(
    <StrictMode>
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </StrictMode>,
  )
}

void start(rootElement)
