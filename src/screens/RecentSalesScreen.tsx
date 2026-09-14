import { ArrowLeft, CloudOff, Pencil, ReceiptText, RotateCcw, Undo2 } from 'lucide-react'
import { useState } from 'react'
import { formatBusinessDate } from '../domain/business-date'
import { CANCEL_REASONS, outstandingSen } from '../domain/corrections'
import { formatRinggit, formatSignedRinggit } from '../domain/money'
import type { CompletedSale, SaleCorrection } from '../domain/types'

type Props = {
  businessDate: string
  sales: CompletedSale[]
  corrections: SaleCorrection[]
  onBack: () => void
  onCancelSale: (sale: CompletedSale, reason: string) => void
  onEditSale: (sale: CompletedSale) => void
}

function timeOf(iso: string): string {
  return new Intl.DateTimeFormat('en-MY', {
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    timeZone: 'Asia/Kuala_Lumpur',
  }).format(new Date(iso))
}

/**
 * A paid sale is a historical fact: it is never edited and never deleted.
 *
 * What the cashier can do is **correct** it, in front of the customer, without
 * anyone's approval — cancel it outright, or amend what was sold. Either writes a
 * contra-entry that sits beside the original. The owner sees the result as a
 * refund line in the cash book with the reason on it; nothing waits in a queue.
 *
 * The trade being made: this is the most abusable action in the till and there is
 * no prompt anywhere pointing at it. The ledger line is the whole control, which
 * works only if someone reads the ledger. That is deliberate — interrupting a
 * rush to ask permission is worse.
 */
export function RecentSalesScreen({
  businessDate,
  sales,
  corrections,
  onBack,
  onCancelSale,
  onEditSale,
}: Props) {
  const [cancelling, setCancelling] = useState<CompletedSale | null>(null)

  const correctionsFor = (sale: CompletedSale) =>
    corrections.filter((correction) => correction.originalClientTxnId === sale.clientTxnId)

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

      <main className="mx-auto max-w-3xl p-5">
        <h1 className="text-2xl font-black text-ink sm:text-3xl">This Shift's Sales</h1>
        <p className="mt-1 text-sm font-semibold text-slate-500">
          Fix a mistake here and now. A correction is recorded next to the original sale — the
          sale itself is never changed.
        </p>

        {sales.length === 0 ? (
          <div className="mt-10 grid place-items-center rounded-3xl bg-white p-12 text-center shadow-sm">
            <ReceiptText aria-hidden="true" className="size-10 text-slate-300" />
            <p className="mt-3 font-black text-ink">No sales yet</p>
          </div>
        ) : (
          <ul className="mt-5 space-y-3">
            {sales.map((sale) => {
              const saleCorrections = correctionsFor(sale)
              const isCancelled = saleCorrections.some(
                (correction) => correction.kind === 'CANCEL',
              )
              const netSen =
                sale.totalSen +
                saleCorrections.reduce((sum, correction) => sum + correction.deltaSen, 0)

              return (
                <li key={sale.clientTxnId} className="rounded-2xl bg-white p-4 shadow-sm">
                  <div className="flex flex-wrap items-center gap-3">
                    <span
                      className={`text-xl font-black ${isCancelled ? 'text-slate-400 line-through' : 'text-ink'}`}
                    >
                      {sale.queueLabel}
                    </span>

                    {sale.syncStatus === 'PENDING' ? (
                      <span className="flex items-center gap-1.5 rounded-full bg-amber-100 px-2.5 py-1 text-xs font-black text-amber-900">
                        <CloudOff aria-hidden="true" className="size-3.5" /> Not sent
                      </span>
                    ) : null}

                    {sale.offlineLabel && sale.syncStatus === 'SYNCED' ? (
                      <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-600">
                        was {sale.offlineLabel}
                      </span>
                    ) : null}

                    {isCancelled ? (
                      <span className="rounded-full bg-red-100 px-2.5 py-1 text-xs font-black text-danger">
                        Cancelled
                      </span>
                    ) : null}

                    <span className="ml-auto text-right">
                      <span
                        className={`block text-lg font-black ${
                          saleCorrections.length > 0 ? 'text-slate-400 line-through' : 'text-ink'
                        }`}
                      >
                        {formatRinggit(sale.totalSen)}
                      </span>
                      {saleCorrections.length > 0 ? (
                        <span className="block text-sm font-black text-ink">
                          now {formatRinggit(netSen)}
                        </span>
                      ) : null}
                    </span>
                  </div>

                  <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs font-semibold text-slate-500">
                    <span>{timeOf(sale.completedAt)}</span>
                    <span>
                      {sale.itemCount} item{sale.itemCount === 1 ? '' : 's'}
                    </span>
                    <span>QR · manually confirmed</span>
                  </div>

                  {saleCorrections.map((correction) => (
                    <p
                      key={correction.clientTxnId}
                      className="mt-2 flex flex-wrap items-center gap-2 rounded-xl bg-slate-50 p-2.5 text-xs font-bold text-slate-600"
                    >
                      {correction.kind === 'CANCEL' ? (
                        <Undo2 aria-hidden="true" className="size-3.5 shrink-0" />
                      ) : (
                        <RotateCcw aria-hidden="true" className="size-3.5 shrink-0" />
                      )}
                      <span>{correction.kind === 'CANCEL' ? 'Cancelled' : 'Edited'}</span>
                      <span className="text-slate-400">·</span>
                      <span className="font-semibold">{correction.reason}</span>
                      <span className="ml-auto tabular text-ink">
                        {formatSignedRinggit(correction.deltaSen)}
                      </span>
                    </p>
                  ))}

                  {isCancelled ? null : (
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => setCancelling(sale)}
                        className="flex min-h-11 items-center gap-2 rounded-xl border border-slate-200 px-3 text-xs font-black text-slate-600 hover:border-danger hover:text-danger"
                      >
                        <Undo2 aria-hidden="true" className="size-4" /> Cancel sale
                      </button>
                      <button
                        type="button"
                        onClick={() => onEditSale(sale)}
                        className="flex min-h-11 items-center gap-2 rounded-xl border border-slate-200 px-3 text-xs font-black text-slate-600 hover:border-ink hover:text-ink"
                      >
                        <Pencil aria-hidden="true" className="size-4" /> Edit / exchange
                      </button>
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </main>

      {cancelling ? (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-ink/50 p-5 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="cancel-title"
        >
          <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl">
            <h2 id="cancel-title" className="text-xl font-black text-ink">
              Cancel {cancelling.queueLabel}?
            </h2>
            <p className="mt-1 text-sm font-semibold text-slate-500">
              Refunds {formatRinggit(outstandingSen(cancelling.request, correctionsFor(cancelling)))}{' '}
              — what the customer is still out of pocket for, after any earlier correction. The
              sale stays on record with this reason beside it. Pick one and it is done; nobody has
              to approve it.
            </p>

            <div className="mt-5 space-y-2">
              {CANCEL_REASONS.map((reason) => (
                <button
                  key={reason}
                  type="button"
                  onClick={() => {
                    onCancelSale(cancelling, reason)
                    setCancelling(null)
                  }}
                  className="min-h-14 w-full rounded-2xl border-2 border-slate-200 px-4 text-left font-black text-ink hover:border-danger hover:text-danger"
                >
                  {reason}
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={() => setCancelling(null)}
              className="mt-4 min-h-12 w-full rounded-xl text-sm font-black text-slate-500 hover:bg-slate-100"
            >
              Keep the sale
            </button>
          </div>
        </div>
      ) : null}
    </div>
  )
}
