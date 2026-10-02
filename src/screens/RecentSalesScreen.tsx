import { ArrowLeft, CloudOff, Pencil, ReceiptText, RotateCcw, Undo2, X } from 'lucide-react'
import { useState } from 'react'
import { formatBusinessDate } from '../domain/business-date'
import { calculateCartTotals } from '../domain/cart'
import {
  CANCEL_REASONS,
  cartLinesFromRequest,
  outstandingSen,
  requestAfterCorrections,
} from '../domain/corrections'
import { formatRinggit, formatSignedRinggit } from '../domain/money'
import type { Brand, Category, CompletedSale, SaleCorrection } from '../domain/types'

type Props = {
  businessDate: string
  /** Only this shift's sales can be corrected: the server refuses a closed shift's. */
  currentShiftId?: string
  sales: CompletedSale[]
  /** True until the day's receipts have been fetched. */
  isLoading?: boolean
  /** False when the server could not be reached and only this tablet's sales are listed. */
  isComplete?: boolean
  corrections: SaleCorrection[]
  /** For the category tag on each receipt line. */
  brands?: Brand[]
  categories?: Category[]
  /** Why the last cancel or exchange was not recorded, if the server refused it. */
  error?: string | null
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
 * The business day's receipts, from every tablet: the list on the left, the selected receipt in full on
 * the right. On a phone the two take turns.
 *
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
  currentShiftId,
  sales,
  isLoading = false,
  isComplete = true,
  corrections,
  brands = [],
  categories = [],
  error = null,
  onBack,
  onCancelSale,
  onEditSale,
}: Props) {
  const [cancelling, setCancelling] = useState<CompletedSale | null>(null)
  // Null on a phone means "show the list"; wider screens fall back to the newest.
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const correctionsFor = (sale: CompletedSale) =>
    corrections.filter((correction) => correction.originalClientTxnId === sale.clientTxnId)

  const selected =
    sales.find((sale) => sale.clientTxnId === selectedId) ?? (selectedId ? null : sales[0]) ?? null

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-canvas text-ink">
      <header className="flex min-h-16 shrink-0 items-center gap-3 bg-ink px-4 text-white sm:px-6">
        <ReceiptText aria-hidden="true" className="size-5 shrink-0" />
        <div className="min-w-0">
          <h1 className="text-lg font-black leading-tight">Receipts</h1>
          <p className="text-xs font-bold text-slate-300">
            Today · {formatBusinessDate(businessDate)}
          </p>
        </div>
        <button
          type="button"
          onClick={onBack}
          className="ml-auto grid size-11 place-items-center rounded-xl bg-white/10 hover:bg-white/20"
          aria-label="Close receipts"
          title="Back to the till"
        >
          <X aria-hidden="true" className="size-6" />
        </button>
      </header>

      {error ? (
        <p className="shrink-0 bg-red-50 p-3 text-center text-sm font-bold text-danger" role="alert">
          {error}
        </p>
      ) : null}

      {isComplete ? null : (
        <p className="shrink-0 bg-amber-50 p-3 text-center text-sm font-bold text-amber-900" role="status">
          <CloudOff aria-hidden="true" className="mr-1.5 inline size-4 align-[-3px]" />
          Offline — showing only the sales rung up on this tablet.
        </p>
      )}

      {sales.length === 0 ? (
        <div className="grid flex-1 place-items-center p-8 text-center">
          <div>
            <ReceiptText aria-hidden="true" className="mx-auto size-10 text-slate-300" />
            <p className="mt-3 font-black">{isLoading ? 'Loading receipts…' : 'No sales yet today'}</p>
          </div>
        </div>
      ) : (
        <div className="grid min-h-0 flex-1 grid-rows-[minmax(0,1fr)] md:grid-cols-[minmax(17rem,22rem)_minmax(0,1fr)]">
          <ul
            aria-label="Receipts today"
            className={`scrollbar-subtle min-h-0 overflow-y-auto border-r border-slate-200 bg-white ${
              selectedId ? 'hidden md:block' : ''
            }`}
          >
            {sales.map((sale) => {
              const saleCorrections = correctionsFor(sale)
              const isCancelled = saleCorrections.some((correction) => correction.kind === 'CANCEL')
              const netSen =
                sale.totalSen +
                saleCorrections.reduce((sum, correction) => sum + correction.deltaSen, 0)
              const isSelected = selected?.clientTxnId === sale.clientTxnId

              return (
                <li key={sale.clientTxnId}>
                  <button
                    type="button"
                    onClick={() => setSelectedId(sale.clientTxnId)}
                    aria-current={isSelected ? 'true' : undefined}
                    className={`flex min-h-16 w-full items-center gap-3 border-b border-slate-100 px-4 py-3 text-left hover:bg-slate-50 ${
                      isSelected ? 'md:bg-slate-100 md:shadow-[inset_4px_0_0_#101826]' : ''
                    }`}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-2">
                        <span
                          className={`text-lg font-black ${isCancelled ? 'text-slate-400 line-through' : ''}`}
                        >
                          {sale.queueLabel}
                        </span>
                        {sale.syncStatus === 'PENDING' ? (
                          <CloudOff aria-label="Not sent" className="size-4 text-amber-600" />
                        ) : null}
                        {isCancelled ? (
                          <span className="rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-black text-danger">
                            Cancelled
                          </span>
                        ) : saleCorrections.length > 0 ? (
                          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-black text-slate-600">
                            Edited
                          </span>
                        ) : null}
                      </span>
                      <span className="block text-xs font-semibold text-slate-500">
                        {timeOf(sale.completedAt)} · {sale.itemCount} item
                        {sale.itemCount === 1 ? '' : 's'}
                      </span>
                    </span>
                    <span
                      className={`shrink-0 font-black tabular-nums ${isCancelled ? 'text-slate-400 line-through' : ''}`}
                    >
                      {formatRinggit(isCancelled ? sale.totalSen : netSen)}
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>

          <section
            aria-label="Receipt"
            className={`scrollbar-subtle min-h-0 overflow-y-auto ${selectedId ? '' : 'hidden md:block'}`}
          >
            {selected ? (
              <ReceiptDetail
                sale={selected}
                corrections={correctionsFor(selected)}
                canCorrect={!currentShiftId || selected.request.shift_id === currentShiftId}
                brands={brands}
                categories={categories}
                onBackToList={() => setSelectedId(null)}
                onCancel={() => setCancelling(selected)}
                onEdit={() => onEditSale(selected)}
              />
            ) : null}
          </section>
        </div>
      )}

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

function ReceiptDetail({
  sale,
  corrections,
  canCorrect,
  brands,
  categories,
  onBackToList,
  onCancel,
  onEdit,
}: {
  sale: CompletedSale
  corrections: SaleCorrection[]
  canCorrect: boolean
  brands: Brand[]
  categories: Category[]
  onBackToList: () => void
  onCancel: () => void
  onEdit: () => void
}) {
  const isCancelled = corrections.some((correction) => correction.kind === 'CANCEL')
  const wasEdited = corrections.some((correction) => correction.kind === 'EXCHANGE')
  // The ticket as it stands now: the last exchange's snapshot, else the original.
  const request = requestAfterCorrections(sale.request, corrections)
  const lines = cartLinesFromRequest(request, [], [])
  const totals = calculateCartTotals(lines, request.cart_discount_sen)
  const netSen =
    sale.totalSen + corrections.reduce((sum, correction) => sum + correction.deltaSen, 0)

  return (
    <div className="mx-auto max-w-xl p-4 sm:p-6">
      <button
        type="button"
        onClick={onBackToList}
        className="mb-3 flex min-h-11 items-center gap-2 rounded-xl px-2 text-sm font-black text-slate-600 hover:bg-white md:hidden"
      >
        <ArrowLeft aria-hidden="true" className="size-5" /> All receipts
      </button>

      <article className="rounded-3xl bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-start gap-3 border-b border-dashed border-slate-300 pb-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Queue number</p>
            <p
              className={`text-4xl font-black leading-none ${isCancelled ? 'text-slate-400 line-through' : ''}`}
            >
              {sale.queueLabel}
            </p>
            <p className="mt-2 text-xs font-semibold text-slate-500">
              {timeOf(sale.completedAt)} · QR · manually confirmed
            </p>
          </div>
          <div className="ml-auto flex flex-wrap justify-end gap-1.5">
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
          </div>
        </div>

        {wasEdited ? (
          <p className="mt-4 text-xs font-bold uppercase tracking-wider text-slate-400">
            Items after edit
          </p>
        ) : null}
        <ul className={`${wasEdited ? 'mt-2' : 'mt-4'} space-y-3`}>
          {request.cart_items.map((item, index) => {
            const grossSen = (item.unit_price_sen + item.modifier_total_sen) * item.quantity
            const discountSen = Math.min(item.discount_sen, grossSen)
            return (
              <li key={`${item.product_id}-${index}`} className="text-sm">
                <div className="flex items-start gap-3">
                  <span className="w-8 shrink-0 font-black text-slate-500">{item.quantity}×</span>
                  <span className="min-w-0 flex-1">
                    <span className="font-black">{item.product_name}</span>
                    <CategoryTag
                      category={categories.find((category) => category.id === item.category_id)}
                      brand={brands.find((brand) => brand.id === item.brand_id)}
                    />
                  </span>
                  <span className="shrink-0 font-black tabular-nums">{formatRinggit(grossSen)}</span>
                </div>
                {item.modifiers.length > 0 ? (
                  <ul className="ml-11 mt-0.5 space-y-0.5 text-xs text-slate-500">
                    {item.modifiers.map((modifier, modifierIndex) => (
                      <li key={`${modifier.modifier_id}-${modifierIndex}`}>
                        {modifier.name}
                        {modifier.price_sen > 0 ? ` (${formatRinggit(modifier.price_sen)})` : ''}
                      </li>
                    ))}
                  </ul>
                ) : null}
                {discountSen > 0 ? (
                  <div className="ml-11 mt-0.5 flex justify-between text-xs font-bold text-danger">
                    <span>Discount</span>
                    <span className="tabular-nums">−{formatRinggit(discountSen)}</span>
                  </div>
                ) : null}
              </li>
            )
          })}
        </ul>

        <div className="mt-4 space-y-1.5 border-t border-dashed border-slate-300 pt-4 text-sm">
          <div className="flex justify-between text-slate-500">
            <span>Subtotal</span>
            <span className="tabular-nums">{formatRinggit(totals.subtotalSen)}</span>
          </div>
          {totals.discountSen > 0 ? (
            <div className="flex justify-between text-danger">
              <span>Discount</span>
              <span className="tabular-nums">−{formatRinggit(totals.discountSen)}</span>
            </div>
          ) : null}
          <div className="flex items-end justify-between pt-1">
            <span className="font-bold">Paid</span>
            <span
              className={`text-2xl font-black tabular-nums ${corrections.length > 0 ? 'text-slate-400 line-through' : ''}`}
            >
              {formatRinggit(sale.totalSen)}
            </span>
          </div>
          {corrections.length > 0 ? (
            <div className="flex items-end justify-between">
              <span className="font-bold">Now</span>
              <span className="text-2xl font-black tabular-nums">{formatRinggit(netSen)}</span>
            </div>
          ) : null}
        </div>

        {corrections.length > 0 ? (
          <div className="mt-4 space-y-2">
            {corrections.map((correction) => (
              <p
                key={correction.clientTxnId}
                className="flex flex-wrap items-center gap-2 rounded-xl bg-slate-50 p-2.5 text-xs font-bold text-slate-600"
              >
                {correction.kind === 'CANCEL' ? (
                  <Undo2 aria-hidden="true" className="size-3.5 shrink-0" />
                ) : (
                  <RotateCcw aria-hidden="true" className="size-3.5 shrink-0" />
                )}
                <span>{correction.kind === 'CANCEL' ? 'Cancelled' : 'Edited'}</span>
                <span className="text-slate-400">·</span>
                <span className="font-semibold">{correction.reason}</span>
                <span className="text-slate-400">· {timeOf(correction.createdAt)}</span>
                <span className="ml-auto tabular-nums text-ink">
                  {formatSignedRinggit(correction.deltaSen)}
                </span>
              </p>
            ))}
          </div>
        ) : null}
      </article>

      {isCancelled ? null : !canCorrect ? (
        <p className="mt-4 rounded-xl bg-white p-3 text-center text-xs font-bold text-slate-500">
          From an earlier shift — view only. A closed shift's sales can no longer be cancelled or
          edited.
        </p>
      ) : (
        <div className="mt-4 grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="flex min-h-12 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-sm font-black text-slate-600 hover:border-danger hover:text-danger"
          >
            <Undo2 aria-hidden="true" className="size-4" /> Cancel sale
          </button>
          <button
            type="button"
            onClick={onEdit}
            className="flex min-h-12 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-sm font-black text-slate-600 hover:border-ink hover:text-ink"
          >
            <Pencil aria-hidden="true" className="size-4" /> Edit / exchange
          </button>
        </div>
      )}
    </div>
  )
}

/**
 * Which category a receipt line came from — drinks against food, say — at a
 * glance. Tinted with the brand's colours, as the product tiles are. A category
 * deleted since the sale has no name to show, so the tag is left off.
 */
function CategoryTag({ category, brand }: { category?: Category; brand?: Brand }) {
  if (!category) return null
  return (
    <span
      // Brand colours are data, so they cannot be Tailwind utility classes.
      style={{
        backgroundColor: brand?.softColour ?? '#eef1f0',
        color: brand?.colour ?? '#101826',
      }}
      className="ml-2 inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 align-middle text-[11px] font-black"
    >
      <span
        aria-hidden="true"
        style={{ backgroundColor: brand?.colour ?? '#101826' }}
        className="size-1.5 rounded-full"
      />
      {category.name}
    </span>
  )
}
