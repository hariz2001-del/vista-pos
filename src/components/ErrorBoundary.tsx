import { AlertTriangle } from 'lucide-react'
import { Component, type ErrorInfo, type ReactNode } from 'react'

type Props = {
  children: ReactNode
}

type State = {
  error: Error | null
}

/**
 * The money helpers throw on bad values, and `calculateCartTotals` runs during
 * render — so without this, one malformed amount white-screens the terminal
 * mid-shift with no way back. A cashier cannot open devtools; they need a button.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // Once `api-vista` exists this should also report to the server so the owner
    // learns about terminal crashes without the cashier having to describe them.
    console.error('Vista POS crashed:', error, info.componentStack)
  }

  render(): ReactNode {
    const { error } = this.state
    if (!error) return this.props.children

    return (
      <div className="grid min-h-dvh place-items-center bg-canvas p-6 text-center">
        <div className="w-full max-w-lg rounded-3xl bg-white p-8 shadow-xl">
          <div className="mx-auto grid size-16 place-items-center rounded-full bg-red-50 text-danger">
            <AlertTriangle aria-hidden="true" className="size-8" />
          </div>
          <h1 className="mt-5 text-2xl font-black text-ink">Terminal stopped</h1>
          <p className="mt-2 font-semibold text-slate-600">
            Sales already recorded are safe and stored. Reload to carry on serving.
          </p>
          <p className="mt-4 rounded-xl bg-slate-50 p-3 text-left text-xs font-mono text-slate-500">
            {error.message}
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="mt-6 min-h-14 w-full rounded-2xl bg-ink text-lg font-black text-white hover:bg-slate-800"
          >
            Reload
          </button>
        </div>
      </div>
    )
  }
}
