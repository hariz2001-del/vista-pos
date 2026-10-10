import { beforeEach, describe, expect, it } from 'vitest'
import { groupStock, impliedBalance, isFilled, loadDraft, parseCountMilli, saveDraft, stockNote } from './stock'

describe('closing stock', () => {
  beforeEach(() => localStorage.clear())

  it('groups brand → category → subcategory in list order', () => {
    const groups = groupStock([
      { id: 'a', brandId: 'drinks', category: 'Drinks', subcategory: 'Milk' },
      { id: 'b', brandId: 'drinks', category: 'Packaging', subcategory: null },
      { id: 'c', brandId: 'drinks', category: 'Drinks', subcategory: 'Milk' },
      { id: 'd', brandId: 'food', category: 'Fries', subcategory: null },
    ])
    expect(groups.map((brand) => brand.brandId)).toEqual(['drinks', 'food'])
    expect(groups[0]?.categories[0]?.subcategories[0]?.items.map((item) => item.id)).toEqual(['a', 'c'])
  })

  it('reads typed counts as thousandths and flags nonsense', () => {
    expect(parseCountMilli('3')).toBe(3000)
    expect(parseCountMilli('1.5')).toBe(1500)
    expect(parseCountMilli(' ')).toBeNull()
    expect(parseCountMilli('1..5')).toBe('invalid')
  })

  it('counts an item as filled once anything is entered', () => {
    expect(isFilled({ unopened: '', opened: '', balance: null })).toBe(false)
    expect(isFilled({ unopened: '', opened: '', balance: 'HALF' })).toBe(true)
  })

  it('keeps a draft for its own night only', () => {
    saveDraft({ businessDate: '2026-10-04', entries: {}, staffId: null, staffName: 'Aina', remarks: '' })
    expect(loadDraft('2026-10-04')?.staffName).toBe('Aina')
    expect(loadDraft('2026-10-05')).toBeNull()
  })
})

describe('closing stock notes', () => {
  const bottle = { trackUnopened: true, trackOpened: false, trackBalance: true }

  it('calls stock finished or low only when nothing unopened is left', () => {
    expect(stockNote({ ...bottle, unopenedMilli: 0, openedMilli: null, balance: 'EMPTY' })?.text).toBe('Finished stock')
    expect(stockNote({ ...bottle, unopenedMilli: 0, openedMilli: null, balance: 'QUARTER' })?.text).toBe('Low stock')
    // Sealed ones still on the shelf: the open one being empty or low is not news.
    expect(stockNote({ ...bottle, unopenedMilli: 3000, openedMilli: null, balance: 'EMPTY' })).toBeNull()
    expect(stockNote({ ...bottle, unopenedMilli: 3000, openedMilli: null, balance: 'QUARTER' })).toBeNull()
    // Not counted yet: no guess.
    expect(stockNote({ ...bottle, unopenedMilli: null, openedMilli: null, balance: 'EMPTY' })).toBeNull()
    expect(stockNote({ ...bottle, unopenedMilli: 0, openedMilli: null, balance: 'HALF' })).toBeNull()
    // Only the bar is counted: the bar alone decides.
    expect(stockNote({ trackUnopened: false, trackOpened: false, trackBalance: true, unopenedMilli: null, openedMilli: null, balance: 'EMPTY' })?.text).toBe('Finished stock')
    // No bar (cups): nothing unopened is finished.
    expect(stockNote({ trackUnopened: true, trackOpened: false, trackBalance: false, unopenedMilli: 0, openedMilli: null, balance: null })?.text).toBe('Finished stock')
  })

  it('puts the bar at 0% when nothing unopened and nothing opened is left, unless a level was chosen', () => {
    const counted = { trackUnopened: true, trackOpened: true, trackBalance: true }
    expect(impliedBalance({ ...counted, unopenedMilli: 0, openedMilli: 0, balance: null })).toBe('EMPTY')
    expect(impliedBalance({ ...counted, unopenedMilli: 2000, openedMilli: 0, balance: null })).toBeNull()
    expect(impliedBalance({ ...counted, unopenedMilli: 0, openedMilli: 1000, balance: null })).toBeNull()
    expect(impliedBalance({ ...counted, unopenedMilli: 0, openedMilli: 0, balance: 'HALF' })).toBe('HALF')
    // Opened not counted: the bar is the only word on the open one.
    expect(impliedBalance({ ...bottle, unopenedMilli: 0, openedMilli: null, balance: null })).toBeNull()
  })
})
