import { LoaderCircle, LogIn } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { FAKE_LOGIN } from '../data/fake-account'

type Props = {
  outletName: string
  businessName: string
  onSignedIn: () => void
}

/**
 * One account signs in to both the POS and the future Owner RMS. Per-cashier
 * accountability comes from the PIN at shift boundaries, not a second login.
 */
export function SignInScreen({ outletName, businessName, onSignedIn }: Props) {
  const [email, setEmail] = useState(FAKE_LOGIN.email)
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isBusy, setIsBusy] = useState(false)

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setError(null)

    if (email.trim() !== FAKE_LOGIN.email || password !== FAKE_LOGIN.password) {
      setError('Incorrect email or password.')
      return
    }

    setIsBusy(true)
    window.setTimeout(onSignedIn, 350)
  }

  return (
    <div className="grid min-h-dvh place-items-center bg-ink p-5 text-white">
      <div className="w-full max-w-md">
        <div className="flex items-center gap-3">
          <div className="grid size-12 place-items-center rounded-2xl bg-white text-2xl font-black text-ink">
            V
          </div>
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.24em] text-slate-400">
              {businessName}
            </p>
            <p className="text-lg font-black">{outletName}</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="mt-7 rounded-3xl bg-white p-6 text-ink shadow-2xl">
          <h1 className="text-2xl font-black">Counter Sign In</h1>
          <p className="mt-1 text-sm font-semibold text-slate-500">
            The same account is used for the owner dashboard.
          </p>

          <label className="mt-6 block text-sm font-black" htmlFor="signin-email">
            Email
          </label>
          <input
            id="signin-email"
            type="email"
            autoComplete="username"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="mt-2 min-h-14 w-full rounded-2xl border-2 border-slate-200 px-4 text-base font-semibold focus:border-ink"
          />

          <label className="mt-4 block text-sm font-black" htmlFor="signin-password">
            Password
          </label>
          <input
            id="signin-password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="mt-2 min-h-14 w-full rounded-2xl border-2 border-slate-200 px-4 text-base font-semibold focus:border-ink"
          />

          <p className="mt-3 min-h-6 text-sm font-bold text-danger" role="alert">
            {error ?? ''}
          </p>

          <button
            type="submit"
            disabled={isBusy}
            className="flex min-h-16 w-full items-center justify-center gap-3 rounded-2xl bg-ink text-lg font-black text-white shadow-lg hover:bg-slate-800 disabled:opacity-60"
          >
            {isBusy ? (
              <LoaderCircle aria-hidden="true" className="size-5 animate-spin" />
            ) : (
              <LogIn aria-hidden="true" className="size-5" />
            )}
            Sign In
          </button>

          <p className="mt-5 rounded-xl bg-amber-50 p-3 text-center text-xs font-bold text-amber-900">
            Demo — password <span className="font-mono">{FAKE_LOGIN.password}</span>, counter PIN{' '}
            <span className="font-mono">1234</span>
          </p>
        </form>
      </div>
    </div>
  )
}
