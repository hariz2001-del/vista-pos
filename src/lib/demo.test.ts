import { describe, expect, it } from 'vitest'
import { demoWindow, msUntilNextReset, seedSales } from './demo'

describe('demo reset windows', () => {
  it('splits the Malaysian day into 3-hour blocks', () => {
    // 01:30 UTC = 09:30 in Kuala Lumpur → block 3 (9am–12pm).
    expect(demoWindow(new Date('2026-09-28T01:30:00Z'))).toBe('2026-09-28#3')
    // 16:10 UTC = 00:10 the next day in Kuala Lumpur → a new date, block 0.
    expect(demoWindow(new Date('2026-09-28T16:10:00Z'))).toBe('2026-09-29#0')
  })

  it('counts down to the next boundary on the Malaysian clock', () => {
    // 09:30 KL → next reset at 12:00 KL, 2.5 hours away.
    expect(msUntilNextReset(new Date('2026-09-28T01:30:00Z'))).toBe(2.5 * 3_600_000)
    // Exactly on a boundary → a full block until the next.
    expect(msUntilNextReset(new Date('2026-09-28T04:00:00Z'))).toBe(3 * 3_600_000)
  })
})

describe('seedSales', () => {
  const now = new Date('2026-09-28T12:00:00Z') // 8pm in Kuala Lumpur

  it('lays down a dozen numbered, paid sales from earlier today', () => {
    const { businessDate, sales } = seedSales(now)
    expect(businessDate).toBe('2026-09-28')
    expect(sales).toHaveLength(12)
    expect(sales.map((sale) => sale.queueLabel)).toEqual(
      Array.from({ length: 12 }, (_, index) => `#${(index + 1).toString().padStart(3, '0')}`),
    )
    for (const sale of sales) {
      expect(sale.syncStatus).toBe('SYNCED')
      expect(sale.completedAt < now.toISOString()).toBe(true)
      expect(sale.totalSen).toBe(
        sale.request.cart_items.reduce((sum, item) => sum + item.unit_price_sen * item.quantity, 0),
      )
      expect(sale.totalSen).toBeGreaterThan(0)
    }
  })

  it('is the same demo every time', () => {
    const first = seedSales(now).sales.map((sale) => [sale.totalSen, sale.itemCount])
    const again = seedSales(now).sales.map((sale) => [sale.totalSen, sale.itemCount])
    expect(again).toEqual(first)
  })
})
