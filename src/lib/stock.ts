import { apiRequest } from './http'

/**
 * Closing stock: the owner's list, filled in at the counter in one pass and
 * sent once. The server copies the list's set-up onto the submission itself, so
 * this sends only what was typed.
 *
 * Online only. There is nothing to sell from it, so there is nothing to queue:
 * a half-done count is kept on the tablet (see `saveDraft`) until it can go.
 */

export type StockBalance = 'MORE_THAN_HALF' | 'HALF' | 'LESS_THAN_HALF'

export const BALANCES: Array<{ value: StockBalance; label: string; long: string }> = [
  { value: 'MORE_THAN_HALF', label: '> ½', long: 'More than half' },
  { value: 'HALF', label: '½', long: 'Half' },
  { value: 'LESS_THAN_HALF', label: '< ½', long: 'Less than half' },
]

export type StockItem = {
  id: string
  brandId: string
  category: string
  subcategory: string | null
  name: string
  unitLabel: string | null
  trackUnopened: boolean
  trackOpened: boolean
  trackBalance: boolean
}

export type StockSheet = {
  businessDate: string
  branchName: string
  brands: Array<{ id: string; name: string; colour: string }>
  items: StockItem[]
  /** Active staff, those rostered around now first. */
  staff: Array<{ id: string; name: string; rostered: boolean; onNow: boolean }>
}

/** What was typed for one item. Text, so a half-typed "2." survives a re-render. */
export type StockEntry = { unopened: string; opened: string; balance: StockBalance | null }

export type StockDraft = {
  businessDate: string
  entries: Record<string, StockEntry>
  staffId: string | null
  staffName: string
  remarks: string
}

export const EMPTY_ENTRY: StockEntry = { unopened: '', opened: '', balance: null }

export function fetchStockSheet(): Promise<StockSheet> {
  return apiRequest<StockSheet>('GET', '/stock/sheet')
}

export function submitStockCount(body: {
  staffId: string | null
  staffName: string | null
  remarks: string | null
  lines: Array<{
    stockItemId: string
    unopenedMilli: number | null
    openedMilli: number | null
    balance: StockBalance | null
  }>
}): Promise<{ id: string }> {
  return apiRequest<{ id: string }>('POST', '/stock/counts', body)
}

/** Thousandths, as the API stores a count. `2.5` → 2500; blank → null. */
export function parseCountMilli(input: string): number | null | 'invalid' {
  const text = input.trim()
  if (text === '') return null
  const match = /^(\d{1,6})(?:\.(\d{0,3}))?$/.exec(text)
  if (!match) return 'invalid'
  return Number(match[1]) * 1000 + Number((match[2] ?? '').padEnd(3, '0'))
}

type Groupable = { brandId: string; category: string; subcategory: string | null }

export type StockGroups<T> = Array<{
  brandId: string
  categories: Array<{ category: string; subcategories: Array<{ subcategory: string | null; items: T[] }> }>
}>

/** Brand → category → subcategory, each in the order its first item appears. */
export function groupStock<T extends Groupable>(items: readonly T[]): StockGroups<T> {
  const groups: StockGroups<T> = []
  for (const item of items) {
    let brand = groups.find((group) => group.brandId === item.brandId)
    if (!brand) {
      brand = { brandId: item.brandId, categories: [] }
      groups.push(brand)
    }
    let category = brand.categories.find((group) => group.category === item.category)
    if (!category) {
      category = { category: item.category, subcategories: [] }
      brand.categories.push(category)
    }
    let subcategory = category.subcategories.find((group) => group.subcategory === item.subcategory)
    if (!subcategory) {
      subcategory = { subcategory: item.subcategory, items: [] }
      category.subcategories.push(subcategory)
    }
    subcategory.items.push(item)
  }
  return groups
}

/** Has anything been entered for this item? */
export function isFilled(entry: StockEntry | undefined): boolean {
  return Boolean(entry && (entry.unopened.trim() || entry.opened.trim() || entry.balance))
}

// A count in progress survives a reload or a dropped connection. One per
// business date: yesterday's half-finished count never pre-fills tonight's.
const DRAFT_KEY = 'vista.pos.stock-draft'

export function loadDraft(businessDate: string): StockDraft | null {
  try {
    const raw = localStorage.getItem(DRAFT_KEY)
    const draft = raw ? (JSON.parse(raw) as StockDraft) : null
    return draft && draft.businessDate === businessDate ? draft : null
  } catch {
    return null
  }
}

export function saveDraft(draft: StockDraft | null): void {
  try {
    if (draft) localStorage.setItem(DRAFT_KEY, JSON.stringify(draft))
    else localStorage.removeItem(DRAFT_KEY)
  } catch {
    // Storage blocked: the count still works, it just will not survive a reload.
  }
}
