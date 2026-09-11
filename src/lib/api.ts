import { calculateCartTotals, lineDiscountSen, modifierUnitTotalSen } from '../domain/cart'
import { assertSen } from '../domain/money'
import type { CartLine, CheckoutResult, CompletedSale, FinalizeCheckoutRequest } from '../domain/types'
import { serverFinalizeCheckout } from './fake-server'
import { listPendingSales, nextOfflineLabel, saveSale } from './offline-queue'

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
      itemCount,
      completedAt,
      businessDate: request.business_date,
      syncStatus: 'PENDING',
      flaggedForOwner: false,
      flagReason: null,
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
      itemCount: response.item_count,
      completedAt,
      businessDate: request.business_date,
      syncStatus: 'SYNCED',
      flaggedForOwner: false,
      flagReason: null,
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
  flaggedCount: number
}

/**
 * Flush locally queued sales to the server, oldest first. Each replay carries the
 * client_txn_id it was created with, so a sale the server already saw comes back
 * as the original rather than being written twice.
 *
 * A sale priced against a catalogue that has since changed is accepted and
 * flagged for the owner. It is never silently repriced and never dropped.
 */
export async function syncPendingSales(): Promise<SyncOutcome> {
  const pending = await listPendingSales()
  let syncedCount = 0
  let failedCount = 0
  let flaggedCount = 0

  for (const sale of pending) {
    try {
      const response = await serverFinalizeCheckout(sale.request)
      const flagged = response.price_changed
      await saveSale({
        ...sale,
        orderId: response.order_id,
        queueLabel: response.queue_number,
        totalSen: response.total_sen,
        itemCount: response.item_count,
        syncStatus: 'SYNCED',
        flaggedForOwner: sale.flaggedForOwner || flagged,
        flagReason: flagged
          ? 'Price changed after this offline sale — please review it in the RMS.'
          : sale.flagReason,
      })
      syncedCount += 1
      if (flagged) flaggedCount += 1
    } catch {
      failedCount += 1
    }
  }

  return { syncedCount, failedCount, flaggedCount }
}

/** Raise a flag on a completed sale for the owner to resolve in the RMS. */
export async function flagSaleForOwner(sale: CompletedSale, reason: string): Promise<void> {
  await saveSale({ ...sale, flaggedForOwner: true, flagReason: reason })
}
