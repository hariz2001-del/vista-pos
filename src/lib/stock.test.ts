import { beforeEach, describe, expect, it } from 'vitest'
import { groupStock, isFilled, loadDraft, parseCountMilli, saveDraft } from './stock'

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
