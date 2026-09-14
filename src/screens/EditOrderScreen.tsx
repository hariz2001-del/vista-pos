import { ArrowLeft, Minus, Plus, QrCode, Tag, Trash2, Undo2 } from 'lucide-react'
import { useMemo, useState } from 'react'
import { DiscountModal, type DiscountTarget } from '../components/DiscountModal'
import { FilterBar } from '../components/FilterBar'
import { ModifierModal } from '../components/ModifierModal'
import { ProductGrid } from '../components/ProductGrid'
import { formatBusinessDate } from '../domain/business-date'
import { calculateCartTotals } from '../domain/cart'
import {
  EXCHANGE_REASONS,
  planExchange,
  requestNetSen,
  type ExchangePlan,
} from '../domain/corrections'
import { formatRinggit, formatSignedRinggit } from '../domain/money'
import type {
  Brand,
  CartLine,
  Category,
  CompletedSale,
  FinalizeCheckoutRequest,
  Product,
  SnapshottedModifier,
} from '../domain/types'

type Props = {
  sale: CompletedSale
  baselineRequest: FinalizeCheckoutRequest
  initialCart: CartLine[]
  initialCartDiscountSen: number
  brands: Brand[]
  categories: Category[]
  products: Product[]
  onBack: () => void
  onCommit: (plan: ExchangePlan, reason: string) => void
}

/**
 * Amend a paid sale.
 *
 * One screen for all three things that actually go wrong after payment: the wrong
 * item went in, the options were wrong, or a discount was missed. Each is the same
 * operation underneath — the ticket is rebuilt and the **difference** is what moves.
 *
 * The original sale is not touched. What this produces is a contra-entry carrying
 * the difference and its brand attribution, apportioned by the same rule the sale
 * used, so a correction on a mixed-brand ticket lands on the brand that actually
 * gave the value back.
 */
export function EditOrderScreen({
  sale,
  baselineRequest,
  initialCart,
  initialCartDiscountSen,
  brands,
  categories,
  products,
  onBack,
  onCommit,
}: Props) {
  const [cart, setCart] = useState<CartLine[]>(initialCart)
  const [cartDiscountSen, setCartDiscountSen] = useState(initialCartDiscountSen)
  const [reason, setReason] = useState<string>(EXCHANGE_REASONS[0])

  const [brandId, setBrandId] = useState<string | null>(null)
  const [categoryId, setCategoryId] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null)
  const [discountTarget, setDiscountTarget] = useState<DiscountTarget | null>(null)

  const brandsById = useMemo(() => new Map(brands.map((brand) => [brand.id, brand])), [brands])
  const categoriesById = useMemo(
    () => new Map(categories.map((category) => [category.id, category])),
    [categories],
  )

  const visibleCategories = useMemo(
    () =>
      brandId === null ? categories : categories.filter((category) => category.brandId === brandId),
    [categories, brandId],
  )

  const visibleProducts = useMemo(() => {
    const needle = search.trim().toLowerCase()
    return products.filter((product) => {
      if (brandId !== null && product.brandId !== brandId) return false
      if (categoryId !== null && product.categoryId !== categoryId) return false
      if (needle && !product.name.toLowerCase().includes(needle)) return false
      return true
    })
  }, [products, brandId, categoryId, search])

  const totals = calculateCartTotals(cart, cartDiscountSen)

  const plan = useMemo(
    () =>
      planExchange(
        baselineRequest,
        cart,
        cartDiscountSen,
        (id) => brandsById.get(id)?.name ?? '—',
      ),
    [baselineRequest, cart, cartDiscountSen, brandsById],
  )

  const hasChanged = plan.ticketChanged

  function createCartLine(product: Product, modifiers: SnapshottedModifier[]): CartLine {
    return {
      cartLineId: crypto.randomUUID(),
      productId: product.id,
      productName: product.name,
      brandId: product.brandId,
      brandName: brandsById.get(product.brandId)?.name ?? '—',
      categoryId: product.categoryId,
      categoryName: categoriesById.get(product.categoryId)?.name ?? '—',
      quantity: 1,
      unitPriceSen: product.unitPriceSen,
      modifiers,
      discountSen: 0,
    }
  }

  function handleProductTap(product: Product) {
    if (product.soldOut) return
    if (product.modifierGroups.length > 0) {
      setSelectedProduct(product)
      return
    }
    setCart((current) => [...current, createCartLine(product, [])])
  }

  function updateQuantity(cartLineId: string, quantity: number) {
    if (quantity <= 0) {
      setCart((current) => current.filter((line) => line.cartLineId !== cartLineId))
      return
    }
    setCart((current) =>
      current.map((line) => (line.cartLineId === cartLineId ? { ...line, quantity } : line)),
    )
  }

  function applyDiscount(valueSen: number) {
    if (!discountTarget) return
    if (discountTarget.kind === 'cart') {
      setCartDiscountSen(valueSen)
    } else {
      setCart((current) =>
        current.map((line) =>
          line.cartLineId === discountTarget.cartLineId ? { ...line, discountSen: valueSen } : line,
        ),
      )
    }
    setDiscountTarget(null)
  }

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-canvas text-ink">
      <header className="flex min-h-16 shrink-0 items-center gap-3 bg-ink px-4 text-white sm:px-6">
        <button
          type="button"
          onClick={onBack}
          className="flex min-h-11 items-center gap-2 rounded-xl px-3 font-black hover:bg-white/10"
        >
          <ArrowLeft aria-hidden="true" className="size-5" /> Back
        </button>
        <div className="min-w-0">
          <p className="truncate font-black">Editing {sale.queueLabel}</p>
          <p className="truncate text-xs font-bold text-slate-400">
            Current ticket {formatRinggit(requestNetSen(baselineRequest))} ·{' '}
            {formatBusinessDate(sale.businessDate)}
          </p>
        </div>
      </header>

      <main className="mx-auto grid min-h-0 w-full max-w-[1800px] flex-1 grid-cols-1 overflow-hidden lg:grid-cols-[minmax(0,1fr)_23rem] xl:grid-cols-[minmax(0,1fr)_27rem]">
        {/* `relative` so the modifier popup stays confined to this column. */}
        <section className="relative flex min-h-0 flex-col border-r border-slate-200/80">
          <FilterBar
            brands={brands}
            categories={visibleCategories}
            selectedBrandId={brandId}
            selectedCategoryId={categoryId}
            search={search}
            onBrandChange={(value) => {
              setBrandId(value)
              setCategoryId(null)
            }}
            onCategoryChange={setCategoryId}
            onSearchChange={setSearch}
          />
          <ProductGrid
            products={visibleProducts}
            brandsById={brandsById}
            onProductTap={handleProductTap}
          />

          {selectedProduct ? (
            <ModifierModal
              product={selectedProduct}
              brand={brandsById.get(selectedProduct.brandId)}
              categoryName={categoriesById.get(selectedProduct.categoryId)?.name ?? '—'}
              onClose={() => setSelectedProduct(null)}
              onConfirm={(modifiers) => {
                setCart((current) => [...current, createCartLine(selectedProduct, modifiers)])
                setSelectedProduct(null)
              }}
            />
          ) : null}
        </section>

        <aside className="flex min-h-0 flex-col bg-white">
          <div className="scrollbar-subtle min-h-0 flex-1 overflow-y-auto p-4">
            <h2 className="text-lg font-black">The amended ticket</h2>
            <p className="mt-1 text-xs font-semibold text-slate-500">
              Remove what should not be there, add what should, fix a missed discount.
            </p>

            {cart.length === 0 ? (
              <p className="mt-6 rounded-2xl bg-red-50 p-3 text-sm font-bold text-danger">
                Nothing left on the ticket. That is a full refund — use Cancel sale instead, so it
                is recorded as a cancellation rather than an exchange down to zero.
              </p>
            ) : (
              <ul className="mt-4 space-y-3">
                {cart.map((line) => (
                  <li key={line.cartLineId} className="rounded-2xl border border-slate-200 p-3">
                    <div className="flex items-start gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="font-black leading-tight">{line.productName}</p>
                        <p className="text-xs font-bold text-slate-500">{line.brandName}</p>
                        {line.modifiers.length > 0 ? (
                          <p className="mt-1 text-xs font-semibold text-slate-500">
                            {line.modifiers.map((modifier) => modifier.name).join(', ')}
                          </p>
                        ) : null}
                      </div>
                      <button
                        type="button"
                        onClick={() => updateQuantity(line.cartLineId, 0)}
                        aria-label={`Remove ${line.productName}`}
                        className="grid size-9 place-items-center rounded-xl text-slate-400 hover:bg-red-50 hover:text-danger"
                      >
                        <Trash2 aria-hidden="true" className="size-4" />
                      </button>
                    </div>

                    <div className="mt-2 flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => updateQuantity(line.cartLineId, line.quantity - 1)}
                        aria-label="One fewer"
                        className="grid size-10 place-items-center rounded-xl border border-slate-200 hover:bg-slate-50"
                      >
                        <Minus aria-hidden="true" className="size-4" />
                      </button>
                      <span className="w-8 text-center font-black tabular">{line.quantity}</span>
                      <button
                        type="button"
                        onClick={() => updateQuantity(line.cartLineId, line.quantity + 1)}
                        aria-label="One more"
                        className="grid size-10 place-items-center rounded-xl border border-slate-200 hover:bg-slate-50"
                      >
                        <Plus aria-hidden="true" className="size-4" />
                      </button>

                      <button
                        type="button"
                        onClick={() =>
                          setDiscountTarget({ kind: 'item', cartLineId: line.cartLineId })
                        }
                        className="ml-auto flex min-h-10 items-center gap-1.5 rounded-xl border border-slate-200 px-2.5 text-xs font-black text-slate-600 hover:border-ink hover:text-ink"
                      >
                        <Tag aria-hidden="true" className="size-3.5" />
                        {line.discountSen > 0 ? formatRinggit(line.discountSen) : 'Discount'}
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}

            <button
              type="button"
              onClick={() => setDiscountTarget({ kind: 'cart' })}
              className="mt-4 flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-slate-200 text-sm font-black text-slate-600 hover:border-ink hover:text-ink"
            >
              <Tag aria-hidden="true" className="size-4" />
              {cartDiscountSen > 0
                ? `Order discount ${formatRinggit(cartDiscountSen)}`
                : 'Order discount'}
            </button>

            <fieldset className="mt-5">
              <legend className="text-xs font-black uppercase tracking-wider text-slate-400">
                Why
              </legend>
              <div className="mt-2 space-y-2">
                {EXCHANGE_REASONS.map((option) => (
                  <label
                    key={option}
                    className={`flex min-h-12 cursor-pointer items-center gap-3 rounded-xl border-2 px-3 text-sm font-black ${
                      reason === option ? 'border-ink bg-slate-50' : 'border-slate-200'
                    }`}
                  >
                    <input
                      type="radio"
                      name="exchange-reason"
                      value={option}
                      checked={reason === option}
                      onChange={() => setReason(option)}
                      className="size-4"
                    />
                    {option}
                  </label>
                ))}
              </div>
            </fieldset>
          </div>

          <div className="shrink-0 border-t border-slate-200 p-4">
            <dl className="space-y-1 text-sm font-bold">
              <div className="flex justify-between text-slate-500">
                <dt>Originally paid</dt>
                <dd className="tabular">{formatRinggit(plan.originalSen)}</dd>
              </div>
              <div className="flex justify-between text-slate-500">
                <dt>Amended ticket</dt>
                <dd className="tabular">{formatRinggit(plan.replacementSen)}</dd>
              </div>
            </dl>

            <div
              className={`mt-3 rounded-2xl p-3 ${
                plan.deltaSen > 0
                  ? 'bg-amber-50 text-amber-900'
                  : plan.deltaSen < 0
                    ? 'bg-red-50 text-danger'
                    : 'bg-slate-50 text-slate-500'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-2 text-sm font-black">
                  {plan.deltaSen > 0 ? (
                    <>
                      <QrCode aria-hidden="true" className="size-4" /> Collect from customer
                    </>
                  ) : plan.deltaSen < 0 ? (
                    <>
                      <Undo2 aria-hidden="true" className="size-4" /> Refund to customer
                    </>
                  ) : (
                    'No money moves'
                  )}
                </span>
                <span className="text-xl font-black tabular">
                  {formatSignedRinggit(plan.deltaSen)}
                </span>
              </div>
              {plan.deltaSen > 0 ? (
                <p className="mt-1 text-xs font-bold">
                  Send them to the counter QR for the difference.
                </p>
              ) : null}
              {plan.brandDeltas.length > 1 ? (
                <p className="mt-1 text-xs font-semibold">
                  {plan.brandDeltas
                    .map((delta) => `${delta.brandName} ${formatSignedRinggit(delta.deltaSen)}`)
                    .join(' · ')}
                </p>
              ) : null}
            </div>

            <button
              type="button"
              disabled={!hasChanged || cart.length === 0}
              onClick={() => onCommit(plan, reason)}
              className="mt-3 min-h-14 w-full rounded-2xl bg-ink text-base font-black text-white disabled:opacity-40"
            >
              {hasChanged ? 'Record the correction' : 'Nothing changed yet'}
            </button>
            <p className="mt-2 text-center text-xs font-semibold text-slate-500">
              {totals.itemCount} item{totals.itemCount === 1 ? '' : 's'} on the amended ticket. The
              original sale stays exactly as it was.
            </p>
          </div>
        </aside>
      </main>

      {discountTarget ? (
        <DiscountModal
          target={discountTarget}
          cart={cart}
          cartGrossSen={totals.subtotalSen - totals.itemDiscountSen}
          currentCartDiscountSen={cartDiscountSen}
          onClose={() => setDiscountTarget(null)}
          onApply={applyDiscount}
        />
      ) : null}
    </div>
  )
}
