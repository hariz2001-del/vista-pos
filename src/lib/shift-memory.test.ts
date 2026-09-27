import { afterEach, describe, expect, it } from 'vitest'
import { rememberShift, rememberedShift } from './shift-memory'

const SHIFT = {
  id: 'shift-1',
  businessDate: '2026-09-28',
  openedAt: '2026-09-28T02:00:00Z',
  openedByCashierId: 'cashier-1',
}

afterEach(() => localStorage.clear())

describe('shift memory', () => {
  it('survives a reload', () => {
    rememberShift(SHIFT)
    expect(rememberedShift()).toEqual(SHIFT)
  })

  it('forgets a closed shift', () => {
    rememberShift(SHIFT)
    rememberShift(null)
    expect(rememberedShift()).toBeNull()
  })

  it('ignores anything that is not a whole shift', () => {
    localStorage.setItem('vista-pos:open-shift', '{"id":"shift-1"}')
    expect(rememberedShift()).toBeNull()
    localStorage.setItem('vista-pos:open-shift', 'not json')
    expect(rememberedShift()).toBeNull()
  })
})
