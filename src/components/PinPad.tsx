import { Delete, LoaderCircle } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

const PIN_LENGTH = 4
const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9']

type Props = {
  title: string
  subtitle?: string
  expectedPin: string
  confirmLabel: string
  isBusy?: boolean
  onSuccess: () => void
  onCancel?: () => void
}

/**
 * Four-digit PIN gate for opening and closing a shift. Nothing else is gated by
 * a PIN. Verification is local because there is no server yet; the real build
 * must verify server-side so a PIN never has to be shipped to the device.
 */
export function PinPad({
  title,
  subtitle,
  expectedPin,
  confirmLabel,
  isBusy = false,
  onSuccess,
  onCancel,
}: Props) {
  const [digits, setDigits] = useState('')
  const [isWrong, setIsWrong] = useState(false)

  // Mirrors `digits` so that two taps landing in the same tick both count. Reading
  // the state variable would give the second tap a stale value and drop the digit.
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

  function press(key: string) {
    if (isWrong || isBusy || digitsRef.current.length >= PIN_LENGTH) return

    const next = digitsRef.current + key
    setPin(next)
    if (next.length < PIN_LENGTH) return

    if (next === expectedPin) {
      setPin('')
      onSuccess()
      return
    }

    setIsWrong(true)
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
        {isWrong ? 'Wrong PIN. Try again.' : ''}
      </p>

      <div className="mt-4 grid grid-cols-3 gap-3">
        {KEYS.map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => press(key)}
            disabled={isBusy}
            className="min-h-16 rounded-2xl bg-white text-2xl font-black text-ink shadow-sm ring-1 ring-slate-200 transition hover:bg-slate-50 active:scale-95 disabled:opacity-40"
          >
            {key}
          </button>
        ))}

        {onCancel ? (
          <button
            type="button"
            onClick={onCancel}
            disabled={isBusy}
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
          disabled={isBusy}
          className="min-h-16 rounded-2xl bg-white text-2xl font-black text-ink shadow-sm ring-1 ring-slate-200 transition hover:bg-slate-50 active:scale-95 disabled:opacity-40"
        >
          0
        </button>

        <button
          type="button"
          onClick={() => setPin(digitsRef.current.slice(0, -1))}
          disabled={isBusy}
          className="grid min-h-16 place-items-center rounded-2xl text-slate-500 transition hover:bg-slate-100 disabled:opacity-40"
          aria-label="Delete one digit"
        >
          <Delete aria-hidden="true" className="size-6" />
        </button>
      </div>

      <p className="mt-5 flex min-h-6 items-center justify-center gap-2 text-sm font-bold text-slate-500">
        {isBusy ? (
          <>
            <LoaderCircle aria-hidden="true" className="size-4 animate-spin" /> Processing…
          </>
        ) : (
          confirmLabel
        )}
      </p>
    </div>
  )
}
