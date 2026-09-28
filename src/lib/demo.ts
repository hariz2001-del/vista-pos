import { FAKE_ACCOUNT } from '../data/fake-account'
import { getBusinessDate } from '../domain/business-date'
import type { CheckoutCartItemRequest, CompletedSale, Product } from '../domain/types'
import { seedQueueCounter } from './fake-server'
import { saveSale } from './offline-queue'
import { rememberShift } from './shift-memory'

/**
 * The public demo at demopos.vistahub.my.
 *
 * It runs entirely in the visitor's browser — the in-page fake server, the
 * device's own IndexedDB — so no visitor ever reaches the real API or another
 * visitor's till. Everything they ring up persists across reloads until the
 * next reset: every 3 hours on the clock in Malaysia (12am, 3am, 6am …), and
 * whenever the business day changes. A fresh demo starts signed in, with a
 * shift already open and a dozen sales from earlier today.
 */

export const RESET_HOURS = 3
const WINDOW_KEY = 'vista.demo.window'
const DB_NAME = 'vista-pos'
const SEED_SHIFT_ID = 'demo-shift'
const SEED_SALE_COUNT = 12

type MalaysiaClock = { date: string; hour: number }

function malaysiaClock(now: Date): MalaysiaClock {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Kuala_Lumpur',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(now)
      .map((part) => [part.type, part.value]),
  )
  return { date: `${parts.year}-${parts.month}-${parts.day}`, hour: Number(parts.hour) }
}

/** `2026-09-28#4` — the Malaysian date and which 3-hour block of it. */
export function demoWindow(now: Date): string {
  const { date, hour } = malaysiaClock(now)
  return `${date}#${Math.floor(hour / RESET_HOURS)}`
}

/** Milliseconds until the next 3-hour boundary in Malaysia (UTC+8, no DST). */
export function msUntilNextReset(now: Date): number {
  const blockMs = RESET_HOURS * 3_600_000
  const malaysiaMs = now.getTime() + 8 * 3_600_000
  return blockMs - (malaysiaMs % blockMs)
}

/** "3:00 pm" — when the current demo will reset. */
export function nextResetLabel(now: Date): string {
  return new Intl.DateTimeFormat('en-MY', {
    timeZone: 'Asia/Kuala_Lumpur',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(now.getTime() + msUntilNextReset(now)))
}

function deleteDatabase(name: string): Promise<void> {
  return new Promise((resolve) => {
    try {
      const request = indexedDB.deleteDatabase(name)
      request.onsuccess = () => resolve()
      request.onerror = () => resolve()
      // Another demo tab holds it open; the seed below is idempotent anyway.
      request.onblocked = () => resolve()
    } catch {
      resolve()
    }
  })
}

/** A small fixed-seed generator: the same demo morning every time. */
function seededRandom(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b_79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296
  }
}

function itemFrom(product: Product, quantity: number): CheckoutCartItemRequest {
  return {
    product_id: product.id,
    product_name: product.name,
    brand_id: product.brandId,
    category_id: product.categoryId,
    quantity,
    unit_price_sen: product.unitPriceSen,
    modifier_total_sen: 0,
    discount_sen: 0,
    modifiers: [],
  }
}

/** A shift opened earlier today with a dozen paid sales, oldest first. */
export function seedSales(now: Date): { businessDate: string; openedAt: string; sales: CompletedSale[] } {
  const random = seededRandom(0x7015_de30)
  const businessDate = getBusinessDate(now, FAKE_ACCOUNT.account.dayRolloverHour)
  const products = FAKE_ACCOUNT.products.filter((product) => !product.soldOut)
  const spacingMs = 22 * 60_000
  const openedAt = new Date(now.getTime() - (SEED_SALE_COUNT + 1) * spacingMs).toISOString()

  const sales = Array.from({ length: SEED_SALE_COUNT }, (_, index): CompletedSale => {
    const lineCount = 1 + Math.floor(random() * 3)
    const items: CheckoutCartItemRequest[] = []
    for (let line = 0; line < lineCount; line += 1) {
      const product = products[Math.floor(random() * products.length)]
      if (!product || items.some((item) => item.product_id === product.id)) continue
      items.push(itemFrom(product, random() < 0.8 ? 1 : 2))
    }
    const totalSen = items.reduce((sum, item) => sum + item.unit_price_sen * item.quantity, 0)
    const itemCount = items.reduce((sum, item) => sum + item.quantity, 0)
    const number = index + 1
    const clientTxnId = `demo-seed-${number.toString().padStart(3, '0')}`
    return {
      clientTxnId,
      businessId: 'demo',
      orderId: `demo-order-${number}`,
      queueLabel: `#${number.toString().padStart(3, '0')}`,
      offlineLabel: null,
      totalSen,
      menuPriceSen: totalSen,
      itemCount,
      completedAt: new Date(now.getTime() - (SEED_SALE_COUNT - index) * spacingMs).toISOString(),
      businessDate,
      syncStatus: 'SYNCED',
      request: {
        shift_id: SEED_SHIFT_ID,
        client_txn_id: clientTxnId,
        business_date: businessDate,
        cart_discount_sen: 0,
        cart_items: items,
      },
    }
  })

  return { businessDate, openedAt, sales }
}

/**
 * Called before the app renders. Inside the current window: nothing to do, the
 * visitor carries on where they left off. A new window: wipe this origin's demo
 * data and lay down a fresh morning.
 */
export async function ensureFreshDemo(now = new Date()): Promise<void> {
  const current = demoWindow(now)
  let stored: string | null = null
  try {
    stored = localStorage.getItem(WINDOW_KEY)
  } catch {
    // Storage blocked: every load is a fresh demo, which is still a demo.
  }
  if (stored === current) return

  try {
    // This origin only ever holds demo data, so clearing it all is safe.
    localStorage.clear()
  } catch {
    // Nothing stored, or nothing we can do.
  }
  await deleteDatabase(DB_NAME)

  const { businessDate, openedAt, sales } = seedSales(now)
  rememberShift({
    id: SEED_SHIFT_ID,
    businessDate,
    openedAt,
    openedByCashierId: FAKE_ACCOUNT.cashier.id,
  })
  for (const sale of sales) await saveSale(sale)
  seedQueueCounter(businessDate, sales.length)

  try {
    localStorage.setItem(WINDOW_KEY, current)
  } catch {
    // See above.
  }
}

/** Reload into a fresh demo when the window turns over, even if the tab is left open. */
export function scheduleDemoReset(now = new Date()): () => void {
  const timer = window.setTimeout(() => window.location.reload(), msUntilNextReset(now) + 1_000)
  return () => window.clearTimeout(timer)
}
