import { Delete, LoaderCircle } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

const PIN_LENGTH = 4
const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9']

/**
 * What a PIN check came back with. `message` is for anything other than a wrong
 * PIN — no connection, a shift already open — so the pad says what happened.
 */
export type PinVerdict = { ok: true } | { ok: false; message?: string }

type Props = {
  title: string
  subtitle?: string
  confirmLabel: string
  isBusy?: boolean
  /**
   * Checks the PIN on the server, so the PIN never has to be on the device.
   * Takes precedence over `expectedPin`.
   */
  verify?: (pin: string) => Promise<PinVerdict>
  /** Local comparison. Demo mode and tests only. */
  expectedPin?: string
  onSuccess?: () => void
  onCancel?: () => void
}

/** Four-digit PIN gate for opening and closing a shift. Nothing else is gated by a PIN. */
export function PinPad({
  title,
  subtitle,
  confirmLabel,
  isBusy = false,
  verify,
  expectedPin,
  onSuccess,
  onCancel,
}: Props) {
  const [digits, setDigits] = useState('')
  const [isWrong, setIsWrong] = useState(false)
  const [isChecking, setIsChecking] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  // Mirrors `digits` so that two taps landing in the same tick both count. Reading
  // the state variable would give the second tap a stale value and drop the digit.
  // It also blocks taps while a check is in flight: four digits are held until
  // the verdict arrives.
  const digitsRef = useRef('')

  function setPin(value: string) {
    digitsRef.current = value
    setDigits(value)
  }

  // Clearing the failed state is a timer, so it belongs in an effect. Deciding
  // whether the PIN was right does not — that is the keypress itself.
  useEffect(() => {
    if (!isWrong) return
    const timer = window.setTimeout(() => {
      setIsWrong(false)
      setPin('')
    }, 700)
    return () => window.clearTimeout(timer)
  }, [isWrong])

  const busy = isBusy || isChecking

  function reject(reason: string | null) {
    setMessage(reason)
    setIsWrong(true)
  }

  function press(key: string) {
    if (isWrong || busy || digitsRef.current.length >= PIN_LENGTH) return
    if (message) setMessage(null)

    const next = digitsRef.current + key
    setPin(next)
    if (next.length < PIN_LENGTH) return

    if (verify) {
      setIsChecking(true)
      void verify(next)
        .catch((): PinVerdict => ({ ok: false, message: 'Something went wrong. Try again.' }))
        .then((verdict) => {
          setIsChecking(false)
          if (verdict.ok) {
            setPin('')
            onSuccess?.()
            return
          }
          reject(verdict.message ?? null)
        })
      return
    }

    if (next === expectedPin) {
      setPin('')
      onSuccess?.()
      return
    }

    reject(null)
  }

  return (
    <div className="w-full max-w-sm text-center">
      <h2 className="text-2xl font-black text-ink sm:text-3xl">{title}</h2>
      {subtitle ? <p className="mt-2 text-sm font-semibold text-slate-500">{subtitle}</p> : null}

      <div
        className={`mt-7 flex justify-center gap-4 ${isWrong ? 'animate-pulse' : ''}`}
        role="status"
        aria-label={`${digits.length} of ${PIN_LENGTH} digits entered`}
      >
        {Array.from({ length: PIN_LENGTH }, (_, index) => (
          <span
            key={index}
            className={`size-4 rounded-full transition ${
              isWrong
                ? 'bg-danger'
                : index < digits.length
                  ? 'bg-ink'
                  : 'border-2 border-slate-300 bg-transparent'
            }`}
          />
        ))}
      </div>

      <p className="mt-3 min-h-6 text-sm font-bold text-danger" role="alert">
        {message ?? (isWrong ? 'Wrong PIN. Try again.' : '')}
      </p>

      <div className="mt-4 grid grid-cols-3 gap-3">
        {KEYS.map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => press(key)}
            disabled={busy}
            className="min-h-16 rounded-2xl bg-white text-2xl font-black text-ink shadow-sm ring-1 ring-slate-200 transition hover:bg-slate-50 active:scale-95 disabled:opacity-40"
          >
            {key}
          </button>
        ))}

        {onCancel ? (
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="min-h-16 rounded-2xl text-sm font-black text-slate-500 transition hover:bg-slate-100 disabled:opacity-40"
          >
            Cancel
          </button>
        ) : (
          <span />
        )}

        <button
          type="button"
          onClick={() => press('0')}
          disabled={busy}
          className="min-h-16 rounded-2xl bg-white text-2xl font-black text-ink shadow-sm ring-1 ring-slate-200 transition hover:bg-slate-50 active:scale-95 disabled:opacity-40"
        >
          0
        </button>

        <button
          type="button"
          onClick={() => setPin(digitsRef.current.slice(0, -1))}
          disabled={busy}
          className="grid min-h-16 place-items-center rounded-2xl text-slate-500 transition hover:bg-slate-100 disabled:opacity-40"
          aria-label="Delete one digit"
        >
          <Delete aria-hidden="true" className="size-6" />
        </button>
      </div>

      <p className="mt-5 flex min-h-6 items-center justify-center gap-2 text-sm font-bold text-slate-500">
        {busy ? (
          <>
            <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />
            {isChecking ? 'Checking…' : 'Processing…'}
          </>
        ) : (
          confirmLabel
        )}
      </p>
    </div>
  )
}
