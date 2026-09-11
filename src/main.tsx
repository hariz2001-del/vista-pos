import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import './index.css'
import App from './App.tsx'
import { ErrorBoundary } from './components/ErrorBoundary'

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

createRoot(rootElement).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
)
