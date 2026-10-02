import { getBusinessDate } from '../domain/business-date'
import { calculateCartTotals, lineDiscountSen, modifierUnitTotalSen } from '../domain/cart'
import { planCancel, planExchange, type ExchangePlan } from '../domain/corrections'
import { assertSen } from '../domain/money'
import type {
  CartLine,
  CheckoutCartItemRequest,
  CheckoutResult,
  CompletedSale,
  CorrectionKind,
  CorrectionResult,
  FinalizeCheckoutRequest,
  ModifierType,
  SaleCorrection,
  Shift,
} from '../domain/types'
import * as fakeServer from './fake-server'
import { ApiError, apiRequest, NetworkError, SessionExpiredError } from './http'
import {
  deleteCorrection,
  listPendingCorrections,
  listCorrectionsForDate,
  listPendingSales,
  listSalesForDate,
  nextOfflineLabel,
  saveCorrection,
  saveSale,
} from './offline-queue'

export class CheckoutApiError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'CheckoutApiError'
  }
}

/**
 * Demo mode keeps the in-browser stand-in (`fake-server.ts`) and the demo menu,
 * so the POS still runs with no server at all. Never set in production.
 */
export const IS_DEMO = import.meta.env.VITE_DEMO === '1'

/**
 * Minted once per checkout attempt and reused across retries. This is the value
 * that lets the server recognise a replay — a double tap, a retry after a
 * timeout, or an offline sale flushed hours later — and return the original
 * sale instead of charging the customer twice.
 */
export function mintClientTxnId(): string {
  return crypto.randomUUID()
}

type CreateCheckoutRequestInput = {
  shiftId: string
  businessDate: string
  clientTxnId: string
  cart: CartLine[]
  /** Cart-wide discount already capped by `calculateCartTotals`. */
  cartDiscountSen: number
}

export function createCheckoutRequest({
  shiftId,
  businessDate,
  clientTxnId,
  cart,
  cartDiscountSen,
}: CreateCheckoutRequestInput): FinalizeCheckoutRequest {
  assertSen(cartDiscountSen, 'cart discount')

  const cartItems = cart.map((line) => ({
    product_id: line.productId,
    product_name: line.productName,
    brand_id: line.brandId,
    category_id: line.categoryId,
    quantity: line.quantity,
    unit_price_sen: line.unitPriceSen,
    modifier_total_sen: modifierUnitTotalSen(line),
    discount_sen: lineDiscountSen(line),
    modifiers: line.modifiers.map((modifier) => ({
      modifier_id: modifier.modifierId,
      name: modifier.name,
      price_sen: modifier.priceSen,
      type: modifier.type,
    })),
  }))

  // The payload must describe the same money the cashier saw on screen. If these
  // disagree the customer would be billed an amount that was never displayed, so
  // this throws rather than shipping a request that is quietly wrong.
  const totals = calculateCartTotals(cart, cartDiscountSen)
  const payloadDiscountSen =
    cartItems.reduce((sum, item) => sum + item.discount_sen, 0) + cartDiscountSen

  if (payloadDiscountSen !== totals.discountSen) {
    throw new CheckoutApiError(
      `Discount mismatch: payload ${payloadDiscountSen} sen, displayed ${totals.discountSen} sen.`,
    )
  }

  return {
    shift_id: shiftId,
    client_txn_id: clientTxnId,
    business_date: businessDate,
    cart_discount_sen: cartDiscountSen,
    cart_items: cartItems,
  }
}

/** Exact wire shape consumed by api-vista's POST /checkout route. */
export function toCheckoutApiPayload(
  request: FinalizeCheckoutRequest,
  claimedTotalSen: number,
  origin: 'ONLINE' | 'OFFLINE_SYNC',
  offlineLabel: string | null,
) {
  return {
    shift_id: request.shift_id,
    client_txn_id: request.client_txn_id,
    business_date: request.business_date,
    origin,
    offline_label: offlineLabel,
    claimed_total_sen: claimedTotalSen,
    cart_discount_sen: request.cart_discount_sen,
    cart_items: request.cart_items.map((item) => ({
      product_id: item.product_id,
      quantity: item.quantity,
      discount_sen: item.discount_sen,
      modifiers: item.modifiers.map((modifier) => ({ modifier_id: modifier.modifier_id })),
      ...(origin === 'OFFLINE_SYNC'
        ? {
            charged_unit_price_sen: item.unit_price_sen,
            charged_modifier_total_sen: item.modifier_total_sen,
          }
        : {}),
    })),
  }
}

// ---------------------------------------------------------------------------
// Transport — the real API, or the in-browser stand-in in demo mode
// ---------------------------------------------------------------------------

type RecordedSale = {
  orderId: string
  queueNumber: string
  totalSen: number
  menuPriceSen: number
  itemCount: number
}

type CheckoutResponse = {
  order_id: string
  queue_number: string
  total_amount_sen: number
  menu_price_sen: number
  item_count: number
}

async function sendSale(
  request: FinalizeCheckoutRequest,
  claimedTotalSen: number,
  origin: 'ONLINE' | 'OFFLINE_SYNC',
  offlineLabel: string | null,
): Promise<RecordedSale> {
  if (IS_DEMO) {
    const response = await fakeServer.serverFinalizeCheckout(request)
    return {
      orderId: response.order_id,
      queueNumber: response.queue_number,
      totalSen: response.total_sen,
      menuPriceSen: response.menu_price_sen,
      itemCount: response.item_count,
    }
  }

  const response = await apiRequest<CheckoutResponse>(
    'POST',
    '/checkout',
    toCheckoutApiPayload(request, claimedTotalSen, origin, offlineLabel),
  )
  return {
    orderId: response.order_id,
    queueNumber: response.queue_number,
    totalSen: response.total_amount_sen,
    menuPriceSen: response.menu_price_sen,
    itemCount: response.item_count,
  }
}

async function sendCorrection(
  correction: SaleCorrection,
  origin: 'ONLINE' | 'OFFLINE_SYNC',
): Promise<string> {
  if (IS_DEMO) return (await fakeServer.serverSubmitCorrection(correction)).correction_id

  const response = await apiRequest<{ correction_id: string }>(
    'POST',
    '/corrections',
    toCorrectionApiPayload(correction, origin),
  )
  return response.correction_id
}

// ---------------------------------------------------------------------------
// Sales
// ---------------------------------------------------------------------------

type ReceiptItemResponse = {
  product_id: string
  product_name: string
  brand_id: string
  category_id: string
  quantity: number
  unit_price_sen: number
  modifier_total_sen: number
  discount_sen: number
  modifiers: Array<{ modifier_id: string | null; name: string; price_sen: number; type: ModifierType }>
}

type ReceiptsResponse = {
  orders: Array<{
    order_id: string
    client_txn_id: string
    shift_id: string
    business_date: string
    queue_number: string
    offline_label: string | null
    total_amount_sen: number
    menu_price_sen: number
    item_count: number
    completed_at: string
    cart_discount_sen: number
    cart_items: ReceiptItemResponse[]
  }>
  corrections: Array<{
    correction_id: string
    client_txn_id: string
    original_client_txn_id: string
    original_queue_number: string
    shift_id: string
    business_date: string
    kind: CorrectionKind
    reason: string
    delta_sen: number
    brand_deltas: Array<{ brand_id: string; brand_name: string; delta_sen: number }>
    replacement_items: ReceiptItemResponse[] | null
    replacement_cart_discount_sen: number | null
    created_at: string
  }>
}

export type Receipts = {
  sales: CompletedSale[]
  corrections: SaleCorrection[]
  /**
   * False when the server could not be asked, so only what this tablet holds
   * is listed — another tablet's sales are missing, not absent.
   */
  isComplete: boolean
}

function toCartItems(items: ReceiptItemResponse[]): CheckoutCartItemRequest[] {
  return items.map((item) => ({
    ...item,
    modifiers: item.modifiers.map((modifier) => ({
      // Null once the option is deleted from the menu; the name and price stand on their own.
      modifier_id: modifier.modifier_id ?? '',
      name: modifier.name,
      price_sen: modifier.price_sen,
      type: modifier.type,
    })),
  }))
}

/**
 * One merged record per key: this tablet's copy while it is still unsent (the
 * server has not seen it yet), otherwise the server's, which knows about every
 * tablet.
 */
export function mergeByKey<T extends { clientTxnId: string; syncStatus: string }>(
  server: T[],
  local: T[],
): T[] {
  const merged = new Map(server.map((record) => [record.clientTxnId, record]))
  for (const record of local) {
    if (record.syncStatus === 'PENDING' || !merged.has(record.clientTxnId)) {
      merged.set(record.clientTxnId, record)
    }
  }
  return [...merged.values()]
}

/**
 * Every receipt for one business day — from the server, so a sale rung up on
 * another tablet, or before this one was reinstalled, is listed too. Sales this
 * tablet has not sent yet are merged in. Offline, only this tablet's are shown.
 */
export async function loadReceipts(businessDate: string, isOnline: boolean): Promise<Receipts> {
  const [localSales, localCorrections] = await Promise.all([
    listSalesForDate(businessDate),
    listCorrectionsForDate(businessDate),
  ])
  const deviceOnly = { sales: localSales, corrections: localCorrections }
  // The demo has no server and lives on one browser, so the device is the whole record.
  if (IS_DEMO) return { ...deviceOnly, isComplete: true }
  if (!isOnline) return { ...deviceOnly, isComplete: false }

  let response: ReceiptsResponse
  try {
    response = await apiRequest<ReceiptsResponse>(
      'GET',
      `/receipts?business_date=${encodeURIComponent(businessDate)}`,
    )
  } catch {
    return { ...deviceOnly, isComplete: false }
  }

  const serverSales: CompletedSale[] = response.orders.map((order) => ({
    clientTxnId: order.client_txn_id,
    orderId: order.order_id,
    queueLabel: order.queue_number,
    offlineLabel: order.offline_label,
    totalSen: order.total_amount_sen,
    menuPriceSen: order.menu_price_sen,
    itemCount: order.item_count,
    completedAt: order.completed_at,
    businessDate: order.business_date,
    syncStatus: 'SYNCED',
    request: {
      shift_id: order.shift_id,
      client_txn_id: order.client_txn_id,
      business_date: order.business_date,
      cart_discount_sen: order.cart_discount_sen,
      cart_items: toCartItems(order.cart_items),
    },
  }))
  const serverCorrections: SaleCorrection[] = response.corrections.map((correction) => ({
    clientTxnId: correction.client_txn_id,
    correctionId: correction.correction_id,
    originalClientTxnId: correction.original_client_txn_id,
    originalQueueLabel: correction.original_queue_number,
    kind: correction.kind,
    reason: correction.reason,
    deltaSen: correction.delta_sen,
    brandDeltas: correction.brand_deltas.map((delta) => ({
      brandId: delta.brand_id,
      brandName: delta.brand_name,
      deltaSen: delta.delta_sen,
    })),
    replacementItems: correction.replacement_items ? toCartItems(correction.replacement_items) : null,
    replacementCartDiscountSen: correction.replacement_cart_discount_sen,
    shiftId: correction.shift_id,
    businessDate: correction.business_date,
    createdAt: correction.created_at,
    syncStatus: 'SYNCED',
  }))

  return {
    sales: mergeByKey(serverSales, localSales).sort((a, b) =>
      b.completedAt.localeCompare(a.completedAt),
    ),
    // A correction made later against this day's sale is listed under the
    // sale's day by the server; this tablet files it under the sale's day too.
    corrections: mergeByKey(serverCorrections, localCorrections).sort((a, b) =>
      a.createdAt.localeCompare(b.createdAt),
    ),
    isComplete: true,
  }
}

/**
 * The queue number the next sale will most likely get, so the cashier can write
 * it on the cup before charging. Only a preview: nothing is reserved, and a
 * second terminal checking out first takes it. Offline it is the next `#OFF-NN`,
 * which is exactly what the sale will be labelled.
 */
export async function previewNextQueueLabel(
  businessDate: string,
  isOnline: boolean,
): Promise<string> {
  if (!isOnline) return nextOfflineLabel(businessDate)
  if (IS_DEMO) return fakeServer.serverPeekQueueNumber(businessDate)
  const response = await apiRequest<{ queue_number: string }>(
    'GET',
    `/checkout/next-queue-number?business_date=${encodeURIComponent(businessDate)}`,
  )
  return response.queue_number
}

type FinalizeInput = {
  request: FinalizeCheckoutRequest
  totalSen: number
  itemCount: number
  isOnline: boolean
}

/**
 * Complete a sale. Online it goes to the server and comes back with a real queue
 * number; otherwise it is written to the local queue with an `#OFF-NN` label so
 * the counter keeps moving and the kitchen still has something to call out.
 *
 * Either way the sale is durable before this resolves. By the time "Mark paid"
 * is tapped the customer has already paid, so a paid sale is never left
 * unrecorded — the only case that stops the cashier is a server that answered
 * and refused for a reason that retrying cannot fix.
 */
export async function finalizeCheckout({
  request,
  totalSen,
  itemCount,
  isOnline,
}: FinalizeInput): Promise<CheckoutResult> {
  const completedAt = new Date().toISOString()

  async function keepOnDevice(): Promise<CheckoutResult> {
    const offlineLabel = await nextOfflineLabel(request.business_date)
    const sale: CompletedSale = {
      clientTxnId: request.client_txn_id,
      orderId: null,
      queueLabel: offlineLabel,
      offlineLabel,
      totalSen,
      // Nothing has repriced this yet, so the only figure that exists is the one
      // the customer was charged.
      menuPriceSen: totalSen,
      itemCount,
      completedAt,
      businessDate: request.business_date,
      syncStatus: 'PENDING',
      request,
    }
    await saveSale(sale)
    return { sale, wasOffline: true }
  }

  if (!isOnline) return keepOnDevice()

  try {
    const recorded = await sendSale(request, totalSen, 'ONLINE', null)
    const sale: CompletedSale = {
      clientTxnId: request.client_txn_id,
      orderId: recorded.orderId,
      queueLabel: recorded.queueNumber,
      offlineLabel: null,
      totalSen: recorded.totalSen,
      menuPriceSen: recorded.menuPriceSen,
      itemCount: recorded.itemCount,
      completedAt,
      businessDate: request.business_date,
      syncStatus: 'SYNCED',
      request,
    }
    await saveSale(sale)
    return { sale, wasOffline: false }
  } catch (error) {
    // The menu on this tablet was out of date, so the server's price differs from
    // the one the customer just paid. The money has moved: record it at the price
    // charged, exactly as an offline sale is, with the server's own figure kept
    // alongside. Refusing it would leave a paid sale unrecorded.
    if (error instanceof ApiError && error.code === 'checkout:GROSS_MISMATCH') {
      return keepOnDevice()
    }
    // The shift was closed under this sale — the business day ended and the
    // server closed it. The customer has paid, so the sale is kept on the device
    // and sent as a late sale, which the server takes and flags for the owner.
    if (error instanceof ApiError && error.code === 'checkout:SHIFT_NOT_OPEN') {
      return keepOnDevice()
    }
    // Any other refusal is something retrying cannot fix — show it.
    if (error instanceof ApiError) throw new CheckoutApiError(error.message)
    // No answer, or signed out. The request may or may not have landed, so the
    // sale is kept under its original key and the flush replays it: if the server
    // did record it, the replay returns that order rather than a second one.
    if (error instanceof NetworkError || error instanceof SessionExpiredError) {
      return keepOnDevice()
    }
    throw error
  }
}

export type SyncOutcome = {
  syncedCount: number
  failedCount: number
}

/**
 * Flush locally queued sales to the server, oldest first. Each replay carries the
 * client_txn_id it was created with, so a sale the server already saw comes back
 * as the original rather than being written twice.
 *
 * Nothing here asks anyone for permission. The sale already happened; syncing
 * gives it a real queue number and nothing else. The label the kitchen actually
 * called is kept so a disputed order can still be traced.
 *
 * A sale priced against a catalogue that has since moved keeps **the price the
 * customer paid**. The server's own recomputation comes back alongside it as
 * `menuPriceSen`, so the difference is recorded rather than either silently
 * trusted or silently discarded.
 */
export async function syncPendingSales(): Promise<SyncOutcome> {
  const pending = await listPendingSales()
  let syncedCount = 0
  let failedCount = 0

  for (const sale of pending) {
    try {
      const recorded = await sendSale(sale.request, sale.totalSen, 'OFFLINE_SYNC', sale.offlineLabel)
      await saveSale({
        ...sale,
        orderId: recorded.orderId,
        // The server owns the real numbering, and the queue label is renumbered
        // to match it on arrival.
        queueLabel: recorded.queueNumber,
        totalSen: recorded.totalSen,
        menuPriceSen: recorded.menuPriceSen,
        itemCount: recorded.itemCount,
        syncStatus: 'SYNCED',
      })
      syncedCount += 1
    } catch (error) {
      failedCount += 1
      // Unreachable or signed out: stop here and keep the rest in order for the
      // next attempt, rather than hammering a server that is not answering.
      if (error instanceof NetworkError || error instanceof SessionExpiredError) break
    }
  }

  return { syncedCount, failedCount }
}

// ---------------------------------------------------------------------------
// Counter corrections
// ---------------------------------------------------------------------------

type CorrectionInput = {
  sale: CompletedSale
  kind: CorrectionKind
  reason: string
  deltaSen: number
  brandDeltas: SaleCorrection['brandDeltas']
  replacementItems: SaleCorrection['replacementItems']
  replacementCartDiscountSen: SaleCorrection['replacementCartDiscountSen']
  isOnline: boolean
}

/** Exact wire shape consumed by api-vista's POST /corrections route. */
export function toCorrectionApiPayload(
  correction: SaleCorrection,
  origin: 'ONLINE' | 'OFFLINE_SYNC',
) {
  return {
    client_txn_id: correction.clientTxnId,
    original_client_txn_id: correction.originalClientTxnId,
    kind: correction.kind,
    reason: correction.reason,
    origin,
    claimed_delta_sen: correction.deltaSen,
    replacement_cart_discount_sen: correction.replacementCartDiscountSen,
    replacement_items:
      correction.replacementItems?.map((item) => ({
        product_id: item.product_id,
        quantity: item.quantity,
        discount_sen: item.discount_sen,
        modifiers: item.modifiers.map((modifier) => ({ modifier_id: modifier.modifier_id })),
        ...(origin === 'OFFLINE_SYNC'
          ? {
              charged_unit_price_sen: item.unit_price_sen,
              charged_modifier_total_sen: item.modifier_total_sen,
            }
          : {}),
      })) ?? null,
  }
}

/**
 * Record a correction. Durable before this resolves, online or off.
 *
 * Its own `clientTxnId` is minted here, separate from the sale's: the correction
 * is a second financial record and needs its own idempotency key, or a retry
 * would refund the customer twice.
 */
async function recordCorrection({
  sale,
  kind,
  reason,
  deltaSen,
  brandDeltas,
  replacementItems,
  replacementCartDiscountSen,
  isOnline,
}: CorrectionInput): Promise<CorrectionResult> {
  const correction: SaleCorrection = {
    clientTxnId: mintClientTxnId(),
    correctionId: null,
    originalClientTxnId: sale.clientTxnId,
    originalQueueLabel: sale.queueLabel,
    kind,
    reason,
    deltaSen,
    brandDeltas,
    replacementItems,
    replacementCartDiscountSen,
    shiftId: sale.request.shift_id,
    businessDate: sale.businessDate,
    createdAt: new Date().toISOString(),
    syncStatus: 'PENDING',
  }

  // Written locally first either way, so the cashier is never told a refund
  // happened that the device has not actually kept.
  await saveCorrection(correction)
  if (!isOnline) return { correction, wasOffline: true }

  try {
    const correctionId = await sendCorrection(correction, 'ONLINE')
    const synced: SaleCorrection = { ...correction, correctionId, syncStatus: 'SYNCED' }
    await saveCorrection(synced)
    return { correction: synced, wasOffline: false }
  } catch (error) {
    if (error instanceof ApiError) {
      // Refused, and retrying cannot change that: the refund does not match what
      // the server computes, the shift is closed, the sale is already fully
      // cancelled. Left queued it would retry forever and block the shift close,
      // so it is removed and the cashier is told plainly nothing was recorded.
      await deleteCorrection(correction.clientTxnId)
      throw new CheckoutApiError(`Not recorded — ${error.message}`)
    }
    // No answer or signed out: it stays PENDING and the flush replays it on the
    // same key. It is not lost and cannot be applied twice.
    return { correction, wasOffline: true }
  }
}

/**
 * Reverse a paid sale in full. Writes a contra-entry; the sale itself is untouched.
 *
 * `priorCorrections` are the corrections already made against this sale. They
 * matter: a sale exchanged down to RM 9.50 must refund RM 9.50, not the RM 14.50
 * originally rung up.
 */
export async function cancelSale(
  sale: CompletedSale,
  priorCorrections: readonly SaleCorrection[],
  reason: string,
  brandName: (brandId: string) => string,
  isOnline: boolean,
): Promise<CorrectionResult> {
  const { deltaSen, brandDeltas } = planCancel(sale.request, priorCorrections, brandName)
  return recordCorrection({
    sale,
    kind: 'CANCEL',
    reason,
    deltaSen,
    brandDeltas,
    replacementItems: null,
    replacementCartDiscountSen: null,
    isOnline,
  })
}

/** Amend what was sold. The difference is collected or refunded at the counter. */
export async function exchangeSale(
  sale: CompletedSale,
  plan: ExchangePlan,
  reason: string,
  isOnline: boolean,
): Promise<CorrectionResult> {
  return recordCorrection({
    sale,
    kind: 'EXCHANGE',
    reason,
    deltaSen: plan.deltaSen,
    brandDeltas: plan.brandDeltas,
    replacementItems: plan.replacementItems,
    replacementCartDiscountSen: plan.replacementCartDiscountSen,
    isOnline,
  })
}

/** Flush queued corrections, oldest first, on the keys they were minted with. */
export async function syncPendingCorrections(): Promise<SyncOutcome> {
  const pending = await listPendingCorrections()
  let syncedCount = 0
  let failedCount = 0

  for (const correction of pending) {
    try {
      const correctionId = await sendCorrection(correction, 'OFFLINE_SYNC')
      await saveCorrection({ ...correction, correctionId, syncStatus: 'SYNCED' })
      syncedCount += 1
    } catch (error) {
      failedCount += 1
      if (error instanceof NetworkError || error instanceof SessionExpiredError) break
    }
  }

  return { syncedCount, failedCount }
}

// ---------------------------------------------------------------------------
// Shifts
// ---------------------------------------------------------------------------

type ShiftResponse = { id: string; business_date: string; opened_at: string }

/**
 * Open a shift. The server checks the PIN, so the PIN never has to live on the
 * device, and it is the server that issues the shift id every sale then carries.
 */
export async function openShiftOnServer(pin: string, cashierId: string): Promise<Shift> {
  if (IS_DEMO) {
    return {
      id: crypto.randomUUID(),
      businessDate: getBusinessDate(new Date()),
      openedAt: new Date().toISOString(),
      openedByCashierId: cashierId,
    }
  }

  const response = await apiRequest<ShiftResponse>('POST', '/shifts/open', { pin })
  return {
    id: response.id,
    businessDate: response.business_date,
    openedAt: response.opened_at,
    openedByCashierId: cashierId,
  }
}

/**
 * Close a shift with the PIN only. The device reports how many records it is
 * still holding; the server refuses the close while that is non-zero.
 */
export async function closeShiftOnServer(
  shiftId: string,
  pin: string,
  devicePendingCount: number,
): Promise<void> {
  if (IS_DEMO) return
  await apiRequest('POST', `/shifts/${shiftId}/close`, {
    pin,
    device_pending_count: devicePendingCount,
  })
}

/**
 * Tell the server this tablet is alive, and how many flushes in a row have
 * failed. It is the only way the owner's banner can tell a quiet counter from a
 * disconnected one: the server cannot see a tablet that has stopped calling.
 */
export async function sendHeartbeat(consecutiveSyncFailures: number): Promise<{ shiftClosed: boolean }> {
  if (IS_DEMO) return { shiftClosed: false }
  const response = await apiRequest<{ ok: boolean; shift_closed?: boolean }>(
    'POST',
    '/terminal/heartbeat',
    { consecutive_sync_failures: consecutiveSyncFailures },
  )
  // True when the server has just closed this tablet's shift because its
  // business day ended — time to open today's.
  return { shiftClosed: response.shift_closed === true }
}

export { planExchange }
