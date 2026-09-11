import { ArrowLeft, CloudOff, Flag, ReceiptText } from 'lucide-react'
import { useState } from 'react'
import { formatBusinessDate } from '../domain/business-date'
import { formatRinggit } from '../domain/money'
import type { CompletedSale } from '../domain/types'

const FLAG_REASONS = [
  'Wrong item recorded',
  'Customer cancelled after paying',
  'Payment never reached the bank',
  'Discount applied by mistake',
]

type Props = {
  businessDate: string
  sales: CompletedSale[]
  onBack: () => void
  onFlag: (sale: CompletedSale, reason: string) => void
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
 * A paid sale is immutable — the cashier cannot void it. What they can do is
 * raise a flag so the owner sees it in the RMS and issues the correction there.
 * That keeps the till honest without leaving the counter stuck when something
 * goes wrong.
 */
export function RecentSalesScreen({ businessDate, sales, onBack, onFlag }: Props) {
  const [flagging, setFlagging] = useState<CompletedSale | null>(null)

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
          Paid sales cannot be voided at the counter. Flag one and the owner will correct it in the
          RMS.
        </p>

        {sales.length === 0 ? (
          <div className="mt-10 grid place-items-center rounded-3xl bg-white p-12 text-center shadow-sm">
            <ReceiptText aria-hidden="true" className="size-10 text-slate-300" />
            <p className="mt-3 font-black text-ink">No sales yet</p>
          </div>
        ) : (
          <ul className="mt-5 space-y-3">
            {sales.map((sale) => (
              <li key={sale.clientTxnId} className="rounded-2xl bg-white p-4 shadow-sm">
                <div className="flex flex-wrap items-center gap-3">
                  <span className="text-xl font-black text-ink">{sale.queueLabel}</span>

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

                  {sale.flaggedForOwner ? (
                    <span className="flex items-center gap-1.5 rounded-full bg-red-100 px-2.5 py-1 text-xs font-black text-danger">
                      <Flag aria-hidden="true" className="size-3.5" /> Flagged
                    </span>
                  ) : null}

                  <span className="ml-auto text-lg font-black text-ink">
                    {formatRinggit(sale.totalSen)}
                  </span>
                </div>

                <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs font-semibold text-slate-500">
                  <span>{timeOf(sale.completedAt)}</span>
                  <span>
                    {sale.itemCount} item{sale.itemCount === 1 ? '' : 's'}
                  </span>
                  <span>QR · manually confirmed</span>
                </div>

                {sale.flagReason ? (
                  <p className="mt-2 rounded-xl bg-red-50 p-2.5 text-xs font-bold text-danger">
                    {sale.flagReason}
                  </p>
                ) : (
                  <button
                    type="button"
                    onClick={() => setFlagging(sale)}
                    className="mt-3 flex min-h-11 items-center gap-2 rounded-xl border border-slate-200 px-3 text-xs font-black text-slate-600 hover:border-danger hover:text-danger"
                  >
                    <Flag aria-hidden="true" className="size-4" /> Flag for owner
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </main>

      {flagging ? (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-ink/50 p-5 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="flag-title"
        >
          <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl">
            <h2 id="flag-title" className="text-xl font-black text-ink">
              Flag {flagging.queueLabel}
            </h2>
            <p className="mt-1 text-sm font-semibold text-slate-500">
              The sale stays on record. The owner makes the correction in the RMS.
            </p>

            <div className="mt-5 space-y-2">
              {FLAG_REASONS.map((reason) => (
                <button
                  key={reason}
                  type="button"
                  onClick={() => {
                    onFlag(flagging, reason)
                    setFlagging(null)
                  }}
                  className="min-h-14 w-full rounded-2xl border-2 border-slate-200 px-4 text-left font-black text-ink hover:border-ink"
                >
                  {reason}
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={() => setFlagging(null)}
              className="mt-4 min-h-12 w-full rounded-xl text-sm font-black text-slate-500 hover:bg-slate-100"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : null}
    </div>
  )
}
