import { lineGrossSen, modifierUnitTotalSen } from './cart'
import type { CartLine } from './types'

/**
 * Promotions: discounts the owner sets up in the RMS, each over a range of
 * trading days.
 *
 *  - ORDER: off the whole order. Either the cashier picks it from the
 *    discount screen, or (`autoApply`) it goes on every order by itself.
 *  - ITEMS: off any item matching one of its targets — a product or a whole
 *    category. Applies by itself.
 *  - COMBO: off a set bought together, every target in its quantity. Applies
 *    by itself.
 *
 * `limit` says whether an automatic promo applies to every match (EACH) or
 * once per receipt. The counter works the amounts out here and records them
 * as ordinary discounts; the server checks them like any other.
 */

export type PromotionTarget = {
  productId: string | null
  categoryId: string | null
  quantity: number
}

export type Promotion = {
  id: string
  name: string
  /** PERCENT: `value` is 1–100. AMOUNT: `value` is sen off. */
  kind: 'PERCENT' | 'AMOUNT'
  value: number
  /** Absent in data from an older server: a whole-order, cashier-picked promo. */
  scope?: 'ORDER' | 'ITEMS' | 'COMBO'
  autoApply?: boolean
  limit?: 'EACH' | 'ONCE_PER_ORDER'
  targets?: PromotionTarget[]
  /** First trading day, `YYYY-MM-DD`. */
  startsOn: string
  /** Last trading day, inclusive; null runs until switched off. */
  endsOn: string | null
}

/** The promos running on one trading day — the shift's, not the calendar's. */
export function promotionsOn(promotions: Promotion[], businessDate: string): Promotion[] {
  return promotions.filter(
    (promotion) =>
      promotion.startsOn <= businessDate && (promotion.endsOn === null || promotion.endsOn >= businessDate),
  )
}

/** A promo the cashier picks from the discount screen: a whole-order one that does not apply itself. */
export function isPickable(promotion: Promotion): boolean {
  return (promotion.scope ?? 'ORDER') === 'ORDER' && !promotion.autoApply
}

/** A promo that applies itself when the order qualifies. */
export function isAutomatic(promotion: Promotion): boolean {
  const scope = promotion.scope ?? 'ORDER'
  return scope !== 'ORDER' || promotion.autoApply === true
}

/**
 * What a promo takes off `baseSen`. A percentage rounds down to the sen; a
 * fixed amount never takes off more than there is.
 */
export function promotionAmountSen(promotion: Pick<Promotion, 'kind' | 'value'>, baseSen: number): number {
  if (baseSen <= 0) return 0
  if (promotion.kind === 'PERCENT') {
    const percent = Math.min(Math.max(promotion.value, 0), 100)
    return Math.floor((baseSen * percent) / 100)
  }
  return Math.min(Math.max(promotion.value, 0), baseSen)
}

/** "10% off", "RM 2.00 off". */
export function describePromotion(promotion: Pick<Promotion, 'kind' | 'value'>): string {
  if (promotion.kind === 'PERCENT') return `${promotion.value}% off`
  return `RM ${(promotion.value / 100).toFixed(2)} off`
}

// ---------------------------------------------------------------------------
// Automatic promotions on an order
// ---------------------------------------------------------------------------

export type AppliedPromotion = {
  promotionId: string
  name: string
  amountSen: number
}

export type PromotedOrder = {
  /** The lines with their discounts: the cashier's own where set, otherwise the promos'. */
  lines: CartLine[]
  /** The order discount: the cashier's own if set, otherwise an automatic whole-order promo's. */
  cartDiscountSen: number
  /** Automatic promos that took something off, for the order panel to show and offer to remove. */
  applied: AppliedPromotion[]
}

/** One unit of one line — a line of 3 coffees is 3 units, each usable by a different promo. */
type Unit = { line: number; valueSen: number; productId: string; categoryId: string; used: boolean }

function matches(target: PromotionTarget, unit: Unit): boolean {
  return target.productId !== null ? target.productId === unit.productId : target.categoryId === unit.categoryId
}

/**
 * Split `totalSen` across `weights` in proportion, by largest remainder, so the
 * parts always add up to exactly the total.
 */
function apportion(totalSen: number, weights: number[]): number[] {
  const sum = weights.reduce((total, weight) => total + weight, 0)
  if (sum <= 0) return weights.map(() => 0)
  const exact = weights.map((weight) => (totalSen * weight) / sum)
  const floors = exact.map(Math.floor)
  let left = totalSen - floors.reduce((total, part) => total + part, 0)
  const order = exact.map((value, index) => ({ index, remainder: value - Math.floor(value) }))
    .toSorted((a, b) => b.remainder - a.remainder || a.index - b.index)
  for (const { index } of order) {
    if (left <= 0) break
    floors[index] = (floors[index] ?? 0) + 1
    left -= 1
  }
  return floors
}

/** Take one combo out of the free units, highest-value units first. Null when it cannot be made. */
function takeCombo(targets: PromotionTarget[], units: Unit[]): Unit[] | null {
  // Named items before whole categories, so a category never takes the one
  // specific item the combo also needs.
  const ordered = targets.toSorted((a, b) => Number(a.productId === null) - Number(b.productId === null))
  const taken: Unit[] = []
  for (const target of ordered) {
    const free = units
      .filter((unit) => !unit.used && !taken.includes(unit) && matches(target, unit))
      .toSorted((a, b) => b.valueSen - a.valueSen)
    if (free.length < target.quantity) return null
    taken.push(...free.slice(0, target.quantity))
  }
  return taken
}

/**
 * Work out the automatic promos on an order.
 *
 * Each unit of an item gets at most one automatic promo: combos are made first,
 * then item promos go on what is left, each unit taking whichever saves the
 * customer most. An automatic whole-order promo then comes off what remains —
 * the best one, if several run. A discount the cashier set by hand always
 * wins: that line, or the order discount, is left alone. `removed` holds promos
 * the cashier took off this order.
 *
 * A combo's discount is shared across the items in it by their value, so on a
 * two-brand stall each brand bears its share, as with any order discount.
 */
export function applyPromotions(
  lines: CartLine[],
  manualCartDiscountSen: number,
  running: Promotion[],
  removed: ReadonlySet<string> = new Set(),
): PromotedOrder {
  const automatic = running.filter((promotion) => isAutomatic(promotion) && !removed.has(promotion.id))
  const auto = lines.map(() => 0)
  const appliedSen = new Map<string, number>()
  const credit = (promotion: Promotion, amountSen: number) =>
    appliedSen.set(promotion.id, (appliedSen.get(promotion.id) ?? 0) + amountSen)

  // Only lines the cashier has not discounted by hand take part.
  const units: Unit[] = []
  lines.forEach((line, index) => {
    if (line.discountSen > 0) return
    const valueSen = line.unitPriceSen + modifierUnitTotalSen(line)
    for (let n = 0; n < line.quantity; n += 1) {
      units.push({ line: index, valueSen, productId: line.productId, categoryId: line.categoryId, used: false })
    }
  })

  // 1. Combos, the one that saves most per combo first.
  const combos = automatic
    .filter((promotion) => promotion.scope === 'COMBO' && (promotion.targets?.length ?? 0) > 0)
    .map((promotion) => {
      const sample = takeCombo(promotion.targets ?? [], units)
      const value = sample ? sample.reduce((sum, unit) => sum + unit.valueSen, 0) : 0
      return { promotion, saving: promotionAmountSen(promotion, value) }
    })
    .toSorted((a, b) => b.saving - a.saving)

  for (const { promotion } of combos) {
    const limit = promotion.limit === 'ONCE_PER_ORDER' ? 1 : Number.POSITIVE_INFINITY
    for (let made = 0; made < limit; made += 1) {
      const combo = takeCombo(promotion.targets ?? [], units)
      if (!combo) break
      const valueSen = combo.reduce((sum, unit) => sum + unit.valueSen, 0)
      const amountSen = promotionAmountSen(promotion, valueSen)
      const shares = apportion(amountSen, combo.map((unit) => unit.valueSen))
      combo.forEach((unit, index) => {
        unit.used = true
        auto[unit.line] = (auto[unit.line] ?? 0) + (shares[index] ?? 0)
      })
      if (amountSen > 0) credit(promotion, amountSen)
    }
  }

  // 2. Item promos, unit by unit, biggest saving first.
  const itemPromos = automatic.filter((promotion) => promotion.scope === 'ITEMS')
  const candidates = units
    .filter((unit) => !unit.used)
    .flatMap((unit) =>
      itemPromos
        .filter((promotion) => (promotion.targets ?? []).some((target) => matches(target, unit)))
        .map((promotion) => ({ unit, promotion, amountSen: promotionAmountSen(promotion, unit.valueSen) })),
    )
    .filter((candidate) => candidate.amountSen > 0)
    .toSorted((a, b) => b.amountSen - a.amountSen)
  const usedOnce = new Set<string>()
  for (const { unit, promotion, amountSen } of candidates) {
    if (unit.used) continue
    if (promotion.limit === 'ONCE_PER_ORDER') {
      if (usedOnce.has(promotion.id)) continue
      usedOnce.add(promotion.id)
    }
    unit.used = true
    auto[unit.line] = (auto[unit.line] ?? 0) + amountSen
    credit(promotion, amountSen)
  }

  const promoted = lines.map((line, index) =>
    line.discountSen > 0 ? line : { ...line, discountSen: Math.min(auto[index] ?? 0, lineGrossSen(line)) },
  )

  // 3. An automatic whole-order promo on what is left — unless the cashier set their own.
  let cartDiscountSen = manualCartDiscountSen
  if (manualCartDiscountSen === 0) {
    const leftSen = promoted.reduce((sum, line) => sum + lineGrossSen(line) - Math.min(line.discountSen, lineGrossSen(line)), 0)
    const best = automatic
      .filter((promotion) => (promotion.scope ?? 'ORDER') === 'ORDER')
      .map((promotion) => ({ promotion, amountSen: promotionAmountSen(promotion, leftSen) }))
      .toSorted((a, b) => b.amountSen - a.amountSen)[0]
    if (best && best.amountSen > 0) {
      cartDiscountSen = best.amountSen
      credit(best.promotion, best.amountSen)
    }
  }

  const applied = running
    .filter((promotion) => (appliedSen.get(promotion.id) ?? 0) > 0)
    .map((promotion) => ({ promotionId: promotion.id, name: promotion.name, amountSen: appliedSen.get(promotion.id) ?? 0 }))

  return { lines: promoted, cartDiscountSen, applied }
}
