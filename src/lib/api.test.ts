import { describe, expect, it } from 'vitest'
import type { CartLine, SaleCorrection } from '../domain/types'
import {
  CheckoutApiError,
  createCheckoutRequest,
  toCheckoutApiPayload,
  toCorrectionApiPayload,
} from './api'

const BASE: CartLine = {
  cartLineId: 'line-1',
  productId: 'product-1',
  productName: 'Nasi Lemak Ayam',
  brandId: 'brand-food',
  brandName: 'Food',
  categoryId: 'cat-nasi',
  categoryName: 'Nasi',
  quantity: 1,
  unitPriceSen: 1200,
  discountSen: 0,
  modifiers: [
    { modifierId: 'm1', groupName: 'Tambah lauk', name: 'Extra Sambal', priceSen: 200, type: 'ADD_ON' },
    { modifierId: 'm2', groupName: 'Buang bahan', name: 'No Timun', priceSen: 0, type: 'REMOVAL' },
  ],
}

const ENVELOPE = {
  shiftId: 'shift-id',
  businessDate: '2026-09-07',
  clientTxnId: 'txn-id',
}

describe('checkout request', () => {
  it('maps immutable cart snapshots to the API contract', () => {
    expect(createCheckoutRequest({ ...ENVELOPE, cart: [BASE], cartDiscountSen: 0 })).toEqual({
      shift_id: 'shift-id',
      client_txn_id: 'txn-id',
      business_date: '2026-09-07',
      cart_discount_sen: 0,
      cart_items: [
        {
          product_id: 'product-1',
          product_name: 'Nasi Lemak Ayam',
          brand_id: 'brand-food',
          category_id: 'cat-nasi',
          quantity: 1,
          unit_price_sen: 1200,
          modifier_total_sen: 200,
          discount_sen: 0,
          modifiers: [
            { modifier_id: 'm1', name: 'Extra Sambal', price_sen: 200, type: 'ADD_ON' },
            { modifier_id: 'm2', name: 'No Timun', price_sen: 0, type: 'REMOVAL' },
          ],
        },
      ],
    })
  })

  it('sends line discounts on their own line so the server can attribute them to a brand', () => {
    const request = createCheckoutRequest({
      ...ENVELOPE,
      cart: [{ ...BASE, discountSen: 300 }],
      cartDiscountSen: 0,
    })

    expect(request.cart_items[0]?.discount_sen).toBe(300)
    expect(request.cart_discount_sen).toBe(0)
  })

  it('caps a line discount at that line gross', () => {
    const request = createCheckoutRequest({
      ...ENVELOPE,
      cart: [{ ...BASE, discountSen: 99999 }],
      cartDiscountSen: 0,
    })

    // Line gross is 1200 + 200 modifiers = 1400.
    expect(request.cart_items[0]?.discount_sen).toBe(1400)
  })

  it('keeps line and cart discounts separate when both are applied', () => {
    const request = createCheckoutRequest({
      ...ENVELOPE,
      cart: [{ ...BASE, discountSen: 200 }],
      cartDiscountSen: 100,
    })

    expect(request.cart_items[0]?.discount_sen).toBe(200)
    expect(request.cart_discount_sen).toBe(100)
  })

  it('refuses to send a payload that bills a different amount than was displayed', () => {
    // Passing the raw requested cart discount instead of the capped one is the
    // exact mistake this guard exists to catch.
    expect(() =>
      createCheckoutRequest({ ...ENVELOPE, cart: [BASE], cartDiscountSen: 99999 }),
    ).toThrow(CheckoutApiError)
  })

  it('maps an offline sale to the production API without trusting display labels', () => {
    const request = createCheckoutRequest({ ...ENVELOPE, cart: [BASE], cartDiscountSen: 100 })
    expect(toCheckoutApiPayload(request, 1300, 'OFFLINE_SYNC', '#OFF-02')).toMatchObject({
      claimed_total_sen: 1300,
      origin: 'OFFLINE_SYNC',
      offline_label: '#OFF-02',
      cart_items: [
        {
          product_id: 'product-1',
          charged_unit_price_sen: 1200,
          charged_modifier_total_sen: 200,
          modifiers: [{ modifier_id: 'm1' }, { modifier_id: 'm2' }],
        },
      ],
    })
  })

  it('maps a queued correction to the production idempotent endpoint', () => {
    const replacement = createCheckoutRequest({
      ...ENVELOPE,
      cart: [BASE],
      cartDiscountSen: 100,
    })
    const correction: SaleCorrection = {
      clientTxnId: 'correction-txn',
      correctionId: null,
      originalClientTxnId: 'sale-txn',
      originalQueueLabel: '#014',
      kind: 'EXCHANGE',
      reason: 'Discount missed at checkout',
      deltaSen: -100,
      brandDeltas: [{ brandId: 'brand-food', brandName: 'Food', deltaSen: -100 }],
      replacementItems: replacement.cart_items,
      replacementCartDiscountSen: 100,
      shiftId: 'shift-id',
      businessDate: '2026-09-07',
      createdAt: '2026-09-07T12:00:00.000Z',
      syncStatus: 'PENDING',
    }

    expect(toCorrectionApiPayload(correction, 'OFFLINE_SYNC')).toMatchObject({
      client_txn_id: 'correction-txn',
      original_client_txn_id: 'sale-txn',
      claimed_delta_sen: -100,
      replacement_cart_discount_sen: 100,
      replacement_items: [
        {
          product_id: 'product-1',
          charged_unit_price_sen: 1200,
          charged_modifier_total_sen: 200,
          modifiers: [{ modifier_id: 'm1' }, { modifier_id: 'm2' }],
        },
      ],
    })
  })
})
