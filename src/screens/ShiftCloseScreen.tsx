import { AlertTriangle, ArrowLeft, CloudOff, Undo2 } from 'lucide-react'
import { useMemo } from 'react'
import { PinPad, type PinVerdict } from '../components/PinPad'
import { formatBusinessDate } from '../domain/business-date'
import { formatRinggit, formatSignedRinggit } from '../domain/money'
import type { CompletedSale, SaleCorrection } from '../domain/types'

type Props = {
  businessDate: string
  sales: CompletedSale[]
  corrections: SaleCorrection[]
  pendingCount: number
  onBack: () => void
  /** Closes the shift on the server; resolves to what the PIN pad should show. */
  verifyPin: (pin: string) => Promise<PinVerdict>
}

/**
 * Close the shift with the PIN and nothing else.
 *
 * The cashier is not asked what the bank received. They cannot see the account,
 * and a figure typed in at the end of a night is a guess that then has to be
 * argued with. The server records its own total; checking it against the bank
 * is the owner's job in the RMS.
 *
 * The one thing that still blocks a close is money that has not reached the
 * server yet — closing over it would leave the shift's record incomplete.
 */
export function ShiftCloseScreen({
  businessDate,
  sales,
  corrections,
  pendingCount,
  onBack,
  verifyPin,
}: Props) {
  const summary = useMemo(() => {
    const salesSen = sales.reduce((sum, sale) => sum + sale.totalSen, 0)
    const correctionSen = corrections.reduce((sum, correction) => sum + correction.deltaSen, 0)
    return {
      salesSen,
      correctionSen,
      // Matches what the server records at close: revenue less refunds.
      takingsSen: salesSen + correctionSen,
      correctionCount: corrections.length,
      orderCount: sales.length,
    }
  }, [sales, corrections])

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
            Enter the PIN to finish. Nothing needs to be counted or typed in.
          </p>

          <div className="mt-5 grid grid-cols-2 gap-3">
            <div className="rounded-2xl bg-white p-4 shadow-sm">
              <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Orders</p>
              <p className="mt-1 text-3xl font-black text-ink">{summary.orderCount}</p>
            </div>
            <div className="rounded-2xl bg-white p-4 shadow-sm">
              <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Takings</p>
              <p className="mt-1 text-3xl font-black text-ink">
                {formatRinggit(summary.takingsSen)}
              </p>
            </div>
          </div>

          {summary.correctionCount > 0 ? (
            <p className="mt-3 flex items-start gap-2 rounded-2xl bg-slate-100 p-3 text-sm font-bold text-slate-600">
              <Undo2 aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
              <span>
                {summary.correctionCount} correction
                {summary.correctionCount === 1 ? '' : 's'} this shift, worth{' '}
                {formatSignedRinggit(summary.correctionSen)} — already counted in the takings.
              </span>
            </p>
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
              confirmLabel="4-digit PIN"
              verify={verifyPin}
            />
          )}
        </section>
      </main>
    </div>
  )
}
