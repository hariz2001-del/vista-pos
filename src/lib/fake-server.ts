import { PRODUCTS } from '../data/fake-account'
import type { FinalizeCheckoutRequest } from '../domain/types'

/**
 * Stands in for `api-vista` until it exists, so the UI can be built and driven
 * end to end. It deliberately imitates the three server behaviours the real
 * checkout must have, because designing the UI around them now is cheaper than
 * retrofitting it later:
 *
 *  1. Prices are recomputed from the catalogue; the client's totals are advisory.
 *  2. The queue number is allocated by the server, per business date, from #001.
 *  3. A replayed `client_txn_id` returns the original sale rather than making a
 *     second one — which is what makes offline replay safe.
 *
 * State lives in localStorage so a page reload does not reset the day.
 */

const COUNTER_KEY = 'vista.fake-server.queue-counters'
const SALES_KEY = 'vista.fake-server.sales'
const LATENCY_MS = 450

export type ServerSaleResponse = {
  order_id: string
  queue_number: string
  total_sen: number
  item_count: number
  /** True when this request had already been recorded — the idempotent replay path. */
  replayed: boolean
  /** Set when an offline sale arrived priced against a catalogue that has since changed. */
  price_changed: boolean
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

/** Recompute the payable total from the catalogue, ignoring what the client claimed. */
function repriceFromCatalogue(request: FinalizeCheckoutRequest): {
  totalSen: number
  itemCount: number
  priceChanged: boolean
} {
  let grossSen = 0
  let lineDiscountSen = 0
  let itemCount = 0
  let priceChanged = false

  for (const item of request.cart_items) {
    const product = PRODUCTS.find((candidate) => candidate.id === item.product_id)
    const unitPriceSen = product?.unitPriceSen ?? item.unit_price_sen
    if (product && product.unitPriceSen !== item.unit_price_sen) priceChanged = true

    grossSen += (unitPriceSen + item.modifier_total_sen) * item.quantity
    lineDiscountSen += item.discount_sen
    itemCount += item.quantity
  }

  const afterLineDiscounts = Math.max(0, grossSen - lineDiscountSen)
  const cartDiscountSen = Math.min(request.cart_discount_sen, afterLineDiscounts)

  return {
    totalSen: afterLineDiscounts - cartDiscountSen,
    itemCount,
    priceChanged,
  }
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

  const { totalSen, itemCount, priceChanged } = repriceFromCatalogue(request)
  const response: ServerSaleResponse = {
    order_id: crypto.randomUUID(),
    queue_number: allocateQueueNumber(request.business_date),
    total_sen: totalSen,
    item_count: itemCount,
    replayed: false,
    price_changed: priceChanged,
  }

  sales[request.client_txn_id] = response
  writeJson(SALES_KEY, sales)

  return response
}

/** Demo affordance: forget every sale and reset the day's queue counter. */
export function resetFakeServer(): void {
  try {
    localStorage.removeItem(COUNTER_KEY)
    localStorage.removeItem(SALES_KEY)
  } catch {
    // Nothing to do — the demo simply keeps its previous numbers.
  }
}
