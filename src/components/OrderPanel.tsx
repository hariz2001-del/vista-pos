import {
  AlertTriangle,
  BadgePercent,
  CheckCircle2,
  CloudOff,
  LoaderCircle,
  Minus,
  Pencil,
  Plus,
  ReceiptText,
  ShieldCheck,
  Tag,
  Trash2,
  X,
} from 'lucide-react'
import { lineGrossSen } from '../domain/cart'
import { formatRinggit } from '../domain/money'
import type { Brand, CartLine, CartTotals, CompletedSale } from '../domain/types'
import type { AppliedPromotion } from '../domain/promotions'
import type { DiscountTarget } from './DiscountModal'

/**
 * BUILDING  — the ticket is being keyed in and is fully editable.
 * CONFIRMED — the ticket is locked for review: Edit Order, or Mark Paid.
 * PAID      — a short confirmation carrying the queue number.
 *
 * The whole payment flow lives in this panel rather than taking over the screen,
 * so the catalogue stays visible and the terminal never goes dark mid-service.
 */
export type OrderPanelMode = 'BUILDING' | 'CONFIRMED' | 'PAID'

type Props = {
  mode: OrderPanelMode
  cart: CartLine[]
  cartDiscountSen: number
  totals: CartTotals
  brandsById: Map<string, Brand>
  isOnline: boolean
  isOpen: boolean
  isSubmitting: boolean
  /** Once payment has been attempted the ticket cannot be edited — the sale may already exist. */
  hasAttempted: boolean
  error: string | null
  paidSale: CompletedSale | null
  onClose: () => void
  onQuantityChange: (cartLineId: string, quantity: number) => void
  onDiscount: (target: DiscountTarget) => void
  onClear: () => void
  onConfirmOrder: () => void
  onEditOrder: () => void
  onMarkPaid: () => void
  onNextOrder: () => void
  /** Automatic promos on this order, and how much each took off. */
  appliedPromotions?: AppliedPromotion[]
  /** Take an automatic promo off this order only. */
  onRemovePromotion?: (promotionId: string) => void
}

export function OrderPanel({
  mode,
  cart,
  cartDiscountSen,
  totals,
  brandsById,
  isOnline,
  isOpen,
  isSubmitting,
  hasAttempted,
  error,
  paidSale,
  onClose,
  onQuantityChange,
  onDiscount,
  onClear,
  onConfirmOrder,
  onEditOrder,
  onMarkPaid,
  onNextOrder,
  appliedPromotions = [],
  onRemovePromotion,
}: Props) {
  const isEditable = mode === 'BUILDING'
  const wasOffline = paidSale?.syncStatus === 'PENDING'

  return (
    // `lg:relative` rather than `lg:static`: the paid confirmation is absolutely
    // positioned inside this panel, so the panel must be its containing block.
    <aside
      className={`fixed inset-y-0 right-0 z-40 flex w-[min(92vw,26rem)] flex-col bg-white shadow-2xl transition-transform lg:relative lg:z-auto lg:w-auto lg:translate-x-0 lg:shadow-none ${
        isOpen ? 'translate-x-0' : 'translate-x-full'
      }`}
      aria-label="Current order"
    >
      <div className="flex min-h-16 shrink-0 items-center border-b border-slate-200 px-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-slate-400">
            {mode === 'BUILDING' ? 'Current order' : 'Review order'}
          </p>
          <h2 className="text-xl font-black">
            {mode === 'BUILDING' ? 'Order' : 'Receipt'} · {totals.itemCount} item
            {totals.itemCount === 1 ? '' : 's'}
          </h2>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="ml-auto grid size-11 place-items-center rounded-xl bg-slate-100 lg:hidden"
          aria-label="Close order panel"
        >
          <X aria-hidden="true" className="size-5" />
        </button>
      </div>

      {cart.length === 0 ? (
        <div className="grid flex-1 place-items-center p-8 text-center">
          <div>
            <div className="mx-auto grid size-16 place-items-center rounded-full bg-slate-100 text-slate-400">
              <ReceiptText aria-hidden="true" className="size-7" />
            </div>
            <p className="mt-4 font-black">No items yet</p>
            <p className="mt-1 text-sm text-slate-500">Tap an item to start an order.</p>
          </div>
        </div>
      ) : (
        <div className="scrollbar-subtle flex-1 space-y-3 overflow-y-auto p-3">
          {cart.map((line) => {
            const grossSen = lineGrossSen(line)
            const appliedDiscountSen = Math.min(line.discountSen, grossSen)
            return (
              <article
                key={line.cartLineId}
                className={`rounded-2xl border p-3.5 ${
                  isEditable ? 'border-slate-200' : 'border-slate-100 bg-slate-50/60'
                }`}
              >
                <div className="flex items-start gap-3">
                  <span
                    style={{ backgroundColor: brandsById.get(line.brandId)?.colour ?? '#101826' }}
                    className="mt-1 size-2.5 shrink-0 rounded-full"
                    title={line.brandName}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="font-black leading-tight">
                        {isEditable ? null : (
                          <span className="text-slate-500">{line.quantity} × </span>
                        )}
                        {line.productName}
                      </h3>
                      <p className="shrink-0 font-black">
                        {formatRinggit(grossSen - appliedDiscountSen)}
                      </p>
                    </div>
                    {line.modifiers.length > 0 ? (
                      <ul className="mt-2 space-y-1 text-xs text-slate-500">
                        {line.modifiers.map((modifier) => (
                          <li key={`${line.cartLineId}-${modifier.modifierId}`}>
                            {modifier.type === 'REMOVAL' ? '−' : '+'} {modifier.name}
                            {modifier.priceSen > 0 ? ` (${formatRinggit(modifier.priceSen)})` : ''}
                          </li>
                        ))}
                      </ul>
                    ) : null}
                    {appliedDiscountSen > 0 ? (
                      <p className="mt-2 text-xs font-bold text-danger">
                        Discount −{formatRinggit(appliedDiscountSen)}
                      </p>
                    ) : null}
                  </div>
                </div>

                {isEditable ? (
                  <div className="mt-3 flex items-center gap-2">
                    <div className="flex items-center rounded-xl bg-slate-100">
                      <button
                        type="button"
                        onClick={() => onQuantityChange(line.cartLineId, line.quantity - 1)}
                        className="grid size-11 place-items-center rounded-xl hover:bg-slate-200"
                        aria-label={`Reduce ${line.productName}`}
                      >
                        <Minus aria-hidden="true" className="size-4" />
                      </button>
                      <span className="w-8 text-center font-black" aria-label={`Quantity ${line.quantity}`}>
                        {line.quantity}
                      </span>
                      <button
                        type="button"
                        onClick={() => onQuantityChange(line.cartLineId, line.quantity + 1)}
                        className="grid size-11 place-items-center rounded-xl hover:bg-slate-200"
                        aria-label={`Add ${line.productName}`}
                      >
                        <Plus aria-hidden="true" className="size-4" />
                      </button>
                    </div>
                    <button
                      type="button"
                      onClick={() => onDiscount({ kind: 'item', cartLineId: line.cartLineId })}
                      className="ml-auto flex min-h-11 items-center gap-2 rounded-xl border border-slate-200 px-3 text-xs font-black hover:bg-slate-50"
                    >
                      <Tag aria-hidden="true" className="size-4" /> Discount
                    </button>
                  </div>
                ) : null}
              </article>
            )
          })}
        </div>
      )}

      <div className="shrink-0 space-y-3 border-t border-slate-200 bg-white p-4 shadow-[0_-8px_24px_rgba(15,23,42,0.05)]">
        {appliedPromotions.length > 0 ? (
          <ul aria-label="Promotions on this order" className="space-y-1.5">
            {appliedPromotions.map((promotion) => (
              <li
                key={promotion.promotionId}
                className="flex items-center gap-2 rounded-xl bg-emerald-50 px-3 py-1.5 text-sm"
              >
                <BadgePercent aria-hidden="true" className="size-4 shrink-0 text-emerald-700" />
                <span className="min-w-0 flex-1 truncate font-black text-emerald-950">{promotion.name}</span>
                <span className="font-bold text-emerald-800">−{formatRinggit(promotion.amountSen)}</span>
                {isEditable && onRemovePromotion ? (
                  <button
                    type="button"
                    onClick={() => onRemovePromotion(promotion.promotionId)}
                    aria-label={`Remove ${promotion.name} from this order`}
                    className="min-h-9 rounded-lg px-2 text-xs font-black text-emerald-900 underline"
                  >
                    Remove
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        ) : null}
        <div className="space-y-1.5 text-sm">
          <div className="flex justify-between text-slate-500">
            <span>Subtotal</span>
            <span>{formatRinggit(totals.subtotalSen)}</span>
          </div>
          <div className="flex justify-between text-danger">
            <span>Discount</span>
            <span>−{formatRinggit(totals.discountSen)}</span>
          </div>
          <div className="flex items-end justify-between border-t border-dashed border-slate-300 pt-3">
            <span className="font-bold">{mode === 'BUILDING' ? 'Total' : 'Amount due'}</span>
            <span className={mode === 'BUILDING' ? 'text-2xl font-black' : 'text-4xl font-black'}>
              {formatRinggit(totals.netTotalSen)}
            </span>
          </div>
        </div>

        {isEditable ? (
          <button
            type="button"
            disabled={cart.length === 0}
            onClick={() => onDiscount({ kind: 'cart' })}
            className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-300 text-sm font-black hover:border-slate-500 disabled:opacity-40"
          >
            <Tag aria-hidden="true" className="size-4" />
            {cartDiscountSen > 0 ? 'Edit order discount' : 'Add order discount'}
          </button>
        ) : null}

        {!isOnline ? (
          <p
            className="rounded-xl bg-amber-50 p-2.5 text-center text-xs font-bold text-amber-900"
            role="status"
          >
            Offline — this sale is saved on the device and sent when the connection returns.
          </p>
        ) : null}

        {error ? (
          <div
            className="flex gap-2 rounded-xl bg-amber-50 p-3 text-xs font-bold text-amber-900"
            role="alert"
          >
            <AlertTriangle aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
            <span>{error}</span>
          </div>
        ) : null}

        {mode === 'BUILDING' ? (
          <div className="grid grid-cols-[3.25rem_1fr] gap-2">
            <button
              type="button"
              disabled={cart.length === 0}
              onClick={onClear}
              className="grid min-h-14 place-items-center rounded-xl border border-slate-200 text-danger hover:bg-red-50 disabled:opacity-40"
              aria-label="Clear order"
            >
              <Trash2 aria-hidden="true" className="size-5" />
            </button>
            <button
              type="button"
              disabled={cart.length === 0}
              onClick={onConfirmOrder}
              className="min-h-14 rounded-xl bg-ink px-4 text-base font-black text-white shadow-lg hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              Confirm Order
            </button>
          </div>
        ) : null}

        {mode === 'CONFIRMED' ? (
          <div className="space-y-2">
            <button
              type="button"
              disabled={isSubmitting}
              onClick={onMarkPaid}
              className="flex min-h-16 w-full items-center justify-center gap-3 rounded-xl bg-success text-lg font-black text-white shadow-lg hover:bg-green-700 disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              {isSubmitting ? (
                <LoaderCircle aria-hidden="true" className="size-5 animate-spin" />
              ) : (
                <ShieldCheck aria-hidden="true" className="size-5" />
              )}
              {isSubmitting
                ? 'Recording payment…'
                : hasAttempted
                  ? 'Retry Same Order'
                  : 'Mark Paid'}
            </button>

            {hasAttempted ? (
              <p className="text-center text-xs font-semibold text-slate-500">
                Locked after the first attempt. Retrying sends the same order — it will not be
                recorded twice.
              </p>
            ) : (
              <button
                type="button"
                disabled={isSubmitting}
                onClick={onEditOrder}
                className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border border-slate-200 text-sm font-black text-slate-600 hover:bg-slate-50 disabled:opacity-40"
              >
                <Pencil aria-hidden="true" className="size-4" /> Edit Order
              </button>
            )}
          </div>
        ) : null}
      </div>

      {mode === 'PAID' && paidSale ? (
        <div
          className="absolute inset-0 z-10 grid place-items-center bg-white/70 p-6 backdrop-blur-md"
          role="status"
          aria-live="polite"
        >
          <div className="text-center">
            <div
              className={`mx-auto grid size-20 place-items-center rounded-full text-white ${
                wasOffline ? 'bg-warning' : 'bg-success'
              }`}
            >
              {wasOffline ? (
                <CloudOff aria-hidden="true" className="size-10" />
              ) : (
                <CheckCircle2 aria-hidden="true" className="size-10" />
              )}
            </div>

            <p className="mt-4 text-sm font-black uppercase tracking-[0.2em] text-slate-500">
              {wasOffline ? 'Saved on device · not yet sent' : 'Payment received'}
            </p>

            <p className="mt-4 text-xs font-black uppercase tracking-wider text-slate-400">
              {wasOffline ? 'Temporary number' : 'Queue number'}
            </p>
            <p
              className={`text-6xl font-black leading-none tracking-tight ${
                wasOffline ? 'text-warning' : 'text-ink'
              }`}
            >
              {paidSale.queueLabel}
            </p>

            <p className="mt-4 text-lg font-black text-ink">
              {formatRinggit(paidSale.totalSen)} · {paidSale.itemCount} item
              {paidSale.itemCount === 1 ? '' : 's'}
            </p>

            {wasOffline ? (
              <p className="mx-auto mt-3 max-w-xs rounded-xl bg-amber-50 p-2.5 text-xs font-bold text-amber-900">
                Call this number to the kitchen. The official queue number is assigned once the
                connection returns.
              </p>
            ) : null}

            <button
              type="button"
              autoFocus
              onClick={onNextOrder}
              className="mt-6 min-h-14 w-full rounded-2xl bg-ink px-6 text-lg font-black text-white shadow-xl hover:bg-slate-800"
            >
              New Order
            </button>
          </div>
        </div>
      ) : null}
    </aside>
  )
}
