import { apportionByLargestRemainder, calculateCartTotals, lineGrossSen } from './cart'
import type {
  Brand,
  BrandDelta,
  CartLine,
  Category,
  CheckoutCartItemRequest,
  FinalizeCheckoutRequest,
  SaleCorrection,
  SnapshottedModifier,
} from './types'

/**
 * Counter corrections.
 *
 * A paid sale is a historical fact: it is never edited and never deleted. A
 * cancel or an exchange writes a **contra-entry** instead, and the truth about
 * the order is the original plus every correction against it. That keeps the
 * till auditable while letting the cashier fix a mistake in front of the
 * customer, with no owner in the loop.
 */

/** Net value of one request line, after its own discount. Never negative. */
function itemNetSen(item: CheckoutCartItemRequest): number {
  const grossSen = (item.unit_price_sen + item.modifier_total_sen) * item.quantity
  return Math.max(0, grossSen - item.discount_sen)
}

/**
 * Net value per brand for a stored checkout request, apportioning the cart-wide
 * discount the same way the sale did.
 *
 * Insertion-ordered, so two calls on the same request give the same order and a
 * difference can be taken brand by brand.
 */
export function brandNetsFromRequest(request: FinalizeCheckoutRequest): Map<string, number> {
  const bases: number[] = []
  const brandIds: string[] = []

  for (const item of request.cart_items) {
    const index = brandIds.indexOf(item.brand_id)
    if (index === -1) {
      brandIds.push(item.brand_id)
      bases.push(itemNetSen(item))
    } else {
      bases[index] = (bases[index] ?? 0) + itemNetSen(item)
    }
  }

  const totalBaseSen = bases.reduce((sum, base) => sum + base, 0)
  const cartDiscountSen = Math.min(request.cart_discount_sen, totalBaseSen)
  const shares = apportionByLargestRemainder(cartDiscountSen, bases)

  const nets = new Map<string, number>()
  brandIds.forEach((brandId, index) => {
    nets.set(brandId, (bases[index] ?? 0) - (shares[index] ?? 0))
  })
  return nets
}

/** Total a stored request was charged at, derived the same way the cart was. */
export function requestNetSen(request: FinalizeCheckoutRequest): number {
  let total = 0
  for (const net of brandNetsFromRequest(request).values()) total += net
  return total
}

/**
 * How a correction's money attributes across brands.
 *
 * `before` and `after` are brand nets; a cancel passes an empty `after`. Every
 * brand touched by either side appears, so a swap from a Food item to a Drinks
 * item shows up as two entries that sum to the overall difference rather than as
 * one misattributed lump.
 */
export function brandDeltas(
  before: Map<string, number>,
  after: Map<string, number>,
  brandName: (brandId: string) => string,
): BrandDelta[] {
  const brandIds = [...new Set([...before.keys(), ...after.keys()])]
  return brandIds
    .map((brandId) => ({
      brandId,
      brandName: brandName(brandId),
      deltaSen: (after.get(brandId) ?? 0) - (before.get(brandId) ?? 0),
    }))
    .filter((delta) => delta.deltaSen !== 0)
}

/**
 * Rebuild an editable cart from a stored request.
 *
 * The wire format carries everything that affects money but not the ids the
 * catalogue uses for grouping modifiers, so those are synthesised for the
 * editing session only — they are display concerns, and re-submitting the line
 * sends back the same name, price and type it arrived with.
 */
export function cartLinesFromRequest(
  request: FinalizeCheckoutRequest,
  brands: readonly Brand[],
  categories: readonly Category[],
): CartLine[] {
  return request.cart_items.map((item) => {
    const modifiers: SnapshottedModifier[] = item.modifiers.map((modifier, index) => ({
      modifierId: modifier.modifier_id || `restored-${index}-${modifier.name}`,
      groupName: 'Options',
      name: modifier.name,
      priceSen: modifier.price_sen,
      type: modifier.type,
    }))

    return {
      cartLineId: crypto.randomUUID(),
      productId: item.product_id,
      productName: item.product_name,
      brandId: item.brand_id,
      brandName: brands.find((brand) => brand.id === item.brand_id)?.name ?? '—',
      categoryId: item.category_id,
      categoryName: categories.find((category) => category.id === item.category_id)?.name ?? '—',
      quantity: item.quantity,
      unitPriceSen: item.unit_price_sen,
      modifiers,
      discountSen: item.discount_sen,
    }
  })
}

/** Convert an edited cart back to the wire shape a correction carries. */
export function requestItemsFromCart(cart: readonly CartLine[]): CheckoutCartItemRequest[] {
  return cart.map((line) => ({
    product_id: line.productId,
    product_name: line.productName,
    brand_id: line.brandId,
    category_id: line.categoryId,
    quantity: line.quantity,
    unit_price_sen: line.unitPriceSen,
    modifier_total_sen: line.modifiers.reduce((sum, modifier) => sum + modifier.priceSen, 0),
    discount_sen: Math.min(line.discountSen, lineGrossSen(line)),
    modifiers: line.modifiers.map((modifier) => ({
      modifier_id: modifier.modifierId,
      name: modifier.name,
      price_sen: modifier.priceSen,
      type: modifier.type,
    })),
  }))
}

export type ExchangePlan = {
  /** What the customer paid originally. */
  originalSen: number
  /** What the amended ticket comes to. */
  replacementSen: number
  /** Positive: the customer owes more. Negative: money goes back to them. */
  deltaSen: number
  brandDeltas: BrandDelta[]
  replacementItems: CheckoutCartItemRequest[]
  replacementCartDiscountSen: number
  /** True even for a same-price product or modifier swap. */
  ticketChanged: boolean
}

function comparableItems(items: readonly CheckoutCartItemRequest[]): string {
  return JSON.stringify(
    items.map((item) => ({
      product_id: item.product_id,
      product_name: item.product_name,
      brand_id: item.brand_id,
      category_id: item.category_id,
      quantity: item.quantity,
      unit_price_sen: item.unit_price_sen,
      modifier_total_sen: item.modifier_total_sen,
      discount_sen: item.discount_sen,
      modifiers: item.modifiers,
    })),
  )
}

/**
 * Work out an exchange before it is committed, so the cashier sees the exact
 * figure to collect or refund and the brand attribution is fixed at the same
 * moment as the amount.
 */
export function planExchange(
  original: FinalizeCheckoutRequest,
  editedCart: readonly CartLine[],
  editedCartDiscountSen: number,
  brandName: (brandId: string) => string,
): ExchangePlan {
  const replacementItems = requestItemsFromCart(editedCart)
  const totals = calculateCartTotals([...editedCart], editedCartDiscountSen)
  const replacement: FinalizeCheckoutRequest = {
    ...original,
    cart_discount_sen: totals.cartDiscountSen,
    cart_items: replacementItems,
  }

  const before = brandNetsFromRequest(original)
  const after = brandNetsFromRequest(replacement)
  const originalSen = requestNetSen(original)
  const replacementSen = requestNetSen(replacement)

  return {
    originalSen,
    replacementSen,
    deltaSen: replacementSen - originalSen,
    brandDeltas: brandDeltas(before, after, brandName),
    replacementItems,
    replacementCartDiscountSen: totals.cartDiscountSen,
    ticketChanged:
      totals.cartDiscountSen !== original.cart_discount_sen ||
      comparableItems(replacementItems) !== comparableItems(original.cart_items),
  }
}

/**
 * Rebuild the ticket that currently exists after its correction history.
 *
 * Each exchange stores a full replacement snapshot, so a later edit starts from
 * the last amended ticket instead of replaying the original sale. Corrections
 * are expected oldest-first, matching the durable queue.
 */
export function requestAfterCorrections(
  original: FinalizeCheckoutRequest,
  corrections: readonly SaleCorrection[],
): FinalizeCheckoutRequest {
  let current = original

  for (const correction of corrections) {
    if (correction.kind !== 'EXCHANGE' || correction.replacementItems === null) continue
    current = {
      ...current,
      cart_discount_sen:
        correction.replacementCartDiscountSen ?? current.cart_discount_sen,
      cart_items: correction.replacementItems,
    }
  }

  return current
}

/**
 * What a sale currently stands at, after every correction already made against it.
 *
 * A sale that has been exchanged down is no longer worth what it was rung up
 * at, so this — not the original request — is what a later cancel has to reverse.
 */
export function outstandingBrandNets(
  original: FinalizeCheckoutRequest,
  priorCorrections: readonly SaleCorrection[],
): Map<string, number> {
  const nets = new Map(brandNetsFromRequest(original))
  for (const correction of priorCorrections) {
    for (const delta of correction.brandDeltas) {
      nets.set(delta.brandId, (nets.get(delta.brandId) ?? 0) + delta.deltaSen)
    }
  }
  return nets
}

/** What the customer is still out of pocket for, after prior corrections. */
export function outstandingSen(
  original: FinalizeCheckoutRequest,
  priorCorrections: readonly SaleCorrection[],
): number {
  let total = 0
  for (const net of outstandingBrandNets(original, priorCorrections).values()) total += net
  return total
}

/**
 * A full reversal: every brand gives back exactly what it is still holding.
 *
 * Deliberately reverses the **outstanding** amount rather than the original
 * total. Cancelling a sale that was already exchanged down would otherwise
 * refund the customer the difference a second time — the original figure is no
 * longer what they are owed.
 */
export function planCancel(
  original: FinalizeCheckoutRequest,
  priorCorrections: readonly SaleCorrection[],
  brandName: (brandId: string) => string,
): { deltaSen: number; brandDeltas: BrandDelta[] } {
  const before = outstandingBrandNets(original, priorCorrections)
  return {
    deltaSen: -outstandingSen(original, priorCorrections),
    brandDeltas: brandDeltas(before, new Map(), brandName),
  }
}

export const CANCEL_REASONS = [
  'Customer cancelled after paying',
  'Wrong item rung up',
  'Duplicate order',
  'Payment never arrived',
] as const

export const EXCHANGE_REASONS = [
  'Swapped for a different item',
  'Wrong size or options',
  'Discount missed at checkout',
  'Item out of stock after paying',
] as const
