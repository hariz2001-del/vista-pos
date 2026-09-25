import { useState } from 'react'
import { Tag, X } from 'lucide-react'
import { maxDiscountForLine } from '../domain/cart'
import { formatRinggit, parseRinggitToSen } from '../domain/money'
import { describePromotion, promotionAmountSen, type Promotion } from '../domain/promotions'
import type { CartLine } from '../domain/types'

export type DiscountTarget = { kind: 'cart' } | { kind: 'item'; cartLineId: string }

type Props = {
  target: DiscountTarget
  cart: CartLine[]
  cartGrossSen: number
  currentCartDiscountSen: number
  /** Promos running on the shift's trading day. One tap applies one. */
  promotions?: Promotion[]
  onClose: () => void
  onApply: (valueSen: number) => void
}

const QUICK_AMOUNTS = [100, 200, 500]

function senToInput(sen: number): string {
  return `${Math.trunc(sen / 100)}.${(sen % 100).toString().padStart(2, '0')}`
}

export function DiscountModal({
  target,
  cart,
  cartGrossSen,
  currentCartDiscountSen,
  promotions = [],
  onClose,
  onApply,
}: Props) {
  const line =
    target.kind === 'item' ? cart.find((item) => item.cartLineId === target.cartLineId) : null
  const maximumSen = line ? maxDiscountForLine(line) : cartGrossSen
  const currentSen = line
    ? Math.min(line.discountSen, maximumSen)
    : Math.min(currentCartDiscountSen, maximumSen)
  const [value, setValue] = useState(currentSen > 0 ? senToInput(currentSen) : '')
  const parsedSen = parseRinggitToSen(value)
  const isValid = parsedSen !== null && parsedSen <= maximumSen

  return (
    <div
      className="fixed inset-0 z-[60] grid place-items-center bg-ink/40 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="discount-title"
    >
      <div className="w-full max-w-md rounded-3xl bg-white p-5 shadow-2xl">
        <div className="flex items-start gap-3">
          <div className="grid size-11 place-items-center rounded-xl bg-red-50 text-danger">
            <Tag aria-hidden="true" className="size-5" />
          </div>
          <div>
            <h2 id="discount-title" className="text-xl font-black">
              {target.kind === 'cart' ? 'Order discount' : 'Item discount'}
            </h2>
            <p className="text-sm text-slate-500">Maximum {formatRinggit(maximumSen)}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="ml-auto grid size-11 place-items-center rounded-xl bg-slate-100"
            aria-label="Close discount"
          >
            <X aria-hidden="true" className="size-5" />
          </button>
        </div>

        {promotions.length > 0 ? (
          <div className="mt-5">
            <p className="text-sm font-black">Promotions today</p>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              {promotions.map((promotion) => {
                const amountSen = promotionAmountSen(promotion, maximumSen)
                return (
                  <button
                    key={promotion.id}
                    type="button"
                    disabled={amountSen <= 0}
                    onClick={() => onApply(amountSen)}
                    className="flex min-h-14 flex-col items-start justify-center rounded-xl border-2 border-emerald-200 bg-emerald-50 px-3 text-left hover:bg-emerald-100 disabled:opacity-50"
                  >
                    <span className="text-sm font-black text-emerald-950">{promotion.name}</span>
                    <span className="text-xs font-bold text-emerald-800">
                      {describePromotion(promotion)} · −{formatRinggit(amountSen)}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>
        ) : null}

        <label className="mt-5 block text-sm font-black" htmlFor="discount-value">
          Discount amount (RM)
        </label>
        <div className="mt-2 flex items-center rounded-2xl border-2 border-slate-300 bg-white px-4 focus-within:border-ink">
          <span className="font-black text-slate-500">RM</span>
          <input
            id="discount-value"
            inputMode="decimal"
            autoFocus
            value={value}
            onChange={(event) => setValue(event.target.value)}
            placeholder="0.00"
            className="min-h-16 min-w-0 flex-1 bg-transparent px-3 text-2xl font-black outline-none"
          />
        </div>
        {parsedSen !== null && parsedSen > maximumSen ? (
          <p className="mt-2 text-sm font-bold text-danger" role="alert">
            A discount cannot exceed the item total.
          </p>
        ) : null}

        <div className="mt-4 grid grid-cols-4 gap-2">
          {QUICK_AMOUNTS.map((sen) => (
            <button
              key={sen}
              type="button"
              onClick={() => setValue(senToInput(sen))}
              className="min-h-12 rounded-xl bg-slate-100 text-sm font-black hover:bg-slate-200"
            >
              −{formatRinggit(sen)}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setValue(senToInput(maximumSen))}
            className="min-h-12 rounded-xl bg-red-50 text-sm font-black text-danger hover:bg-red-100"
          >
            Free
          </button>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => onApply(0)}
            className="min-h-14 rounded-xl border border-slate-300 font-black"
          >
            Remove
          </button>
          <button
            type="button"
            disabled={!isValid}
            onClick={() => parsedSen !== null && onApply(parsedSen)}
            className="min-h-14 rounded-xl bg-ink font-black text-white disabled:bg-slate-300"
          >
            Apply
          </button>
        </div>
      </div>
    </div>
  )
}
