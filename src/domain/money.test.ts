import { describe, expect, it } from 'vitest'
import { formatRinggit, parseRinggitToSen } from './money'

describe('money helpers', () => {
  it('formats integer sen without a floating amount model', () => {
    expect(formatRinggit(1450)).toBe('RM 14.50')
    expect(formatRinggit(123456)).toBe('RM 1,234.56')
  })

  it('parses ringgit input exactly into integer sen', () => {
    expect(parseRinggitToSen('14.50')).toBe(1450)
    expect(parseRinggitToSen('RM 8.5')).toBe(850)
    expect(parseRinggitToSen('8.567')).toBeNull()
  })
})
