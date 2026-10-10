import { LEVELS, levelOf, type StockBalance, type StockNote } from '../lib/stock'

/**
 * How full the open one is, as a bar of five steps — 0%, 25%, 50%, 75%,
 * 100%. Tapping a step fills the bar to it in that level's colour (red when
 * finished, through to green); tapping the chosen step again clears it.
 */
export function StockLevelBar({
  label,
  value,
  note,
  onChange,
}: {
  label: string
  value: StockBalance | null
  /** Finished or low, worked out with the unopened count (stockNote). */
  note: StockNote | null
  onChange: (value: StockBalance | null) => void
}) {
  const level = levelOf(value)
  return (
    <div>
      <div
        role="radiogroup"
        aria-label={label}
        className="relative h-14 overflow-hidden rounded-xl border-2 border-slate-200 bg-slate-100"
        // Finished: the whole bar goes pale red, as there is nothing to fill.
        style={level?.pct === 0 ? { backgroundColor: '#fee2e2', borderColor: level.colour } : undefined}
      >
        {level && level.pct > 0 ? (
          <div
            aria-hidden="true"
            className="absolute inset-y-0 left-0 transition-[width,background-color] duration-200"
            style={{ width: `${level.pct}%`, backgroundColor: level.colour }}
          />
        ) : null}
        <div className="relative grid h-full grid-cols-5">
          {LEVELS.map((step) => {
            const on = value === step.value
            return (
              <button
                key={step.value}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => onChange(on ? null : step.value)}
                className={`m-1 rounded-lg text-sm font-black tabular-nums transition ${
                  on ? 'bg-white text-slate-900 shadow-md ring-2 ring-slate-900' : 'text-slate-800 hover:bg-white/50'
                }`}
              >
                {step.label}
              </button>
            )
          })}
        </div>
      </div>
      {note ? (
        <p className="mt-1 text-right text-xs font-black uppercase tracking-wider" style={{ color: note.colour }}>
          {note.text}
        </p>
      ) : null}
    </div>
  )
}
