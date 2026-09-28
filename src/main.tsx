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
 */
registerSW({ immediate: false })

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
