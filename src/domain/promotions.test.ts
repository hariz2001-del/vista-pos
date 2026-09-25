import { describe, expect, it } from 'vitest'
import { describePromotion, promotionAmountSen, promotionsOn, type Promotion } from './promotions'

const promo = (id: string, startsOn: string, endsOn: string | null): Promotion => ({
  id,
  name: id,
  kind: 'PERCENT',
  value: 10,
  startsOn,
  endsOn,
})

describe('promotions', () => {
  it('offers only the promos running on the shift’s trading day, both ends included', () => {
    const list = [
      promo('week', '2026-09-01', '2026-09-07'),
      promo('open-ended', '2026-09-05', null),
      promo('later', '2026-09-10', null),
      promo('over', '2026-08-01', '2026-08-31'),
    ]
    expect(promotionsOn(list, '2026-09-01').map((p) => p.id)).toEqual(['week'])
    expect(promotionsOn(list, '2026-09-07').map((p) => p.id)).toEqual(['week', 'open-ended'])
    expect(promotionsOn(list, '2026-09-08').map((p) => p.id)).toEqual(['open-ended'])
  })

  it('works out a percentage, rounding down to the sen', () => {
    expect(promotionAmountSen({ kind: 'PERCENT', value: 10 }, 1250)).toBe(125)
    expect(promotionAmountSen({ kind: 'PERCENT', value: 15 }, 999)).toBe(149)
    expect(promotionAmountSen({ kind: 'PERCENT', value: 100 }, 800)).toBe(800)
  })

  it('never takes a fixed amount below zero', () => {
    expect(promotionAmountSen({ kind: 'AMOUNT', value: 200 }, 1500)).toBe(200)
    expect(promotionAmountSen({ kind: 'AMOUNT', value: 500 }, 300)).toBe(300)
    expect(promotionAmountSen({ kind: 'AMOUNT', value: 200 }, 0)).toBe(0)
  })

  it('describes itself', () => {
    expect(describePromotion({ kind: 'PERCENT', value: 10 })).toBe('10% off')
    expect(describePromotion({ kind: 'AMOUNT', value: 250 })).toBe('RM 2.50 off')
  })
})
