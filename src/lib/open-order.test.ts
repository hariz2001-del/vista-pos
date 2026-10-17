import { beforeEach, describe, expect, it } from 'vitest'
import { clearOpenOrder, loadOpenOrder, saveOpenOrder } from './open-order'

const line = { cartLineId: 'l1', productId: 'p1', productName: 'Kopi Ais', brandId: 'b1', quantity: 2 } as never
const order = {
  shiftId: 'shift-1', cart: [line], cartDiscountSen: 0, removedPromotions: [], orderMode: 'CONFIRMED' as const,
  clientTxnId: 'txn-1', hasAttempted: false, pagerNumber: '7', pagerRequired: true,
}

describe('open order', () => {
  beforeEach(() => clearOpenOrder())

  it('comes back after a reload, with the same transaction id so paying it cannot charge twice', () => {
    saveOpenOrder(order)
    expect(loadOpenOrder('shift-1')).toMatchObject({ cart: [line], orderMode: 'CONFIRMED', clientTxnId: 'txn-1', pagerNumber: '7' })
  })
  it('belongs to its shift, and an empty cart clears it', () => {
    saveOpenOrder(order)
    expect(loadOpenOrder('shift-2')).toBeNull()
    saveOpenOrder({ ...order, cart: [] })
    expect(loadOpenOrder('shift-1')).toBeNull()
  })
  it('does not bring back an order from another day', () => {
    saveOpenOrder(order)
    expect(loadOpenOrder('shift-1', new Date(Date.now() + 13 * 3600_000))).toBeNull()
  })
})
