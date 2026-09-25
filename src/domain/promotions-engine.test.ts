import { describe, expect, it } from 'vitest'
import { calculateCartTotals } from './cart'
import { applyPromotions, isAutomatic, isPickable, type Promotion } from './promotions'
import type { CartLine } from './types'

const TODAY = { startsOn: '2026-01-01', endsOn: null }

function line(productId: string, categoryId: string, unitPriceSen: number, quantity = 1, extra: Partial<CartLine> = {}): CartLine {
  return {
    cartLineId: `${productId}-${quantity}-${unitPriceSen}`,
    productId,
    productName: productId,
    brandId: categoryId === 'drinks' ? 'brand-drinks' : 'brand-food',
    brandName: '',
    categoryId,
    categoryName: categoryId,
    quantity,
    unitPriceSen,
    modifiers: [],
    discountSen: 0,
    ...extra,
  }
}

const promo = (id: string, fields: Partial<Promotion>): Promotion => ({
  id,
  name: id,
  kind: 'PERCENT',
  value: 10,
  ...TODAY,
  ...fields,
})

const discounts = (result: ReturnType<typeof applyPromotions>) => result.lines.map((l) => l.discountSen)

describe('which promos apply by themselves', () => {
  it('item and combo promos always do; a whole-order one only when set to', () => {
    expect(isAutomatic(promo('a', { scope: 'ITEMS' }))).toBe(true)
    expect(isAutomatic(promo('b', { scope: 'COMBO' }))).toBe(true)
    expect(isAutomatic(promo('c', { scope: 'ORDER', autoApply: true }))).toBe(true)
    expect(isAutomatic(promo('d', { scope: 'ORDER', autoApply: false }))).toBe(false)
    expect(isPickable(promo('d', { scope: 'ORDER' }))).toBe(true)
    // From an older server: no scope at all means a cashier-picked whole-order promo.
    expect(isPickable(promo('old', {}))).toBe(true)
  })
})

describe('item promos', () => {
  const kopi = line('kopi', 'coffee', 500, 3)
  const nasi = line('nasi', 'rice', 1200)

  it('take off every matching unit, by item or by category', () => {
    const byItem = applyPromotions([kopi, nasi], 0, [
      promo('kopi-1', { scope: 'ITEMS', kind: 'AMOUNT', value: 100, targets: [{ productId: 'kopi', categoryId: null, quantity: 1 }] }),
    ])
    expect(discounts(byItem)).toEqual([300, 0])
    expect(byItem.applied).toEqual([{ promotionId: 'kopi-1', name: 'kopi-1', amountSen: 300 }])

    const byCategory = applyPromotions([kopi, nasi], 0, [
      promo('rice-10', { scope: 'ITEMS', targets: [{ productId: null, categoryId: 'rice', quantity: 1 }] }),
    ])
    expect(discounts(byCategory)).toEqual([0, 120])
  })

  it('take off one unit only when limited to once per receipt — the one saving most', () => {
    const result = applyPromotions([line('kopi', 'coffee', 500, 2), line('latte', 'coffee', 900)], 0, [
      promo('once', { scope: 'ITEMS', limit: 'ONCE_PER_ORDER', targets: [{ productId: null, categoryId: 'coffee', quantity: 1 }] }),
    ])
    expect(discounts(result)).toEqual([0, 90])
  })

  it('give each unit only the best promo, never two', () => {
    const result = applyPromotions([kopi], 0, [
      promo('ten', { scope: 'ITEMS', targets: [{ productId: 'kopi', categoryId: null, quantity: 1 }] }),
      promo('rm2', { scope: 'ITEMS', kind: 'AMOUNT', value: 200, targets: [{ productId: null, categoryId: 'coffee', quantity: 1 }] }),
    ])
    expect(discounts(result)).toEqual([600])
    expect(result.applied.map((a) => a.promotionId)).toEqual(['rm2'])
  })
})

describe('combos', () => {
  const comboPromo = (limit: 'EACH' | 'ONCE_PER_ORDER') =>
    promo('set', {
      scope: 'COMBO',
      kind: 'AMOUNT',
      value: 200,
      limit,
      targets: [
        { productId: 'nasi', categoryId: null, quantity: 1 },
        { productId: null, categoryId: 'drinks', quantity: 1 },
      ],
    })

  it('apply when every part is in the order, and not before', () => {
    expect(applyPromotions([line('nasi', 'rice', 1200)], 0, [comboPromo('EACH')]).applied).toEqual([])
    const result = applyPromotions([line('nasi', 'rice', 1200), line('teh', 'drinks', 400)], 0, [comboPromo('EACH')])
    expect(result.applied).toEqual([{ promotionId: 'set', name: 'set', amountSen: 200 }])
    // Shared by value: 1200 : 400 → 150 and 50, so each brand bears its share.
    expect(discounts(result)).toEqual([150, 50])
  })

  it('apply to every complete combo, or once per receipt', () => {
    const order = [line('nasi', 'rice', 1200, 2), line('teh', 'drinks', 400, 3)]
    expect(applyPromotions(order, 0, [comboPromo('EACH')]).applied[0]?.amountSen).toBe(400)
    expect(applyPromotions(order, 0, [comboPromo('ONCE_PER_ORDER')]).applied[0]?.amountSen).toBe(200)
  })

  it('need the quantity asked for', () => {
    const twoKopi = promo('pair', {
      scope: 'COMBO',
      kind: 'PERCENT',
      value: 50,
      targets: [{ productId: 'kopi', categoryId: null, quantity: 2 }],
    })
    expect(applyPromotions([line('kopi', 'coffee', 500)], 0, [twoKopi]).applied).toEqual([])
    const three = applyPromotions([line('kopi', 'coffee', 500, 3)], 0, [twoKopi])
    // One pair at 50% of RM 10.00; the third coffee is left alone.
    expect(three.applied[0]?.amountSen).toBe(500)
  })

  it('come before item promos, and a unit in a combo gets nothing more', () => {
    const result = applyPromotions([line('nasi', 'rice', 1200), line('teh', 'drinks', 400, 2)], 0, [
      comboPromo('EACH'),
      promo('drinks-10', { scope: 'ITEMS', targets: [{ productId: null, categoryId: 'drinks', quantity: 1 }] }),
    ])
    // Combo: nasi + one teh (RM 2 → 150/50). The second teh gets the 10%: 40.
    expect(discounts(result)).toEqual([150, 90])
  })
})

describe('whole-order promos and the cashier', () => {
  const order = [line('nasi', 'rice', 1200), line('teh', 'drinks', 800)]

  it('an automatic whole-order promo comes off what is left after item promos', () => {
    const result = applyPromotions(order, 0, [
      promo('teh-rm2', { scope: 'ITEMS', kind: 'AMOUNT', value: 200, targets: [{ productId: 'teh', categoryId: null, quantity: 1 }] }),
      promo('store-10', { scope: 'ORDER', autoApply: true }),
    ])
    expect(discounts(result)).toEqual([0, 200])
    expect(result.cartDiscountSen).toBe(180)
    const totals = calculateCartTotals(result.lines, result.cartDiscountSen)
    expect(totals.netTotalSen).toBe(2000 - 200 - 180)
  })

  it('only the best automatic whole-order promo applies', () => {
    const result = applyPromotions(order, 0, [
      promo('five', { scope: 'ORDER', autoApply: true, value: 5 }),
      promo('rm3', { scope: 'ORDER', autoApply: true, kind: 'AMOUNT', value: 300 }),
    ])
    expect(result.cartDiscountSen).toBe(300)
    expect(result.applied.map((a) => a.promotionId)).toEqual(['rm3'])
  })

  it('a cashier-picked promo never applies by itself', () => {
    expect(applyPromotions(order, 0, [promo('pick', { scope: 'ORDER' })]).applied).toEqual([])
  })

  it('a discount the cashier typed in wins, on the line and on the order', () => {
    const typed = [line('nasi', 'rice', 1200, 1, { discountSen: 100 }), line('teh', 'drinks', 800)]
    const result = applyPromotions(typed, 250, [
      promo('all', { scope: 'ITEMS', targets: [{ productId: null, categoryId: 'rice', quantity: 1 }] }),
      promo('store', { scope: 'ORDER', autoApply: true }),
    ])
    expect(discounts(result)).toEqual([100, 0])
    expect(result.cartDiscountSen).toBe(250)
    expect(result.applied).toEqual([])
  })

  it('a promo the cashier removed stays off', () => {
    const result = applyPromotions(order, 0, [promo('store', { scope: 'ORDER', autoApply: true })], new Set(['store']))
    expect(result.cartDiscountSen).toBe(0)
    expect(result.applied).toEqual([])
  })

  it('never takes a line below zero', () => {
    const result = applyPromotions([line('kopi', 'coffee', 150)], 0, [
      promo('rm5', { scope: 'ITEMS', kind: 'AMOUNT', value: 500, targets: [{ productId: 'kopi', categoryId: null, quantity: 1 }] }),
    ])
    expect(discounts(result)).toEqual([150])
  })
})
