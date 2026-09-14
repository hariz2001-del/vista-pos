import { AlertTriangle, ArrowLeft, CloudOff, Undo2 } from 'lucide-react'
import { useMemo, useState } from 'react'
import { PinPad } from '../components/PinPad'
import { formatBusinessDate } from '../domain/business-date'
import { formatRinggit, formatSignedRinggit, parseRinggitToSen } from '../domain/money'
import type { Cashier, CompletedSale, SaleCorrection } from '../domain/types'

type Props = {
  cashier: Cashier
  businessDate: string
  sales: CompletedSale[]
  corrections: SaleCorrection[]
  pendingCount: number
  onBack: () => void
  onShiftClosed: (declaredSen: number, gapSen: number) => void
}

export function ShiftCloseScreen({
  cashier,
  businessDate,
  sales,
  corrections,
  pendingCount,
  onBack,
  onShiftClosed,
}: Props) {
  const [declaredInput, setDeclaredInput] = useState('')

  const summary = useMemo(() => {
    const salesSen = sales.reduce((sum, sale) => sum + sale.totalSen, 0)

    /*
     * Corrections only count towards the bank's QR figure in one direction.
     *
     * An exchange that collects more money is collected the same way the sale
     * was — the customer scans the counter QR — so it lands in the same incoming
     * total. A refund goes back out by transfer, on a different rail, and never
     * reduces what the QR received. Netting refunds off here would make the bank
     * look short by exactly the refund, every single time.
     */
    let collectedSen = 0
    let refundedSen = 0
    for (const correction of corrections) {
      if (correction.deltaSen > 0) collectedSen += correction.deltaSen
      else refundedSen -= correction.deltaSen
    }

    return {
      salesSen,
      collectedSen,
      refundedSen,
      expectedSen: salesSen + collectedSen,
      correctionCount: corrections.length,
      orderCount: sales.length,
    }
  }, [sales, corrections])

  const declaredSen = parseRinggitToSen(declaredInput)
  const gapSen = declaredSen === null ? null : declaredSen - summary.expectedSen
  const isBlocked = pendingCount > 0

  return (
    <div className="min-h-dvh bg-canvas">
      <header className="flex min-h-16 items-center gap-3 bg-ink px-4 text-white sm:px-6">
        <button
          type="button"
          onClick={onBack}
          className="flex min-h-11 items-center gap-2 rounded-xl px-3 font-black hover:bg-white/10"
        >
          <ArrowLeft aria-hidden="true" className="size-5" /> Back
        </button>
        <p className="ml-auto text-sm font-bold text-slate-300">
          {formatBusinessDate(businessDate)}
        </p>
      </header>

      <main className="mx-auto grid max-w-5xl gap-6 p-5 lg:grid-cols-2">
        <section>
          <h1 className="text-2xl font-black text-ink sm:text-3xl">Close Shift</h1>
          <p className="mt-1 text-sm font-semibold text-slate-500">
            Compare the QR total received by the bank against the sales recorded here.
          </p>

          <div className="mt-5 grid grid-cols-2 gap-3">
            <div className="rounded-2xl bg-white p-4 shadow-sm">
              <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Orders</p>
              <p className="mt-1 text-3xl font-black text-ink">{summary.orderCount}</p>
            </div>
            <div className="rounded-2xl bg-white p-4 shadow-sm">
              <p className="text-xs font-bold uppercase tracking-wider text-slate-400">
                QR received
              </p>
              <p className="mt-1 text-3xl font-black text-ink">
                {formatRinggit(summary.expectedSen)}
              </p>
              {summary.collectedSen > 0 ? (
                <p className="mt-1 text-xs font-bold text-slate-500">
                  includes {formatRinggit(summary.collectedSen)} collected on an exchange
                </p>
              ) : null}
            </div>
          </div>

          {summary.correctionCount > 0 ? (
            <p className="mt-3 flex items-start gap-2 rounded-2xl bg-slate-100 p-3 text-sm font-bold text-slate-600">
              <Undo2 aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
              <span>
                {summary.correctionCount} correction
                {summary.correctionCount === 1 ? '' : 's'} this shift.
                {summary.refundedSen > 0
                  ? ` ${formatRinggit(summary.refundedSen)} was refunded by transfer, so it is not
                      deducted from the QR figure above.`
                  : ''}{' '}
                Nothing is waiting on the owner.
              </span>
            </p>
          ) : null}

          <label className="mt-6 block text-sm font-black text-ink" htmlFor="declared">
            QR total according to the bank
          </label>
          <input
            id="declared"
            inputMode="decimal"
            placeholder="RM 0.00"
            value={declaredInput}
            onChange={(event) => setDeclaredInput(event.target.value)}
            className="mt-2 min-h-16 w-full rounded-2xl border-2 border-slate-200 px-4 text-2xl font-black focus:border-ink"
          />

          {declaredInput !== '' && declaredSen === null ? (
            <p className="mt-2 text-sm font-bold text-danger" role="alert">
              Enter a valid amount, for example 152.40
            </p>
          ) : null}

          {gapSen !== null ? (
            <div
              className={`mt-3 rounded-2xl p-4 ${
                gapSen === 0 ? 'bg-green-50 text-success' : 'bg-amber-50 text-amber-900'
              }`}
            >
              <p className="text-xs font-bold uppercase tracking-wider">Difference</p>
              <p className="mt-1 text-2xl font-black">{formatSignedRinggit(gapSen)}</p>
              <p className="mt-1 text-xs font-semibold">
                {gapSen === 0
                  ? 'Matches exactly.'
                  : 'Recorded as an Unidentified Bucket entry, not discarded.'}
              </p>
            </div>
          ) : null}
        </section>

        <section className="grid place-items-center rounded-3xl bg-white p-6 shadow-sm">
          {isBlocked ? (
            <div className="text-center">
              <div className="mx-auto grid size-16 place-items-center rounded-full bg-red-50 text-danger">
                <CloudOff aria-hidden="true" className="size-8" />
              </div>
              <h2 className="mt-4 text-xl font-black text-ink">Cannot close yet</h2>
              <p className="mt-2 max-w-xs text-sm font-semibold text-slate-600">
                {pendingCount} offline record{pendingCount === 1 ? '' : 's'} still{' '}
                {pendingCount === 1 ? 'has' : 'have'} not reached the server. Reconnect and wait
                for the sync to finish before closing the shift.
              </p>
              <p className="mt-4 flex items-center justify-center gap-2 text-xs font-bold text-amber-900">
                <AlertTriangle aria-hidden="true" className="size-4" />
                Closing now would leave the shift's financial record incomplete.
              </p>
            </div>
          ) : (
            <PinPad
              title="Confirm Close Shift"
              subtitle="Enter the counter PIN"
              expectedPin={cashier.pin}
              confirmLabel="4-digit PIN"
              onSuccess={() => onShiftClosed(declaredSen ?? 0, gapSen ?? 0)}
            />
          )}
        </section>
      </main>
    </div>
  )
}
