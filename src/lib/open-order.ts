import type { CartLine } from '../domain/types'

/**
 * The order being keyed in, kept on the tablet so a reload never loses it.
 *
 * A browser reload (a swipe down in a Chrome tab, Android reclaiming a tab it
 * pushed out of memory, the crash screen's Reload) used to wipe the cart and any
 * confirmed-but-unpaid order, because they lived only in memory. Paid sales were
 * always safe in IndexedDB; this covers the order still in hand.
 *
 * The confirmed order's client transaction id is kept too, so marking a restored
 * order paid is the same checkout: the server replays it instead of charging twice.
 */
export type OpenOrder = {
  shiftId: string
  cart: CartLine[]
  cartDiscountSen: number
  removedPromotions: string[]
  orderMode: 'BUILDING' | 'CONFIRMED'
  clientTxnId: string | null
  hasAttempted: boolean
  pagerNumber: string
  pagerRequired: boolean
  savedAt: string
}

const KEY = 'vista-pos-open-order'
/** An order older than this is from another day's rush, not one to carry on. */
const MAX_AGE_MS = 12 * 60 * 60 * 1000

export function saveOpenOrder(order: Omit<OpenOrder, 'savedAt'>): void {
  try {
    if (order.cart.length === 0) localStorage.removeItem(KEY)
    else localStorage.setItem(KEY, JSON.stringify({ ...order, savedAt: new Date().toISOString() }))
  } catch {
    // A full or blocked store only costs this protection, never the sale.
  }
}

export function loadOpenOrder(shiftId: string, now: Date = new Date()): OpenOrder | null {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return null
    const order = JSON.parse(raw) as OpenOrder
    if (order.shiftId !== shiftId || !Array.isArray(order.cart) || order.cart.length === 0) return null
    if (now.getTime() - new Date(order.savedAt).getTime() > MAX_AGE_MS) return null
    return order
  } catch {
    return null
  }
}

export function clearOpenOrder(): void {
  try {
    localStorage.removeItem(KEY)
  } catch {
    // Nothing to do.
  }
}
