import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ShoppingBasket } from 'lucide-react'
import { DiscountModal, type DiscountTarget } from './components/DiscountModal'
import { FilterBar } from './components/FilterBar'
import { ModifierModal } from './components/ModifierModal'
import { OrderPanel, type OrderPanelMode } from './components/OrderPanel'
import type { PinVerdict } from './components/PinPad'
import { ProductGrid } from './components/ProductGrid'
import { TopBar } from './components/TopBar'
import { FAKE_ACCOUNT, FAKE_LOGIN, type AccountSnapshot } from './data/fake-account'
import { getBusinessDate } from './domain/business-date'
import { applyPromotions, isPickable, promotionsOn } from './domain/promotions'
import { calculateCartTotals } from './domain/cart'
import {
  cartLinesFromRequest,
  requestAfterCorrections,
  type ExchangePlan,
} from './domain/corrections'
import type {
  CartLine,
  CompletedSale,
  Product,
  SaleCorrection,
  Shift,
  SnapshottedModifier,
} from './domain/types'
import { useDisplayMode } from './hooks/useDisplayMode'
import { useNetworkStatus } from './hooks/useNetworkStatus'
import {
  cancelSale,
  closeShiftOnServer,
  createCheckoutRequest,
  exchangeSale,
  finalizeCheckout,
  IS_DEMO,
  mintClientTxnId,
  openShiftOnServer,
  sendHeartbeat,
  syncPendingCorrections,
  syncPendingSales,
} from './lib/api'
import {
  cachedBootstrap,
  clearCachedBootstrap,
  EMPTY_SNAPSHOT,
  loadBootstrap,
  type Bootstrap,
} from './lib/bootstrap'
import { ApiError, onSessionExpired, SessionExpiredError } from './lib/http'
import {
  countOtherBusinessRecords,
  countPendingRecords,
  listCorrectionsForShift,
  listSalesForShift,
} from './lib/offline-queue'
import {
  clearHandoffFromUrl,
  handoffCodeInUrl,
  hasSession,
  redeemHandoff,
  signIn,
} from './lib/session'
import { EditOrderScreen } from './screens/EditOrderScreen'
import { RecentSalesScreen } from './screens/RecentSalesScreen'
import { ShiftCloseScreen } from './screens/ShiftCloseScreen'
import { ShiftOpenScreen } from './screens/ShiftOpenScreen'
import { SignInScreen } from './screens/SignInScreen'

type Screen =
  | 'SIGN_IN'
  | 'SHIFT_OPEN'
  | 'REGISTER'
  | 'RECENT_SALES'
  | 'EDIT_ORDER'
  | 'SHIFT_CLOSE'

/** How often queued records are retried while the tablet believes it is online. */
const SYNC_RETRY_MS = 30_000
/** How often an open counter tells the server it is alive. */
const HEARTBEAT_MS = 60_000

/**
 * What a failed shift open or close shows on the PIN pad. A wrong PIN is the only
 * case that reads as "wrong"; everything else says what actually happened.
 */
function pinVerdictFor(error: unknown): PinVerdict {
  if (error instanceof ApiError) {
    return error.code === 'auth:INVALID_PIN' ? { ok: false } : { ok: false, message: error.message }
  }
  if (error instanceof SessionExpiredError) return { ok: false, message: error.message }
  return { ok: false, message: 'No connection to the server. Opening or closing a shift needs one.' }
}

/** Demo runs on the built-in account; otherwise the last menu this device saw, if any. */
function initialSnapshot(): AccountSnapshot | null {
  if (IS_DEMO) return FAKE_ACCOUNT
  // Arriving from vistahub.my may mean a different business: show no menu
  // until this one's has loaded.
  if (ARRIVING_HANDOFF) return null
  return cachedBootstrap()?.snapshot ?? null
}

/** A one-time code from vistahub.my, if the owner just chose the POS there. */
const ARRIVING_HANDOFF = IS_DEMO ? null : handoffCodeInUrl()
/** A code works once; React's development double-run must not spend it twice. */
let handoffStarted = false

function App() {
  const [snapshot, setSnapshot] = useState<AccountSnapshot | null>(initialSnapshot)
  const account = snapshot ?? EMPTY_SNAPSHOT
  const networkOnline = useNetworkStatus()
  const [isSimulatedOffline, setIsSimulatedOffline] = useState(false)
  const isOnline = networkOnline && !isSimulatedOffline
  const displayMode = useDisplayMode()

  const [screen, setScreen] = useState<Screen>(() =>
    !IS_DEMO && !ARRIVING_HANDOFF && hasSession() ? 'SHIFT_OPEN' : 'SIGN_IN',
  )
  const [handoffNotice, setHandoffNotice] = useState<string | null>(
    ARRIVING_HANDOFF ? 'Signing this counter in…' : null,
  )
  const [shift, setShift] = useState<Shift | null>(null)
  /** The server rejected the token mid-shift. Sales keep queuing until sign-in. */
  const [sessionExpired, setSessionExpired] = useState(false)

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
  const [corrections, setCorrections] = useState<SaleCorrection[]>([])
  /** Why the last cancel or exchange was refused by the server, if it was. */
  const [correctionError, setCorrectionError] = useState<string | null>(null)
  /** The sale being amended, while the edit screen is open. */
  const [editing, setEditing] = useState<CompletedSale | null>(null)
  // Counted across every shift, and across corrections as well as sales: anything
  // still sitting on the device is a reason to refuse a shift close.
  const [pendingCount, setPendingCount] = useState(0)
  const [syncTick, setSyncTick] = useState(0)
  /** Flush attempts in a row that failed to send something. Reported in the heartbeat. */
  const [syncFailures, setSyncFailures] = useState(0)
  const syncFailuresRef = useRef(0)
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

  // Automatic promos, worked out afresh from what is in the order. The cart
  // keeps only what the cashier did; the promos are laid on top, so taking an
  // item out or removing a promo can never leave a stale discount behind.
  const [removedPromotions, setRemovedPromotions] = useState<ReadonlySet<string>>(() => new Set())
  const runningPromotions = useMemo(
    () => (shift ? promotionsOn(account.promotions, shift.businessDate) : []),
    [account.promotions, shift],
  )
  const promoted = applyPromotions(cart, cartDiscountSen, runningPromotions, removedPromotions)
  const totals = calculateCartTotals(promoted.lines, promoted.cartDiscountSen)
  const editingRequest = editing
    ? requestAfterCorrections(
        editing.request,
        corrections.filter(
          (correction) => correction.originalClientTxnId === editing.clientTxnId,
        ),
      )
    : null

  const refreshSales = useCallback(async (shiftId: string) => {
    const [shiftSales, shiftCorrections, pending] = await Promise.all([
      listSalesForShift(shiftId),
      listCorrectionsForShift(shiftId),
      countPendingRecords(),
    ])
    setSales(shiftSales)
    setCorrections(shiftCorrections)
    setPendingCount(pending)
  }, [])

  /**
   * Take in a fresh bootstrap. A shift already open on the server means this
   * tablet reloaded or signed in again mid-shift — resume it rather than asking
   * for a second one, which the server would refuse anyway.
   */
  const applyBootstrap = useCallback((result: Bootstrap) => {
    setSnapshot(result.snapshot)
    const open = result.openShift
    if (!open) return
    setShift({
      id: open.id,
      businessDate: open.businessDate,
      openedAt: open.openedAt,
      openedByCashierId: result.snapshot.cashier.id,
    })
    setScreen((current) => (current === 'SIGN_IN' || current === 'SHIFT_OPEN' ? 'REGISTER' : current))
  }, [])

  // On start: refresh the menu and pick up any open shift. Offline, the cached
  // menu stays; a rejected token goes back to the sign-in screen.
  useEffect(() => {
    if (IS_DEMO || ARRIVING_HANDOFF || !hasSession()) return
    loadBootstrap()
      .then(applyBootstrap)
      .catch((error: unknown) => {
        if (error instanceof SessionExpiredError) setScreen('SIGN_IN')
      })
  }, [applyBootstrap])

  // Signed out from the owner dashboard: lock straight back to the sign-in
  // screen. Nothing is lost — anything not yet sent stays on the tablet and
  // flushes once the counter is signed in again.
  useEffect(
    () =>
      onSessionExpired(() => {
        setSessionExpired(true)
        setScreen('SIGN_IN')
      }),
    [],
  )

  // Records left by another business account never send under this one; say so
  // before a shift opens, so nobody wonders where they went.
  const [otherBusinessCount, setOtherBusinessCount] = useState(0)
  useEffect(() => {
    if (screen !== 'SHIFT_OPEN' || IS_DEMO) return
    let cancelled = false
    countOtherBusinessRecords()
      .then((count) => {
        if (!cancelled) setOtherBusinessCount(count)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [screen, snapshot])

  // Load this shift's sales once it is open. IndexedDB is an external system, so
  // this belongs in an effect; `refreshSales` awaits before setting state, so the
  // linter's synchronous-setState concern does not apply here.
  useEffect(() => {
    if (!shift) return
    // eslint-disable-next-line react/set-state-in-effect
    void refreshSales(shift.id)
  }, [shift, refreshSales])

  // Flush the local queue whenever connectivity returns, and on each retry tick.
  // Guarded by a ref so the state update this causes cannot re-enter the sync.
  useEffect(() => {
    if (!shift || !isOnline || sessionExpired || pendingCount === 0 || isSyncingRef.current) return

    isSyncingRef.current = true
    // Sales first, then corrections: a correction refers to a sale, so replaying
    // it before its sale has arrived would reference something the server has
    // never seen.
    void syncPendingSales()
      .then(async (salesOutcome) => {
        const correctionsOutcome = await syncPendingCorrections()
        const failed = salesOutcome.failedCount + correctionsOutcome.failedCount
        setSyncFailures((current) => (failed > 0 ? current + 1 : 0))
      })
      .then(() => refreshSales(shift.id))
      .finally(() => {
        isSyncingRef.current = false
      })
  }, [isOnline, pendingCount, shift, refreshSales, sessionExpired, syncTick])

  // Kept in a ref so a change in the count does not restart the heartbeat timer.
  useEffect(() => {
    syncFailuresRef.current = syncFailures
  }, [syncFailures])

  // Tell the server this counter is alive, so the owner's banner can tell a quiet
  // shift from a tablet that has dropped off. Sent on open, on reconnect, and
  // every minute. It stops while offline — which is exactly what the banner reads.
  useEffect(() => {
    if (!shift || IS_DEMO || sessionExpired || !isOnline) return
    const beat = () => {
      sendHeartbeat(syncFailuresRef.current).catch(() => {})
    }
    beat()
    const timer = window.setInterval(beat, HEARTBEAT_MS)
    return () => window.clearInterval(timer)
  }, [shift, sessionExpired, isOnline])

  // A server that is down while the tablet thinks it is online changes nothing
  // that would re-run the flush above, so queued records are retried on a timer.
  useEffect(() => {
    if (pendingCount === 0 || !isOnline) return
    const timer = window.setInterval(() => setSyncTick((tick) => tick + 1), SYNC_RETRY_MS)
    return () => window.clearInterval(timer)
  }, [pendingCount, isOnline])

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
    setRemovedPromotions(new Set())
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
        cart: promoted.lines,
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

      // Kept on the tablet although it is online: the server did not answer, or
      // its price had moved. The flush sends it shortly; meanwhile refresh the
      // menu so the next order is priced against the server's current one.
      if (result.wasOffline && isOnline && !IS_DEMO) {
        loadBootstrap()
          .then((fresh) => setSnapshot(fresh.snapshot))
          .catch(() => {})
      }
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

  async function handleSignIn(email: string, password: string): Promise<string | null> {
    if (IS_DEMO) {
      if (email !== FAKE_LOGIN.email || password !== FAKE_LOGIN.password) {
        return 'Incorrect email or password.'
      }
      setScreen(shift ? 'REGISTER' : 'SHIFT_OPEN')
      return null
    }

    try {
      await signIn(email, password)
      await enterAfterSignIn()
      return null
    } catch (error) {
      if (error instanceof ApiError) return error.message
      return 'Cannot reach the server. Check the connection and try again.'
    }
  }

  /**
   * Freshly signed in, by password or from vistahub.my: load this business's
   * menu and resume its open shift, if it has one. The menu cached from before
   * is dropped first — it may belong to a different business.
   */
  const enterAfterSignIn = useCallback(async () => {
    clearCachedBootstrap()
    const result = await loadBootstrap()
    setSessionExpired(false)
    applyBootstrap(result)
    if (!result.openShift) {
      // No shift open on the server — including the case where this tablet's
      // shift was force-closed from the RMS while it was signed out. Anything
      // still queued carries its own shift id and flushes once a shift is open.
      setShift(null)
      setScreen('SHIFT_OPEN')
    }
  }, [applyBootstrap])

  // Arriving from vistahub.my: swap its one-time code for a counter session.
  // Runs once: `enterAfterSignIn` is stable, and the flag stops a second run.
  useEffect(() => {
    if (!ARRIVING_HANDOFF || handoffStarted) return
    handoffStarted = true
    clearHandoffFromUrl()
    redeemHandoff(ARRIVING_HANDOFF)
      .then(() => enterAfterSignIn())
      .then(
        () => setHandoffNotice(null),
        (error: unknown) =>
          setHandoffNotice(
            error instanceof ApiError
              ? error.message
              : 'Cannot reach the server. Check the connection and sign in here.',
          ),
      )
  }, [enterAfterSignIn])

  async function verifyOpenPin(pin: string): Promise<PinVerdict> {
    if (IS_DEMO && pin !== FAKE_ACCOUNT.cashier.pin) return { ok: false }

    try {
      const opened = await openShiftOnServer(pin, account.cashier.id)
      setShift(opened)
      setScreen('REGISTER')
      return { ok: true }
    } catch (error) {
      // The server checks the PIN before it checks for an open shift, so reaching
      // this means the PIN was right and a shift is already running: resume it.
      if (error instanceof ApiError && error.code === 'shift:ALREADY_OPEN') {
        try {
          const result = await loadBootstrap()
          applyBootstrap(result)
          if (result.openShift) return { ok: true }
        } catch {
          // Fall through to the server's own message.
        }
      }
      return pinVerdictFor(error)
    }
  }

  async function verifyClosePin(pin: string): Promise<PinVerdict> {
    if (!shift) return { ok: false, message: 'No shift is open.' }
    if (IS_DEMO && pin !== FAKE_ACCOUNT.cashier.pin) return { ok: false }

    try {
      await closeShiftOnServer(shift.id, pin, pendingCount)
      finishShift()
      return { ok: true }
    } catch (error) {
      return pinVerdictFor(error)
    }
  }

  function finishShift() {
    startNextOrder()
    setSales([])
    setCorrections([])
    setPendingCount(0)
    setShift(null)
    setScreen('SHIFT_OPEN')
  }

  /**
   * Reverse a paid sale. Immediate, with no owner in the loop: the cashier is
   * standing in front of the customer and the contra-entry is the record.
   */
  async function handleCancelSale(sale: CompletedSale, reason: string) {
    setCorrectionError(null)
    const prior = corrections.filter(
      (correction) => correction.originalClientTxnId === sale.clientTxnId,
    )
    try {
      await cancelSale(sale, prior, reason, (id) => brandsById.get(id)?.name ?? '—', isOnline)
    } catch (error) {
      setCorrectionError(error instanceof Error ? error.message : 'The cancellation was not recorded.')
    }
    if (shift) await refreshSales(shift.id)
  }

  async function handleExchange(sale: CompletedSale, plan: ExchangePlan, reason: string) {
    setCorrectionError(null)
    try {
      await exchangeSale(sale, plan, reason, isOnline)
    } catch (error) {
      setCorrectionError(error instanceof Error ? error.message : 'The exchange was not recorded.')
    }
    setEditing(null)
    setScreen('RECENT_SALES')
    if (shift) await refreshSales(shift.id)
  }

  if (screen === 'SIGN_IN') {
    return (
      <SignInScreen
        outletName={account.account.outletName}
        businessName={account.account.businessName}
        onSignIn={handleSignIn}
        showDemoHint={IS_DEMO || import.meta.env.DEV}
        notice={
          handoffNotice ??
          (sessionExpired
            ? 'This counter was signed out from the owner dashboard. Sales not yet sent are safe on this tablet and will send once it is signed in again.'
            : null)
        }
      />
    )
  }

  if (screen === 'SHIFT_OPEN' || !shift) {
    return (
      <ShiftOpenScreen
        cashier={account.cashier}
        outletName={account.account.outletName}
        businessDate={getBusinessDate(new Date(), account.account.dayRolloverHour)}
        verifyPin={verifyOpenPin}
        notice={
          otherBusinessCount > 0
            ? `This tablet is holding ${otherBusinessCount} unsent record${otherBusinessCount === 1 ? '' : 's'} from a different business account. They are kept safely and will send only when that business signs this tablet in again.`
            : null
        }
      />
    )
  }

  if (screen === 'RECENT_SALES') {
    return (
      <RecentSalesScreen
        businessDate={shift.businessDate}
        sales={sales}
        corrections={corrections}
        error={correctionError}
        onBack={() => {
          setCorrectionError(null)
          setScreen('REGISTER')
        }}
        onCancelSale={(sale, reason) => void handleCancelSale(sale, reason)}
        onEditSale={(sale) => {
          setCorrectionError(null)
          setEditing(sale)
          setScreen('EDIT_ORDER')
        }}
      />
    )
  }

  if (screen === 'EDIT_ORDER' && editing && editingRequest) {
    return (
      <EditOrderScreen
        sale={editing}
        baselineRequest={editingRequest}
        initialCart={cartLinesFromRequest(editingRequest, account.brands, account.categories)}
        initialCartDiscountSen={editingRequest.cart_discount_sen}
        brands={account.brands}
        categories={account.categories}
        products={account.products}
        onBack={() => {
          setEditing(null)
          setScreen('RECENT_SALES')
        }}
        onCommit={(plan, reason) => void handleExchange(editing, plan, reason)}
      />
    )
  }

  if (screen === 'SHIFT_CLOSE') {
    return (
      <ShiftCloseScreen
        businessDate={shift.businessDate}
        sales={sales}
        corrections={corrections}
        pendingCount={pendingCount}
        onBack={() => setScreen('REGISTER')}
        verifyPin={verifyClosePin}
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
          cart={promoted.lines}
          // The cashier's own order discount: an automatic promo is listed separately.
          cartDiscountSen={cartDiscountSen}
          totals={totals}
          appliedPromotions={promoted.applied}
          onRemovePromotion={(promotionId) =>
            setRemovedPromotions((current) => new Set([...current, promotionId]))
          }
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
          promotions={runningPromotions.filter(isPickable)}
          onClose={() => setDiscountTarget(null)}
          onApply={applyDiscount}
        />
      ) : null}
    </div>
  )
}

export default App
