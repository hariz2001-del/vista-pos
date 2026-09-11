import { describe, expect, it } from 'vitest'
import { getBusinessDate } from './business-date'

describe('business date', () => {
  it('keeps a 3am Malaysia order on the prior operating date', () => {
    expect(getBusinessDate(new Date('2026-09-07T19:00:00.000Z'))).toBe('2026-09-07')
  })

  it('uses the current Malaysia date after the 5am cutoff', () => {
    expect(getBusinessDate(new Date('2026-09-07T21:30:00.000Z'))).toBe('2026-09-08')
  })
})
