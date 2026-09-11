const MONEY_INPUT = /^\s*(?:RM\s*)?(\d+)(?:\.(\d{0,2}))?\s*$/i

export function assertSen(value: number, fieldName = 'amount'): number {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${fieldName} must be a non-negative integer number of sen`)
  }
  return value
}

export function formatRinggit(sen: number): string {
  const checked = assertSen(sen)
  const ringgit = Math.trunc(checked / 100)
  const cents = checked % 100
  return `RM ${ringgit.toLocaleString('en-MY')}.${cents.toString().padStart(2, '0')}`
}

export function formatSignedRinggit(sen: number): string {
  if (!Number.isSafeInteger(sen)) {
    throw new Error('amount must be an integer number of sen')
  }
  const sign = sen > 0 ? '+' : sen < 0 ? '−' : ''
  return `${sign}${formatRinggit(Math.abs(sen))}`
}

export function parseRinggitToSen(input: string): number | null {
  const match = MONEY_INPUT.exec(input)
  if (!match) return null

  const ringgit = Number(match[1])
  const cents = Number((match[2] ?? '').padEnd(2, '0'))
  const sen = ringgit * 100 + cents
  return Number.isSafeInteger(sen) ? sen : null
}
