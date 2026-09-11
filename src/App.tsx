import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ShoppingBasket } from 'lucide-react'
import { DiscountModal, type DiscountTarget } from './components/DiscountModal'
import { FilterBar } from './components/FilterBar'
import { ModifierModal } from './components/ModifierModal'
import { OrderPanel, type OrderPanelMode } from './components/OrderPanel'
import { ProductGrid } from './components/ProductGrid'
import { TopBar } from './components/TopBar'
import { FAKE_ACCOUNT } from './data/fake-account'
import { getBusinessDate } from './domain/business-date'
import { calculateCartTotals } from './domain/cart'
import type {
  CartLine,
  CompletedSale,
  Product,
  Shift,
  SnapshottedModifier,
} from './domain/types'
import { useDisplayMode } from './hooks/useDisplayMode'
import { useNetworkStatus } from './hooks/useNetworkStatus'
import {
  createCheckoutRequest,
  finalizeCheckout,
  flagSaleForOwner,
  mintClientTxnId,
  syncPendingSales,
} from './lib/api'
import { countPendingSales, listSalesForShift } from './lib/offline-queue'
import { RecentSalesScreen } from './screens/RecentSalesScreen'
import { ShiftCloseScreen } from './screens/ShiftCloseScreen'
import { ShiftOpenScreen } from './screens/ShiftOpenScreen'
import { SignInScreen } from './screens/SignInScreen'

type Screen = 'SIGN_IN' | 'SHIFT_OPEN' | 'REGISTER' | 'RECENT_SALES' | 'SHIFT_CLOSE'

function App() {
  const account = FAKE_ACCOUNT
  const networkOnline = useNetworkStatus()
  const [isSimulatedOffline, setIsSimulatedOffline] = useState(false)
  const isOnline = networkOnline && !isSimulatedOffline
  const displayMode = useDisplayMode()

  const [screen, setScreen] = useState<Screen>('SIGN_IN')
  const [shift, setShift] = useState<Shift | null>(null)

  const [brandId, setBrandId] = useState<string | null>(null)
  const [categoryId, setCategoryId] = useState<string | null>(null)
  const [search, setSearch] = useState('')

  const [cart, setCart] = useState<CartLine[]>([])
  const [cartDiscountSen, setCartDiscountSen] = useState(0)
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null)
  const [isPanelOpen, setIsPanelOpen] = useState(false)
  const [discountTarget, setDiscountTarget] = useState<DiscountTarget | null>(null)

  const [orderMode, setOrderMode] = useState<OrderPanelMode>('BUILDING')
  const [clientTxnId, setClientTxnId] = useState<string | null>(null)
  const [hasAttempted, setHasAttempted] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [checkoutError, setCheckoutError] = useState<string | null>(null)
  const [paidSale, setPaidSale] = useState<CompletedSale | null>(null)

  const [sales, setSales] = useState<CompletedSale[]>([])
  // Counted across every shift, not just this one: any sale still sitting on the
  // device is a reason to refuse a shift close.
  const [pendingCount, setPendingCount] = useState(0)
  const isSyncingRef = useRef(false)

  const brandsById = useMemo(
    () => new Map(account.brands.map((brand) => [brand.id, brand])),
    [account.brands],
  )
  const categoriesById = useMemo(
    () => new Map(account.categories.map((category) => [category.id, category])),
    [account.categories],
  )

  const visibleCategories = useMemo(
    () =>
      brandId === null
        ? account.categories
        : account.categories.filter((category) => category.brandId === brandId),
    [account.categories, brandId],
  )

  const visibleProducts = useMemo(() => {
    const needle = search.trim().toLowerCase()
    return account.products.filter((product) => {
      if (brandId !== null && product.brandId !== brandId) return false
      if (categoryId !== null && product.categoryId !== categoryId) return false
      if (needle && !product.name.toLowerCase().includes(needle)) return false
      return true
    })
  }, [account.products, brandId, categoryId, search])

  const totals = calculateCartTotals(cart, cartDiscountSen)

  const refreshSales = useCallback(async (shiftId: string) => {
    const [shiftSales, pending] = await Promise.all([
      listSalesForShift(shiftId),
      countPendingSales(),
    ])
    setSales(shiftSales)
    setPendingCount(pending)
  }, [])

  // Load this shift's sales once it is open. IndexedDB is an external system, so
  // this belongs in an effect; `refreshSales` awaits before setting state, so the
  // linter's synchronous-setState concern does not apply here.
  useEffect(() => {
    if (!shift) return
    // eslint-disable-next-line react/set-state-in-effect
    void refreshSales(shift.id)
  }, [shift, refreshSales])

  // Flush the local queue whenever connectivity returns. Guarded by a ref so the
  // state update this causes cannot re-enter the sync.
  useEffect(() => {
    if (!shift || !isOnline || pendingCount === 0 || isSyncingRef.current) return

    isSyncingRef.current = true
    void syncPendingSales()
      .then(() => refreshSales(shift.id))
      .finally(() => {
        isSyncingRef.current = false
      })
  }, [isOnline, pendingCount, shift, refreshSales])

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
    if (product.soldOut || orderMode !== 'BUILDING') return
    if (product.modifierGroups.length > 0) {
      setSelectedProduct(product)
      return
    }
    setCart((current) => [...current, createCartLine(product, [])])
  }

  function handleAddConfiguredProduct(modifiers: SnapshottedModifier[]) {
    if (!selectedProduct) return
    setCart((current) => [...current, createCartLine(selectedProduct, modifiers)])
    setSelectedProduct(null)
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

  function clearCart() {
    setCart([])
    setCartDiscountSen(0)
  }

  /** Lock the ticket for review. A fresh key per confirmation, since an edited order is a new order. */
  function confirmOrder() {
    if (cart.length === 0) return
    setClientTxnId(mintClientTxnId())
    setHasAttempted(false)
    setCheckoutError(null)
    setOrderMode('CONFIRMED')
  }

  function editOrder() {
    if (hasAttempted) return
    setOrderMode('BUILDING')
    setClientTxnId(null)
    setCheckoutError(null)
  }

  async function markPaid() {
    if (!shift || !clientTxnId || isSubmitting) return

    setIsSubmitting(true)
    setCheckoutError(null)
    setHasAttempted(true)

    try {
      const request = createCheckoutRequest({
        shiftId: shift.id,
        businessDate: shift.businessDate,
        clientTxnId,
        cart,
        cartDiscountSen: totals.cartDiscountSen,
      })
      const result = await finalizeCheckout({
        request,
        totalSen: totals.netTotalSen,
        itemCount: totals.itemCount,
        isOnline,
      })
      setPaidSale(result.sale)
      setOrderMode('PAID')
      await refreshSales(shift.id)
    } catch (error) {
      setCheckoutError(
        error instanceof Error
          ? error.message
          : 'Checkout failed. Retry the same order — it will not be recorded twice.',
      )
    } finally {
      setIsSubmitting(false)
    }
  }

  function startNextOrder() {
    clearCart()
    setOrderMode('BUILDING')
    setClientTxnId(null)
    setHasAttempted(false)
    setPaidSale(null)
    setCheckoutError(null)
    setIsPanelOpen(false)
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

  function openShift() {
    setShift({
      id: crypto.randomUUID(),
      businessDate: getBusinessDate(new Date()),
      openedAt: new Date().toISOString(),
      openedByCashierId: account.cashier.id,
    })
    setScreen('REGISTER')
  }

  function closeShift() {
    startNextOrder()
    setSales([])
    setPendingCount(0)
    setShift(null)
    setScreen('SHIFT_OPEN')
  }

  async function handleFlagSale(sale: CompletedSale, reason: string) {
    await flagSaleForOwner(sale, reason)
    if (shift) await refreshSales(shift.id)
  }

  if (screen === 'SIGN_IN') {
    return (
      <SignInScreen
        outletName={account.account.outletName}
        businessName={account.account.businessName}
        onSignedIn={() => setScreen('SHIFT_OPEN')}
      />
    )
  }

  if (screen === 'SHIFT_OPEN' || !shift) {
    return (
      <ShiftOpenScreen
        cashier={account.cashier}
        outletName={account.account.outletName}
        businessDate={getBusinessDate(new Date())}
        onShiftOpen={openShift}
        onSignOut={() => setScreen('SIGN_IN')}
      />
    )
  }

  if (screen === 'RECENT_SALES') {
    return (
      <RecentSalesScreen
        businessDate={shift.businessDate}
        sales={sales}
        onBack={() => setScreen('REGISTER')}
        onFlag={(sale, reason) => void handleFlagSale(sale, reason)}
      />
    )
  }

  if (screen === 'SHIFT_CLOSE') {
    return (
      <ShiftCloseScreen
        cashier={account.cashier}
        businessDate={shift.businessDate}
        sales={sales}
        pendingCount={pendingCount}
        onBack={() => setScreen('REGISTER')}
        onShiftClosed={closeShift}
      />
    )
  }

  return (
    // Fixed viewport height with a scrolling grid inside, so the catalogue
    // scrolls under a pinned header and order panel rather than the page moving.
    <div className="flex h-dvh flex-col overflow-hidden bg-canvas text-ink">
      <TopBar
        outletName={account.account.outletName}
        businessDate={shift.businessDate}
        cashierName={account.cashier.name}
        cashierImageUrl={account.cashier.imageUrl}
        isDemo={account.isDemo}
        isOnline={isOnline}
        pendingCount={pendingCount}
        onOpenRecentSales={() => setScreen('RECENT_SALES')}
        onCloseShift={() => setScreen('SHIFT_CLOSE')}
        displayMode={displayMode}
        simulatedOffline={{
          isForced: isSimulatedOffline,
          toggle: () => setIsSimulatedOffline((current) => !current),
        }}
      />

      {!isOnline ? (
        <div
          className="flex min-h-11 shrink-0 items-center justify-center gap-2 bg-warning px-4 text-sm font-black text-white"
          role="status"
        >
          ⚠️ No internet connection — sales are saved on this device
        </div>
      ) : null}

      <main className="mx-auto grid min-h-0 w-full max-w-[1800px] flex-1 grid-cols-1 overflow-hidden lg:grid-cols-[minmax(0,1fr)_23rem] xl:grid-cols-[minmax(0,1fr)_27rem]">
        {/* `relative` so the modifier popup can be confined to this column. */}
        <section className="relative flex min-h-0 flex-col border-r border-slate-200/80">
          <FilterBar
            brands={account.brands}
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
              onConfirm={handleAddConfiguredProduct}
            />
          ) : null}
        </section>

        <OrderPanel
          mode={orderMode}
          cart={cart}
          cartDiscountSen={cartDiscountSen}
          totals={totals}
          brandsById={brandsById}
          isOnline={isOnline}
          isOpen={isPanelOpen}
          isSubmitting={isSubmitting}
          hasAttempted={hasAttempted}
          error={checkoutError}
          paidSale={paidSale}
          onClose={() => setIsPanelOpen(false)}
          onQuantityChange={updateQuantity}
          onDiscount={(target) => setDiscountTarget(target)}
          onClear={clearCart}
          onConfirmOrder={confirmOrder}
          onEditOrder={editOrder}
          onMarkPaid={() => void markPaid()}
          onNextOrder={startNextOrder}
        />
      </main>

      <button
        type="button"
        onClick={() => setIsPanelOpen(true)}
        className="fixed bottom-5 right-5 z-30 flex min-h-14 items-center gap-3 rounded-2xl bg-ink px-5 font-bold text-white shadow-2xl lg:hidden"
      >
        <ShoppingBasket aria-hidden="true" className="size-5" />
        Order ({totals.itemCount})
      </button>

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

export default App
