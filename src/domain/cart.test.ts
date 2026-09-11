import { describe, expect, it } from 'vitest'
import { calculateCartTotals, splitDiscountByBrand } from './cart'
import type { CartLine } from './types'

const FOOD: CartLine = {
  cartLineId: 'line-1',
  productId: 'product-1',
  productName: 'Test item',
  brandId: 'brand-food',
  brandName: 'Food',
  categoryId: 'cat-nasi',
  categoryName: 'Nasi',
  quantity: 2,
  unitPriceSen: 1200,
  modifiers: [
    { modifierId: 'extra', groupName: 'Add-ons', name: 'Extra', priceSen: 200, type: 'ADD_ON' },
    { modifierId: 'remove', groupName: 'Remove', name: 'No onion', priceSen: 0, type: 'REMOVAL' },
  ],
  discountSen: 300,
}

const DRINK: CartLine = {
  cartLineId: 'line-2',
  productId: 'product-2',
  productName: 'Test drink',
  brandId: 'brand-drinks',
  brandName: 'Drinks',
  categoryId: 'cat-kopi',
  categoryName: 'Kopi',
  quantity: 1,
  unitPriceSen: 550,
  modifiers: [],
  discountSen: 0,
}

/** Build a single-line cart with an exact gross, for rounding tests. */
function lineWorth(brandId: string, grossSen: number, discountSen = 0): CartLine {
  return {
    ...DRINK,
    cartLineId: `${brandId}-${grossSen}`,
    brandId,
    brandName: brandId,
    quantity: 1,
    unitPriceSen: grossSen,
    discountSen,
  }
}

describe('cart totals', () => {
  it('calculates items, add-ons and discounts in sen', () => {
    expect(calculateCartTotals([FOOD], 500)).toEqual({
      subtotalSen: 2800,
      itemDiscountSen: 300,
      cartDiscountSen: 500,
      discountSen: 800,
      netTotalSen: 2000,
      itemCount: 2,
    })
  })

  it('caps discounts so a transaction cannot become negative', () => {
    expect(calculateCartTotals([{ ...FOOD, discountSen: 9999 }], 9999).netTotalSen).toBe(0)
  })

  it('rejects floating-point modifier prices', () => {
    const invalidLine = {
      ...FOOD,
      modifiers: [{ ...FOOD.modifiers[0], priceSen: 199.5 }],
    }

    expect(() => calculateCartTotals([invalidLine], 0)).toThrow('modifier price')
  })
})

describe('brand discount attribution', () => {
  it('attributes a line discount to its own brand only', () => {
    const shares = splitDiscountByBrand([FOOD, DRINK], 0)

    expect(shares).toEqual([
      {
        brandId: 'brand-food',
        brandName: 'Food',
        grossSen: 2800,
        itemDiscountSen: 300,
        cartDiscountSen: 0,
        discountSen: 300,
        netSen: 2500,
      },
      {
        brandId: 'brand-drinks',
        brandName: 'Drinks',
        grossSen: 550,
        itemDiscountSen: 0,
        cartDiscountSen: 0,
        discountSen: 0,
        netSen: 550,
      },
    ])
  })

  it('splits a cart discount across brands and sums back exactly', () => {
    const cartDiscountSen = 500
    const shares = splitDiscountByBrand([FOOD, DRINK], cartDiscountSen)
    const allocated = shares.reduce((sum, share) => sum + share.cartDiscountSen, 0)

    expect(allocated).toBe(cartDiscountSen)
  })

  it('agrees with the cart totals it is derived from', () => {
    const totals = calculateCartTotals([FOOD, DRINK], 500)
    const shares = splitDiscountByBrand([FOOD, DRINK], 500)

    expect(shares.reduce((sum, share) => sum + share.netSen, 0)).toBe(totals.netTotalSen)
    expect(shares.reduce((sum, share) => sum + share.discountSen, 0)).toBe(totals.discountSen)
    expect(shares.reduce((sum, share) => sum + share.grossSen, 0)).toBe(totals.subtotalSen)
  })

  it('loses no sen when the split does not divide evenly', () => {
    // 1 sen across a 333/667 split has no exact answer; it must still sum to 1.
    const shares = splitDiscountByBrand([lineWorth('a', 333), lineWorth('b', 667)], 1)

    expect(shares.reduce((sum, share) => sum + share.cartDiscountSen, 0)).toBe(1)
  })

  it('never allocates a brand more discount than it has value left', () => {
    // Food is given away entirely on the line, then a cart discount is applied.
    // Splitting on raw gross would push Food's net sales negative.
    const shares = splitDiscountByBrand(
      [lineWorth('brand-food', 1000, 1000), lineWorth('brand-drinks', 1000)],
      500,
    )

    const food = shares.find((share) => share.brandId === 'brand-food')
    const drinks = shares.find((share) => share.brandId === 'brand-drinks')

    expect(food?.cartDiscountSen).toBe(0)
    expect(food?.netSen).toBe(0)
    expect(drinks?.cartDiscountSen).toBe(500)
    expect(shares.every((share) => share.netSen >= 0)).toBe(true)
  })

  it('caps the cart discount at the value remaining after line discounts', () => {
    const shares = splitDiscountByBrand([lineWorth('a', 1000, 400)], 9999)

    expect(shares[0]?.cartDiscountSen).toBe(600)
    expect(shares[0]?.netSen).toBe(0)
  })

  it('handles an empty cart', () => {
    expect(splitDiscountByBrand([], 500)).toEqual([])
  })
})
