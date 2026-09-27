import type { Shift } from '../domain/types'

/**
 * The shift this tablet last had open, so a reload goes straight back to the
 * till instead of the PIN screen — even with no connection, when the server
 * cannot be asked.
 *
 * Remembering a shift the server has since closed is safe: sales rung up
 * against it queue as usual, and the server takes a late sale on a closed
 * shift, flags it, and reopens that shift's reconciliation. The first bootstrap
 * that reaches the server replaces this with the truth.
 */
const SHIFT_KEY = 'vista-pos:open-shift'

export function rememberShift(shift: Shift | null): void {
  try {
    if (shift) localStorage.setItem(SHIFT_KEY, JSON.stringify(shift))
    else localStorage.removeItem(SHIFT_KEY)
  } catch {
    // Blocked storage only costs the resume-after-reload.
  }
}

export function rememberedShift(): Shift | null {
  try {
    const raw = localStorage.getItem(SHIFT_KEY)
    if (!raw) return null
    const shift = JSON.parse(raw) as Partial<Shift>
    return typeof shift.id === 'string' &&
      typeof shift.businessDate === 'string' &&
      typeof shift.openedAt === 'string' &&
      typeof shift.openedByCashierId === 'string'
      ? (shift as Shift)
      : null
  } catch {
    return null
  }
}
