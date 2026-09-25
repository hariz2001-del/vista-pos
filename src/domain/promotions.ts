/**
 * Promotions: discount presets the owner sets up in the RMS, each over a range
 * of trading days. At the counter a promo only works out a discount amount;
 * the sale records that amount like any other discount, and the server checks
 * it the same way.
 */

export type Promotion = {
  id: string
  name: string
  /** PERCENT: `value` is 1–100. AMOUNT: `value` is sen off. */
  kind: 'PERCENT' | 'AMOUNT'
  value: number
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

/**
 * What a promo takes off `baseSen` — an item's total or the order's. A
 * percentage rounds down to the sen, so the customer is never charged less
 * than the promo promised to the owner's cost by a rounding sen; a fixed
 * amount never takes off more than there is.
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
