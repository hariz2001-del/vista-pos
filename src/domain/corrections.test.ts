import { describe, expect, it } from 'vitest'
import {
  brandNetsFromRequest,
  cartLinesFromRequest,
  planCancel,
  planExchange,
  requestAfterCorrections,
  requestNetSen,
  requestItemsFromCart,
} from './corrections'
import type {
  CartLine,
  CheckoutCartItemRequest,
  FinalizeCheckoutRequest,
  SaleCorrection,
} from './types'

const BRANDS = [
  { id: 'brand-food', name: 'Food', colour: '#e2601f', softColour: '#fde8dc' },
  { id: 'brand-drinks', name: 'Drinks', colour: '#0a8fa0', softColour: '#d9f1f4' },
]

const CATEGORIES = [
  { id: 'cat-nasi', name: 'Nasi', brandId: 'brand-food' },
  { id: 'cat-kopi', name: 'Kopi', brandId: 'brand-drinks' },
]

const brandName = (brandId: string) =>
  BRANDS.find((brand) => brand.id === brandId)?.name ?? 'unknown'

function item(overrides: Partial<CheckoutCartItemRequest> = {}): CheckoutCartItemRequest {
  return {
    product_id: 'product-food',
    product_name: 'Nasi Lemak',
    brand_id: 'brand-food',
    category_id: 'cat-nasi',
    quantity: 1,
    unit_price_sen: 1200,
    modifier_total_sen: 0,
    discount_sen: 0,
    modifiers: [],
    ...overrides,
  }
}

function request(
  items: CheckoutCartItemRequest[],
  cartDiscountSen = 0,
): FinalizeCheckoutRequest {
  return {
    shift_id: 'shift-1',
    client_txn_id: 'txn-1',
    business_date: '2026-09-11',
    cart_discount_sen: cartDiscountSen,
    cart_items: items,
  }
}

const DRINK = item({
  product_id: 'product-drink',
  product_name: 'Kopi O',
  brand_id: 'brand-drinks',
  category_id: 'cat-kopi',
  unit_price_sen: 550,
})

describe('brand nets', () => {
  it('apportions the order discount so the brand parts sum to the charged total', () => {
    // 1200 + 550 = 1750, less 333 order discount = 1417.
    const sale = request([item(), DRINK], 333)
    const nets = brandNetsFromRequest(sale)
    const sum = [...nets.values()].reduce((total, value) => total + value, 0)

    expect(sum).toBe(1417)
    expect(requestNetSen(sale)).toBe(1417)
    // No brand absorbs more than its own value — the rounding cannot push one negative.
    expect(nets.get('brand-food')).toBeGreaterThan(0)
    expect(nets.get('brand-drinks')).toBeGreaterThan(0)
  })

  it('reads the prices the sale was charged at, not any later menu', () => {
    // An offline sale carries the cached price it charged. Nothing here consults a
    // catalogue, so a menu change afterwards cannot move a historical figure.
    const sale = request([item({ unit_price_sen: 750 })])
    expect(requestNetSen(sale)).toBe(750)
  })

  it('never lets a line discount push a line below zero', () => {
    const sale = request([item({ unit_price_sen: 500, discount_sen: 900 })])
    expect(requestNetSen(sale)).toBe(0)
  })
})

describe('cancel', () => {
  it('reverses the whole sale and attributes every sen back to its brand', () => {
    const sale = request([item(), DRINK], 333)
    const plan = planCancel(sale, [], brandName)

    expect(plan.deltaSen).toBe(-1417)
    const sum = plan.brandDeltas.reduce((total, delta) => total + delta.deltaSen, 0)
    expect(sum).toBe(plan.deltaSen)
    // Both brands give back, neither collects.
    expect(plan.brandDeltas.every((delta) => delta.deltaSen < 0)).toBe(true)
    expect(plan.brandDeltas.map((delta) => delta.brandName).sort()).toEqual(['Drinks', 'Food'])
  })

  it('reverses only the value still outstanding after an earlier exchange', () => {
    const sale = request([item()])
    const exchange = planExchange(
      sale,
      cartLinesFromRequest(sale, BRANDS, CATEGORIES).map((line) => ({
        ...line,
        unitPriceSen: 900,
      })),
      0,
      brandName,
    )
    const prior: SaleCorrection = {
      clientTxnId: 'correction-1',
      correctionId: 'server-correction-1',
      originalClientTxnId: sale.client_txn_id,
      originalQueueLabel: '#001',
      kind: 'EXCHANGE',
      reason: 'Swapped for a different item',
      deltaSen: exchange.deltaSen,
      brandDeltas: exchange.brandDeltas,
      replacementItems: exchange.replacementItems,
      replacementCartDiscountSen: exchange.replacementCartDiscountSen,
      shiftId: sale.shift_id,
      businessDate: sale.business_date,
      createdAt: '2026-09-11T12:00:00.000Z',
      syncStatus: 'SYNCED',
    }

    const cancel = planCancel(sale, [prior], brandName)

    expect(exchange.deltaSen).toBe(-300)
    expect(cancel.deltaSen).toBe(-900)
    expect(cancel.brandDeltas).toEqual([
      { brandId: 'brand-food', brandName: 'Food', deltaSen: -900 },
    ])
  })
})

describe('exchange', () => {
  function cartOf(sale: FinalizeCheckoutRequest): CartLine[] {
    return cartLinesFromRequest(sale, BRANDS, CATEGORIES)
  }

  it('attributes a removal to the brand that actually gave the value back', () => {
    const sale = request([item(), DRINK])
    const cart = cartOf(sale)
    // Drop the Food line; the drink stays.
    const edited = cart.filter((line) => line.brandId !== 'brand-food')

    const plan = planExchange(sale, edited, 0, brandName)

    expect(plan.originalSen).toBe(1750)
    expect(plan.replacementSen).toBe(550)
    expect(plan.deltaSen).toBe(-1200)
    expect(plan.brandDeltas).toEqual([
      { brandId: 'brand-food', brandName: 'Food', deltaSen: -1200 },
    ])
  })

  it('shows a swap across brands as two entries that sum to the difference', () => {
    const sale = request([item()]) // one Food item, 1200
    const edited: CartLine[] = cartOf(request([DRINK])) // swapped for a 550 drink

    const plan = planExchange(sale, edited, 0, brandName)

    expect(plan.deltaSen).toBe(-650)
    const sum = plan.brandDeltas.reduce((total, delta) => total + delta.deltaSen, 0)
    expect(sum).toBe(plan.deltaSen)
    expect(plan.brandDeltas).toEqual([
      { brandId: 'brand-food', brandName: 'Food', deltaSen: -1200 },
      { brandId: 'brand-drinks', brandName: 'Drinks', deltaSen: 550 },
    ])
  })

  it('gives a positive difference when the amended ticket is worth more', () => {
    const sale = request([item()])
    const cart = cartOf(sale)
    const edited = cart.map((line) => ({ ...line, quantity: 2 }))

    const plan = planExchange(sale, edited, 0, brandName)

    expect(plan.deltaSen).toBe(1200)
    expect(plan.brandDeltas).toEqual([
      { brandId: 'brand-food', brandName: 'Food', deltaSen: 1200 },
    ])
  })

  it('handles a discount that was missed at checkout', () => {
    const sale = request([item(), DRINK])
    const plan = planExchange(sale, cartOf(sale), 500, brandName)

    expect(plan.deltaSen).toBe(-500)
    const sum = plan.brandDeltas.reduce((total, delta) => total + delta.deltaSen, 0)
    expect(sum).toBe(-500)
  })

  it('reports no difference when nothing material changed', () => {
    const sale = request([item(), DRINK], 333)
    const plan = planExchange(sale, cartOf(sale), 333, brandName)

    expect(plan.deltaSen).toBe(0)
    expect(plan.brandDeltas).toEqual([])
    expect(plan.ticketChanged).toBe(false)
  })

  it('still records a same-price item swap', () => {
    const sale = request([item()])
    const edited = cartOf(
      request([
        item({
          product_id: 'another-food-product',
          product_name: 'Nasi Goreng',
        }),
      ]),
    )

    const plan = planExchange(sale, edited, 0, brandName)

    expect(plan.deltaSen).toBe(0)
    expect(plan.brandDeltas).toEqual([])
    expect(plan.ticketChanged).toBe(true)
  })

  it('starts a later edit from the most recent replacement ticket', () => {
    const sale = request([item()])
    const firstPlan = planExchange(
      sale,
      cartOf(sale).map((line) => ({ ...line, quantity: 2 })),
      100,
      brandName,
    )
    const firstCorrection: SaleCorrection = {
      clientTxnId: 'correction-1',
      correctionId: 'server-correction-1',
      originalClientTxnId: sale.client_txn_id,
      originalQueueLabel: '#001',
      kind: 'EXCHANGE',
      reason: 'Wrong item rung up',
      deltaSen: firstPlan.deltaSen,
      brandDeltas: firstPlan.brandDeltas,
      replacementItems: firstPlan.replacementItems,
      replacementCartDiscountSen: firstPlan.replacementCartDiscountSen,
      shiftId: sale.shift_id,
      businessDate: sale.business_date,
      createdAt: '2026-09-11T12:00:00.000Z',
      syncStatus: 'SYNCED',
    }

    const current = requestAfterCorrections(sale, [firstCorrection])

    expect(current.cart_items[0]?.quantity).toBe(2)
    expect(current.cart_discount_sen).toBe(100)
    expect(requestNetSen(current)).toBe(firstPlan.replacementSen)
  })
})

describe('round-tripping a ticket', () => {
  it('rebuilds the same money after a request to cart and back', () => {
    const sale = request(
      [
        item({
          modifier_total_sen: 200,
          modifiers: [
            { modifier_id: 'modifier-sambal', name: 'Extra Sambal', price_sen: 200, type: 'ADD_ON' },
          ],
          discount_sen: 150,
        }),
        DRINK,
      ],
      333,
    )

    const rebuilt = request(requestItemsFromCart(cartLinesFromRequest(sale, BRANDS, CATEGORIES)), 333)

    expect(requestNetSen(rebuilt)).toBe(requestNetSen(sale))
    expect([...brandNetsFromRequest(rebuilt).entries()]).toEqual([
      ...brandNetsFromRequest(sale).entries(),
    ])
  })
})
