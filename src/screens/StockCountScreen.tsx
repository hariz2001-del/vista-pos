import { ArrowLeft, CheckCircle2, ClipboardList, RefreshCw, WifiOff } from 'lucide-react'
import { useEffect, useMemo, useState, type KeyboardEvent, type ReactNode } from 'react'
import { formatBusinessDate } from '../domain/business-date'
import { StockLevelBar } from '../components/StockLevelBar'
import {
  EMPTY_ENTRY,
  fetchStockSheet,
  impliedBalance,
  stockNote,
  groupStock,
  isFilled,
  loadDraft,
  parseCountMilli,
  saveDraft,
  submitStockCount,
  type StockDraft,
  type StockEntry,
  type StockItem,
  type StockSheet,
} from '../lib/stock'

type Props = {
  isOnline: boolean
  isDemo: boolean
  onBack: () => void
}

/** The typed counts as numbers: blank or not a number reads as unknown. */
function milliOf(entry: StockEntry): { unopenedMilli: number | null; openedMilli: number | null } {
  const read = (value: string) => {
    const milli = parseCountMilli(value)
    return typeof milli === 'number' ? milli : null
  }
  return { unopenedMilli: read(entry.unopened), openedMilli: read(entry.opened) }
}

/** Where the bar would be, for an item without one: just its note, if any. */
function BarlessNote({ note }: { note: ReturnType<typeof stockNote> }) {
  if (!note) return <span className="hidden md:block" />
  return (
    <p className="col-span-2 text-right text-xs font-black uppercase tracking-wider md:col-span-1" style={{ color: note.colour }}>
      {note.text}
    </p>
  )
}

/** Enter in a box jumps to the next box, so a whole count is typed without reaching for the screen. */
function focusNext(event: KeyboardEvent<HTMLInputElement>) {
  if (event.key !== 'Enter') return
  event.preventDefault()
  const boxes = [...document.querySelectorAll<HTMLInputElement>('[data-stock-box]')]
  const next = boxes[boxes.indexOf(event.currentTarget) + 1]
  if (next) next.focus()
  else event.currentTarget.blur()
}

function CountBox({
  label,
  value,
  onChange,
}: {
  label: string
  value: string
  onChange: (value: string) => void
}) {
  const invalid = parseCountMilli(value) === 'invalid'
  return (
    <input
      data-stock-box
      aria-label={label}
      inputMode="decimal"
      enterKeyHint="next"
      autoComplete="off"
      value={value}
      placeholder="–"
      onChange={(event) => onChange(event.target.value.replace(',', '.'))}
      onFocus={(event) => event.currentTarget.select()}
      onKeyDown={focusNext}
      className={`h-14 w-full min-w-0 rounded-xl border-2 bg-white text-center text-2xl font-black tabular-nums text-ink outline-none placeholder:text-slate-300 focus:border-ink ${
        invalid ? 'border-danger' : 'border-slate-200'
      }`}
    />
  )
}

function Message({
  header,
  title,
  body,
  action,
}: {
  header: ReactNode
  title: string
  body: string
  action?: ReactNode
}) {
  return (
    <div className="flex h-dvh flex-col bg-canvas">
      {header}
      <main className="grid flex-1 place-items-center p-6 text-center">
        <div className="max-w-sm">
          <h2 className="text-2xl font-black text-ink">{title}</h2>
          <p className="mt-2 font-semibold text-slate-600">{body}</p>
          {action}
        </div>
      </main>
    </div>
  )
}

/**
 * The closing stock count. One screen, one pass: type the figures, tap the
 * balances, say who counted, send. No pop-ups per item — speed at the end of a
 * long shift matters more than anything else here.
 */
export function StockCountScreen({ isOnline, isDemo, onBack }: Props) {
  const [sheet, setSheet] = useState<StockSheet | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [draft, setDraft] = useState<StockDraft | null>(null)
  const [showAllStaff, setShowAllStaff] = useState(false)
  const [sending, setSending] = useState(false)
  const [sendError, setSendError] = useState<string | null>(null)
  const [sent, setSent] = useState(false)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    if (isDemo) return
    let cancelled = false
    fetchStockSheet()
      .then((loaded) => {
        if (cancelled) return
        setSheet(loaded)
        setLoadError(null)
        setDraft((current) => {
          if (current) return current
          const saved = loadDraft(loaded.businessDate)
          if (saved) return saved
          // Whoever is on shift right now is the likely counter.
          const onNow = loaded.staff.find((member) => member.onNow)
          return { businessDate: loaded.businessDate, entries: {}, staffId: onNow?.id ?? null, staffName: '', remarks: '' }
        })
      })
      .catch((error: unknown) => {
        if (!cancelled) setLoadError(error instanceof Error ? error.message : 'Could not load the stock list.')
      })
    return () => {
      cancelled = true
    }
  }, [isDemo, attempt])

  // Every keystroke is kept on the tablet until the count is sent.
  useEffect(() => {
    if (draft && !sent) saveDraft(draft)
  }, [draft, sent])

  const groups = useMemo(() => groupStock(sheet?.items ?? []), [sheet])
  const brandOf = (id: string) => sheet?.brands.find((brand) => brand.id === id)
  const entries = draft?.entries ?? {}
  const filled = (sheet?.items ?? []).filter((item) => isFilled(entries[item.id])).length
  const total = sheet?.items.length ?? 0
  const hasInvalid = Object.values(entries).some(
    (entry) => parseCountMilli(entry.unopened) === 'invalid' || parseCountMilli(entry.opened) === 'invalid',
  )
  const whoCounted = Boolean(draft?.staffId || draft?.staffName.trim())
  const canSend = Boolean(sheet && draft) && whoCounted && !hasInvalid && !sending && isOnline

  function update(itemId: string, patch: Partial<StockEntry>) {
    const item = sheet?.items.find((candidate) => candidate.id === itemId)
    setDraft((current) => {
      if (!current) return current
      const next = { ...(current.entries[itemId] ?? EMPTY_ENTRY), ...patch }
      // Typing the counts can settle the bar: nothing unopened, nothing opened → 0%.
      if (item && !('balance' in patch)) next.balance = impliedBalance({ ...item, ...milliOf(next), balance: next.balance })
      return { ...current, entries: { ...current.entries, [itemId]: next } }
    })
  }

  async function send() {
    if (!sheet || !draft || !canSend) return
    if (filled < total && !window.confirm(`${total - filled} of ${total} items are blank. Send the count anyway?`)) return
    setSending(true)
    setSendError(null)
    try {
      await submitStockCount({
        staffId: draft.staffId,
        staffName: draft.staffId ? null : draft.staffName.trim() || null,
        remarks: draft.remarks.trim() || null,
        lines: sheet.items.map((item) => {
          const entry = draft.entries[item.id] ?? EMPTY_ENTRY
          const unopened = parseCountMilli(entry.unopened)
          const opened = parseCountMilli(entry.opened)
          return {
            stockItemId: item.id,
            unopenedMilli: typeof unopened === 'number' ? unopened : null,
            openedMilli: typeof opened === 'number' ? opened : null,
            balance: entry.balance,
          }
        }),
      })
      saveDraft(null)
      setSent(true)
    } catch (error) {
      setSendError(error instanceof Error ? error.message : 'The count did not send. Try again.')
    } finally {
      setSending(false)
    }
  }

  const header = (
    <header className="flex min-h-16 shrink-0 items-center gap-3 bg-ink px-4 text-white sm:px-6">
      <button
        type="button"
        onClick={onBack}
        className="flex min-h-11 items-center gap-2 rounded-xl px-3 font-black hover:bg-white/10"
      >
        <ArrowLeft aria-hidden="true" className="size-5" /> Back
      </button>
      <h1 className="flex items-center gap-2 text-lg font-black">
        <ClipboardList aria-hidden="true" className="size-5" /> Closing stock
      </h1>
      {sheet ? (
        <p className="ml-auto text-right text-sm font-bold text-slate-300">
          {sheet.branchName}
          <span className="block text-xs">{formatBusinessDate(sheet.businessDate)}</span>
        </p>
      ) : null}
    </header>
  )

  if (isDemo) {
    return (
      <Message
        header={header}
        title="Stock count needs a live account"
        body="In a real business the owner sets up the closing stock list in the RMS, and it appears here."
      />
    )
  }

  if (sent) {
    return (
      <Message
        header={header}
        title="Stock count sent"
        body="The owner can read it in the RMS under Stock."
        action={
          <>
            <CheckCircle2 aria-hidden="true" className="mx-auto mt-4 size-14 text-green-600" />
            <button
              type="button"
              onClick={onBack}
              className="mt-6 min-h-14 w-full rounded-2xl bg-ink px-6 text-lg font-black text-white"
            >
              Back to the till
            </button>
          </>
        }
      />
    )
  }

  if (!sheet || !draft) {
    return (
      <Message
        header={header}
        title={loadError ? 'Could not load the stock list' : 'Loading the stock list…'}
        body={
          loadError
            ? isOnline
              ? loadError
              : 'The stock count needs a connection. Anything already typed is kept on this tablet.'
            : ''
        }
        action={
          loadError ? (
            <button
              type="button"
              onClick={() => setAttempt((value) => value + 1)}
              className="mx-auto mt-6 flex min-h-12 items-center gap-2 rounded-2xl bg-ink px-6 font-black text-white"
            >
              <RefreshCw aria-hidden="true" className="size-5" /> Try again
            </button>
          ) : null
        }
      />
    )
  }

  if (sheet.items.length === 0) {
    return (
      <Message
        header={header}
        title="No stock list yet"
        body="The owner sets up what gets counted in the RMS, under Stock → Stock list."
      />
    )
  }

  const rostered = sheet.staff.filter((member) => member.rostered || member.id === draft.staffId)
  const listed = showAllStaff || rostered.length === 0 ? sheet.staff : rostered

  return (
    <div className="flex h-dvh flex-col bg-canvas">
      {header}

      <main className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-5xl space-y-5 p-4 sm:p-5">
          <section aria-label="Who counted" className="rounded-2xl bg-white p-4 shadow-sm">
            <p className="text-xs font-black uppercase tracking-wider text-slate-500">Counted by</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {listed.map((member) => (
                <button
                  key={member.id}
                  type="button"
                  aria-pressed={draft.staffId === member.id}
                  onClick={() => setDraft({ ...draft, staffId: member.id, staffName: '' })}
                  className={`min-h-12 rounded-xl border-2 px-4 text-base font-black ${
                    draft.staffId === member.id
                      ? 'border-ink bg-ink text-white'
                      : 'border-slate-200 bg-white text-ink hover:border-slate-400'
                  }`}
                >
                  {member.name}
                  {member.onNow ? <span className="ml-1 text-xs font-bold opacity-70">· on now</span> : null}
                </button>
              ))}
              {!showAllStaff && sheet.staff.length > listed.length ? (
                <button
                  type="button"
                  onClick={() => setShowAllStaff(true)}
                  className="min-h-12 rounded-xl border-2 border-dashed border-slate-300 px-4 font-bold text-slate-600"
                >
                  Someone else…
                </button>
              ) : null}
              <input
                aria-label="Name, if not listed"
                value={draft.staffName}
                onChange={(event) => setDraft({ ...draft, staffName: event.target.value, staffId: null })}
                placeholder={sheet.staff.length > 0 ? 'Not listed? Type a name' : 'Your name'}
                maxLength={60}
                className="min-h-12 min-w-48 flex-1 rounded-xl border-2 border-slate-200 px-3 font-bold outline-none focus:border-ink"
              />
            </div>
          </section>

          {groups.map((brand) => {
            const info = brandOf(brand.brandId)
            return (
              <section key={brand.brandId} className="space-y-3">
                <h2 className="flex items-center gap-2 text-xl font-black text-ink">
                  <span aria-hidden="true" className="size-3 rounded-full" style={{ backgroundColor: info?.colour }} />
                  {info?.name ?? '—'}
                </h2>
                {brand.categories.map((category) => (
                  <div key={category.category} className="overflow-hidden rounded-2xl bg-white shadow-sm">
                    <p className="bg-slate-100 px-4 py-2 text-sm font-black uppercase tracking-wider text-slate-600">
                      {category.category}
                    </p>
                    {category.subcategories.map((group) => (
                      <div key={group.subcategory ?? '—'}>
                        {group.subcategory ? (
                          <p className="px-4 pt-3 text-xs font-black uppercase tracking-wider text-slate-400">
                            {group.subcategory}
                          </p>
                        ) : null}
                        <ul className="divide-y divide-slate-100">
                          {group.items.map((item) => (
                            <StockRow
                              key={item.id}
                              item={item}
                              entry={entries[item.id] ?? EMPTY_ENTRY}
                              onChange={(patch) => update(item.id, patch)}
                            />
                          ))}
                        </ul>
                      </div>
                    ))}
                  </div>
                ))}
              </section>
            )
          })}

          <section className="rounded-2xl bg-white p-4 shadow-sm">
            <label className="block">
              <span className="text-xs font-black uppercase tracking-wider text-slate-500">
                Reminder for tomorrow / restock / remarks
              </span>
              <textarea
                value={draft.remarks}
                onChange={(event) => setDraft({ ...draft, remarks: event.target.value })}
                rows={3}
                maxLength={1000}
                placeholder="Running low on oat milk; order cups"
                className="mt-2 w-full rounded-xl border-2 border-slate-200 p-3 text-base font-semibold outline-none focus:border-ink"
              />
            </label>
          </section>
        </div>
      </main>

      <footer className="shrink-0 border-t border-slate-200 bg-white px-4 py-3 sm:px-6">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-3">
          <p className="text-sm font-black text-slate-600">
            {filled}/{total} filled
            {!whoCounted ? <span className="block text-danger">Pick who counted</span> : null}
            {hasInvalid ? <span className="block text-danger">Fix the boxes in red</span> : null}
            {!isOnline ? (
              <span className="flex items-center gap-1 text-danger">
                <WifiOff aria-hidden="true" className="size-4" /> Offline — kept on this tablet
              </span>
            ) : null}
            {sendError ? <span className="block text-danger">{sendError}</span> : null}
          </p>
          <button
            type="button"
            onClick={() => void send()}
            disabled={!canSend}
            className="ml-auto min-h-14 rounded-2xl bg-ink px-8 text-lg font-black text-white disabled:bg-slate-300"
          >
            {sending ? 'Sending…' : 'Submit count'}
          </button>
        </div>
      </footer>
    </div>
  )
}

function StockRow({
  item,
  entry,
  onChange,
}: {
  item: StockItem
  entry: StockEntry
  onChange: (patch: Partial<StockEntry>) => void
}) {
  const done = isFilled(entry)
  return (
    <li className="grid grid-cols-2 items-center gap-2 px-4 py-3 md:grid-cols-[minmax(0,1fr)_6.5rem_6.5rem_15rem]">
      <div className="col-span-2 min-w-0 md:col-span-1">
        <p className={`text-lg font-black leading-tight ${done ? 'text-ink' : 'text-slate-700'}`}>
          {done ? <span className="mr-1 text-green-600">✓</span> : null}
          {item.name}
        </p>
        {item.unitLabel ? <p className="text-sm font-semibold text-slate-500">in {item.unitLabel}</p> : null}
      </div>

      {item.trackUnopened ? (
        <label className="block">
          <span className="block text-center text-[0.65rem] font-black uppercase tracking-wider text-slate-400">
            Unopened
          </span>
          <CountBox label={`${item.name} unopened`} value={entry.unopened} onChange={(unopened) => onChange({ unopened })} />
        </label>
      ) : (
        <span className="hidden md:block" />
      )}

      {item.trackOpened ? (
        <label className="block">
          <span className="block text-center text-[0.65rem] font-black uppercase tracking-wider text-slate-400">
            Opened
          </span>
          <CountBox label={`${item.name} opened`} value={entry.opened} onChange={(opened) => onChange({ opened })} />
        </label>
      ) : (
        <span className="hidden md:block" />
      )}

      {item.trackBalance ? (
        <div className="col-span-2 md:col-span-1">
          <span className="block text-center text-[0.65rem] font-black uppercase tracking-wider text-slate-400">
            Balance
          </span>
          <StockLevelBar
            label={`${item.name} balance`}
            value={entry.balance}
            note={stockNote({ ...item, ...milliOf(entry), balance: entry.balance })}
            onChange={(balance) => onChange({ balance })}
          />
        </div>
      ) : (
        <BarlessNote note={stockNote({ ...item, ...milliOf(entry), balance: null })} />
      )}
    </li>
  )
}
