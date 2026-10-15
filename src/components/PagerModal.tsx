import { useEffect, useRef, useState } from 'react'
import { Delete, Radio, X } from 'lucide-react'

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'clear', '0', 'back'] as const
type Key = typeof KEYS[number]

export function PagerModal({ currentNumber, onClose, onApply }: {
  currentNumber: string
  onClose: () => void
  onApply: (value: string) => void
}) {
  const [draft, setDraft] = useState({ value: currentNumber, prefilled: currentNumber !== '' })
  const dialogRef = useRef<HTMLDivElement>(null)
  useEffect(() => dialogRef.current?.focus(), [])
  const valid = /^[0-9]{1,4}$/.test(draft.value)

  function press(key: Key) {
    setDraft((current) => {
      if (key === 'clear') return { value: '', prefilled: false }
      if (key === 'back') return { value: current.value.slice(0, -1), prefilled: false }
      const value = current.prefilled ? '' : current.value
      return { value: (value + key).slice(0, 4), prefilled: false }
    })
  }

  return (
    <div
      className="fixed inset-0 z-[60] grid place-items-center overflow-y-auto bg-ink/40 p-3 outline-none backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="pager-title"
      ref={dialogRef}
      tabIndex={-1}
      onKeyDown={(event) => {
        // Let focused buttons handle Enter themselves, avoiding accidental Apply.
        if (/^[0-9]$/.test(event.key)) { event.preventDefault(); press(event.key as Key) }
        else if (event.key === 'Backspace') { event.preventDefault(); press('back') }
        else if (event.key === 'Enter' && event.target === event.currentTarget && valid) onApply(draft.value)
        else if (event.key === 'Escape') onClose()
      }}
    >
      <div className="w-full max-w-md rounded-3xl bg-white p-4 shadow-2xl sm:p-5">
        <div className="flex items-start gap-3">
          <div className="grid size-11 place-items-center rounded-xl bg-slate-100 text-ink">
            <Radio aria-hidden="true" className="size-5" />
          </div>
          <div>
            <h2 id="pager-title" className="text-xl font-black">Pager number</h2>
            <p className="text-sm text-slate-500">Enter the pager handed to this customer.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close pager keypad"
            className="ml-auto grid size-11 place-items-center rounded-xl bg-slate-100">
            <X aria-hidden="true" className="size-5" />
          </button>
        </div>
        <div role="status" aria-label="Entered pager number"
          className="mt-4 flex min-h-16 items-center justify-end rounded-2xl border-2 border-ink px-4 text-3xl font-black tabular-nums">
          <span className={draft.value === '' ? 'text-slate-300' : draft.prefilled ? 'text-slate-500' : 'text-ink'}>
            {draft.value || '—'}
          </span>
        </div>
        <p className="mt-2 text-xs text-slate-500">1–4 digits</p>
        <div className="mt-3 grid grid-cols-3 gap-2">
          {KEYS.map((key) => (
            <button key={key} type="button" onClick={() => press(key)}
              aria-label={key === 'back' ? 'Delete' : key === 'clear' ? 'Clear' : key}
              className="grid min-h-12 place-items-center rounded-xl border border-slate-200 text-xl font-black hover:bg-slate-50 active:bg-slate-100">
              {key === 'back' ? <Delete aria-hidden="true" className="size-5" /> : key === 'clear' ? 'Clear' : key}
            </button>
          ))}
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3">
          <button type="button" onClick={onClose} className="min-h-14 rounded-xl border border-slate-300 font-black">Cancel</button>
          <button type="button" disabled={!valid} onClick={() => { if (valid) onApply(draft.value) }}
            className="min-h-14 rounded-xl bg-ink font-black text-white disabled:bg-slate-300">Apply</button>
        </div>
      </div>
    </div>
  )
}
