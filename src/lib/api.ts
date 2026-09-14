import { calculateCartTotals, lineDiscountSen, modifierUnitTotalSen } from '../domain/cart'
import { planCancel, planExchange, type ExchangePlan } from '../domain/corrections'
import { assertSen } from '../domain/money'
import type {
  CartLine,
  CheckoutResult,
  CompletedSale,
  CorrectionKind,
  CorrectionResult,
  FinalizeCheckoutRequest,
  SaleCorrection,
} from '../domain/types'
import { serverFinalizeCheckout, serverSubmitCorrection } from './fake-server'
import {
  listPendingCorrections,
  listPendingSales,
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

type FinalizeInput = {
  request: FinalizeCheckoutRequest
  totalSen: number
  itemCount: number
  isOnline: boolean
}

/**
 * Complete a sale. Online it goes to the server and comes back with a real queue
 * number; offline it is written to the local queue with an `#OFF-NN` label so
 * the counter keeps moving and the kitchen still has something to call out.
 *
 * Either way the sale is durable before this resolves.
 */
export async function finalizeCheckout({
  request,
  totalSen,
  itemCount,
  isOnline,
}: FinalizeInput): Promise<CheckoutResult> {
  const completedAt = new Date().toISOString()

  if (!isOnline) {
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

  try {
    const response = await serverFinalizeCheckout(request)
    const sale: CompletedSale = {
      clientTxnId: request.client_txn_id,
      orderId: response.order_id,
      queueLabel: response.queue_number,
      offlineLabel: null,
      totalSen: response.total_sen,
      menuPriceSen: response.menu_price_sen,
      itemCount: response.item_count,
      completedAt,
      businessDate: request.business_date,
      syncStatus: 'SYNCED',
      request,
    }
    await saveSale(sale)
    return { sale, wasOffline: false }
  } catch {
    // The request may in fact have reached the server. Never advise paying again;
    // the same client_txn_id on retry is what makes a second attempt safe.
    throw new CheckoutApiError(
      'The connection dropped while recording this sale. If the customer has already paid, do not ask them to pay again — retry the same order.',
    )
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
      const response = await serverFinalizeCheckout(sale.request)
      await saveSale({
        ...sale,
        orderId: response.order_id,
        // The server owns the real numbering, and the queue label is renumbered
        // to match it on arrival.
        queueLabel: response.queue_number,
        totalSen: response.total_sen,
        menuPriceSen: response.menu_price_sen,
        itemCount: response.item_count,
        syncStatus: 'SYNCED',
      })
      syncedCount += 1
    } catch {
      failedCount += 1
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
    const response = await serverSubmitCorrection(correction)
    const synced: SaleCorrection = {
      ...correction,
      correctionId: response.correction_id,
      syncStatus: 'SYNCED',
    }
    await saveCorrection(synced)
    return { correction: synced, wasOffline: false }
  } catch {
    // It stays PENDING and the flush will replay it on the same key. The
    // correction is not lost and cannot be applied twice.
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
      const response = await serverSubmitCorrection(correction)
      await saveCorrection({
        ...correction,
        correctionId: response.correction_id,
        syncStatus: 'SYNCED',
      })
      syncedCount += 1
    } catch {
      failedCount += 1
    }
  }

  return { syncedCount, failedCount }
}

export { planExchange }
