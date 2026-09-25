import { assertSen } from './money'
import type { BrandDiscountShare, CartLine, CartTotals } from './types'

export function modifierUnitTotalSen(line: CartLine): number {
  return line.modifiers.reduce(
    (total, modifier) => total + assertSen(modifier.priceSen, 'modifier price'),
    0,
  )
}

export function lineGrossSen(line: CartLine): number {
  return (line.unitPriceSen + modifierUnitTotalSen(line)) * line.quantity
}

/** Item discount actually applied, capped so a single line can never go negative. */
export function lineDiscountSen(line: CartLine): number {
  return Math.min(line.discountSen, lineGrossSen(line))
}

export function calculateCartTotals(
  lines: CartLine[],
  requestedCartDiscountSen: number,
): CartTotals {
  assertSen(requestedCartDiscountSen, 'cart discount')

  let subtotalSen = 0
  let itemDiscountSen = 0
  let itemCount = 0

  for (const line of lines) {
    assertSen(line.unitPriceSen, 'unit price')
    assertSen(line.discountSen, 'item discount')
    assertSen(line.quantity, 'quantity')

    const grossSen = lineGrossSen(line)
    subtotalSen += grossSen
    itemDiscountSen += Math.min(line.discountSen, grossSen)
    itemCount += line.quantity
  }

  const afterItemDiscountsSen = subtotalSen - itemDiscountSen
  const cartDiscountSen = Math.min(requestedCartDiscountSen, afterItemDiscountsSen)
  const discountSen = itemDiscountSen + cartDiscountSen

  return {
    subtotalSen,
    itemDiscountSen,
    cartDiscountSen,
    discountSen,
    netTotalSen: subtotalSen - discountSen,
    itemCount,
  }
}

/**
 * Split `amountSen` across `bases` in proportion, so the parts sum to the whole
 * exactly.
 *
 * Largest remainder rather than dumping the residual on the last entry: both sum
 * exactly, but largest-remainder also guarantees no entry receives more than its
 * own share rounded up, so nothing can be pushed negative by the rounding.
 *
 * Shared by the discount split and the correction split so the money a refund
 * attributes to a brand is apportioned by the same rule as the sale was.
 */
export function apportionByLargestRemainder(
  amountSen: number,
  bases: readonly number[],
): number[] {
  const totalBaseSen = bases.reduce((sum, base) => sum + base, 0)
  const exact = bases.map((base) => (totalBaseSen === 0 ? 0 : (amountSen * base) / totalBaseSen))
  const shares = exact.map(Math.floor)
  let allocated = shares.reduce((sum, share) => sum + share, 0)

  const byRemainder = exact
    .map((value, index) => ({ index, remainder: value - Math.floor(value) }))
    .sort((a, b) => b.remainder - a.remainder || a.index - b.index)

  for (const { index } of byRemainder) {
    if (allocated >= amountSen) break
    shares[index] = (shares[index] ?? 0) + 1
    allocated += 1
  }

  return shares
}

export function maxDiscountForLine(line: CartLine): number {
  return lineGrossSen(line)
}

/**
 * Attribute every sen of discount to a brand, so the RMS can report net sales by
 * brand and allocate partner profit shares without double-counting.
 *
 * Line discounts belong to their own line's brand. The cart-wide discount is
 * apportioned across brands and must sum back to the cart discount exactly —
 * a fractional sen of drift here becomes a permanent reporting error.
 *
 * Two deliberate choices:
 *
 * 1. Apportionment is by each brand's value *after* its own line discounts, not
 *    by raw gross. Splitting on raw gross can hand a brand more cart discount
 *    than it has value left — give away a Food item entirely with a line
 *    discount, then apply a cart discount, and Food's net sales would go
 *    negative while Drinks under-absorbed.
 *
 * 2. The residual is settled by the largest-remainder method rather than by
 *    dumping it on the last brand. Both sum exactly, but largest-remainder also
 *    guarantees no brand receives more than its own remaining value.
 */
export function splitDiscountByBrand(
  lines: CartLine[],
  requestedCartDiscountSen: number,
): BrandDiscountShare[] {
  assertSen(requestedCartDiscountSen, 'cart discount')

  type Accumulator = {
    brandId: string
    brandName: string
    grossSen: number
    itemDiscountSen: number
  }

  // Insertion-ordered so the output is stable across renders.
  const byBrand = new Map<string, Accumulator>()

  for (const line of lines) {
    const existing = byBrand.get(line.brandId) ?? {
      brandId: line.brandId,
      brandName: line.brandName,
      grossSen: 0,
      itemDiscountSen: 0,
    }
    existing.grossSen += lineGrossSen(line)
    existing.itemDiscountSen += lineDiscountSen(line)
    byBrand.set(line.brandId, existing)
  }

  const brands = [...byBrand.values()]
  const bases = brands.map((brand) => brand.grossSen - brand.itemDiscountSen)
  const totalBaseSen = bases.reduce((sum, base) => sum + base, 0)
  const cartDiscountSen = Math.min(requestedCartDiscountSen, totalBaseSen)
  const shares = apportionByLargestRemainder(cartDiscountSen, bases)

  return brands.map((brand, index) => {
    const cartShareSen = shares[index] ?? 0
    return {
      brandId: brand.brandId,
      brandName: brand.brandName,
      grossSen: brand.grossSen,
      itemDiscountSen: brand.itemDiscountSen,
      cartDiscountSen: cartShareSen,
      discountSen: brand.itemDiscountSen + cartShareSen,
      netSen: brand.grossSen - brand.itemDiscountSen - cartShareSen,
    }
  })
}
