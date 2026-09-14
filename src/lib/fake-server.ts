import { PRODUCTS } from '../data/fake-account'
import type { FinalizeCheckoutRequest, SaleCorrection } from '../domain/types'

/**
 * Stands in for `api-vista` until it exists, so the UI can be built and driven
 * end to end. It deliberately imitates the three server behaviours the real
 * checkout must have, because designing the UI around them now is cheaper than
 * retrofitting it later:
 *
 *  1. Prices are recomputed from the catalogue. For an online sale that figure
 *     is the price. For one rung up offline it is kept alongside what the
 *     customer actually paid, which is what gets booked — the books have to
 *     record money that moved.
 *  2. The queue number is allocated by the server, per business date, from #001.
 *  3. A replayed `client_txn_id` returns the original sale rather than making a
 *     second one — which is what makes offline replay safe. Corrections replay on
 *     their own keys the same way.
 *
 * State lives in localStorage so a page reload does not reset the day.
 */

const COUNTER_KEY = 'vista.fake-server.queue-counters'
const SALES_KEY = 'vista.fake-server.sales'
const CORRECTIONS_KEY = 'vista.fake-server.corrections'
const LATENCY_MS = 450

export type ServerSaleResponse = {
  order_id: string
  queue_number: string
  /** What the customer paid. For an offline sale, the device's figure stands. */
  total_sen: number
  /** What the same basket costs at today's menu prices. Equal to `total_sen` online. */
  menu_price_sen: number
  item_count: number
  /** True when this request had already been recorded — the idempotent replay path. */
  replayed: boolean
}

export type ServerCorrectionResponse = {
  correction_id: string
  replayed: boolean
}

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}

function writeJson(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // A full or blocked store must not lose a sale — the sale itself lives in
    // IndexedDB. Losing the fake server's memory only affects the demo.
  }
}

function allocateQueueNumber(businessDate: string): string {
  const counters = readJson<Record<string, number>>(COUNTER_KEY, {})
  const next = (counters[businessDate] ?? 0) + 1
  counters[businessDate] = next
  writeJson(COUNTER_KEY, counters)
  return `#${next.toString().padStart(3, '0')}`
}

/**
 * Total the request twice: once at the prices the device charged, once at today's
 * catalogue prices.
 *
 * Both figures are kept. The charged one is what the customer paid and what the
 * books record; the menu one makes a divergence visible in a report instead of
 * being silently trusted or silently thrown away.
 */
function priceBothWays(request: FinalizeCheckoutRequest): {
  chargedSen: number
  menuSen: number
  itemCount: number
} {
  let chargedGrossSen = 0
  let menuGrossSen = 0
  let lineDiscountSen = 0
  let itemCount = 0

  for (const item of request.cart_items) {
    const product = PRODUCTS.find((candidate) => candidate.id === item.product_id)
    const menuUnitPriceSen = product?.unitPriceSen ?? item.unit_price_sen

    chargedGrossSen += (item.unit_price_sen + item.modifier_total_sen) * item.quantity
    menuGrossSen += (menuUnitPriceSen + item.modifier_total_sen) * item.quantity
    lineDiscountSen += item.discount_sen
    itemCount += item.quantity
  }

  const total = (grossSen: number) => {
    const afterLineDiscounts = Math.max(0, grossSen - lineDiscountSen)
    return afterLineDiscounts - Math.min(request.cart_discount_sen, afterLineDiscounts)
  }

  return { chargedSen: total(chargedGrossSen), menuSen: total(menuGrossSen), itemCount }
}

export async function serverFinalizeCheckout(
  request: FinalizeCheckoutRequest,
): Promise<ServerSaleResponse> {
  await new Promise((resolve) => window.setTimeout(resolve, LATENCY_MS))

  const sales = readJson<Record<string, ServerSaleResponse>>(SALES_KEY, {})
  const existing = sales[request.client_txn_id]
  if (existing) {
    return { ...existing, replayed: true }
  }

  const { chargedSen, menuSen, itemCount } = priceBothWays(request)
  const response: ServerSaleResponse = {
    order_id: crypto.randomUUID(),
    queue_number: allocateQueueNumber(request.business_date),
    total_sen: chargedSen,
    menu_price_sen: menuSen,
    item_count: itemCount,
    replayed: false,
  }

  sales[request.client_txn_id] = response
  writeJson(SALES_KEY, sales)

  return response
}

/**
 * Accept a contra-entry against an already-paid sale.
 *
 * The original sale is not touched: it is a historical fact and editing it would
 * destroy the audit trail. The correction is its own record, idempotent on its
 * own key, so a retry after a dropped connection cannot refund twice.
 */
export async function serverSubmitCorrection(
  correction: SaleCorrection,
): Promise<ServerCorrectionResponse> {
  await new Promise((resolve) => window.setTimeout(resolve, LATENCY_MS))

  const stored = readJson<Record<string, ServerCorrectionResponse>>(CORRECTIONS_KEY, {})
  const existing = stored[correction.clientTxnId]
  if (existing) return { ...existing, replayed: true }

  const response: ServerCorrectionResponse = {
    correction_id: crypto.randomUUID(),
    replayed: false,
  }
  stored[correction.clientTxnId] = response
  writeJson(CORRECTIONS_KEY, stored)

  return response
}

/** Demo affordance: forget every sale and reset the day's queue counter. */
export function resetFakeServer(): void {
  try {
    localStorage.removeItem(COUNTER_KEY)
    localStorage.removeItem(SALES_KEY)
    localStorage.removeItem(CORRECTIONS_KEY)
  } catch {
    // Nothing to do — the demo simply keeps its previous numbers.
  }
}
