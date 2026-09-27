import { describe, expect, it } from 'vitest'
import { pressAmountKey, type AmountKey } from './amount-keypad'

function type(...keys: AmountKey[]): string {
  return keys.reduce((value, key) => pressAmountKey(value, key), '')
}

describe('pressAmountKey', () => {
  it('builds a ringgit amount digit by digit', () => {
    expect(type('1', '2', '.', '5', '0')).toBe('12.50')
  })

  it('stops at two decimals', () => {
    expect(type('3', '.', '9', '9', '9')).toBe('3.99')
  })

  it('allows only one decimal point, and a leading one reads as 0.', () => {
    expect(type('.', '5', '.')).toBe('0.5')
  })

  it('does not keep a run of leading zeros', () => {
    expect(type('0', '0', '7')).toBe('7')
  })

  it('deletes the last character', () => {
    expect(type('4', '.', '2', 'back', 'back')).toBe('4')
    expect(type('back')).toBe('')
  })
})
