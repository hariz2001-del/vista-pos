export type AmountKey = '0' | '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '.' | 'back'

export const KEYPAD: AmountKey[] = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', 'back']

/**
 * One keypad press against the amount typed so far. Keeps the text a valid
 * ringgit figure as it is built: one decimal point, at most two decimals, and no
 * run of leading zeros.
 */
export function pressAmountKey(value: string, key: AmountKey): string {
  if (key === 'back') return value.slice(0, -1)
  if (key === '.') {
    if (value.includes('.')) return value
    return value === '' ? '0.' : `${value}.`
  }
  const [whole, decimals] = value.split('.')
  if (decimals !== undefined) return decimals.length >= 2 ? value : value + key
  if (whole === '0') return key
  return whole.length >= 6 ? value : value + key
}
