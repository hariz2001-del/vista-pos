import { apiRequest } from './http'

/**
 * Closing stock: the owner's list, filled in at the counter in one pass and
 * sent once. The server copies the list's set-up onto the submission itself, so
 * this sends only what was typed.
 *
 * Online only. There is nothing to sell from it, so there is nothing to queue:
 * a half-done count is kept on the tablet (see `saveDraft`) until it can go.
 */

export type StockBalance =
  | 'EMPTY'
  | 'QUARTER'
  | 'HALF'
  | 'THREE_QUARTERS'
  | 'FULL'
  // The old three-step scale, on counts sent before the five-step bar.
  | 'MORE_THAN_HALF'
  | 'LESS_THAN_HALF'

export type StockLevel = {
  value: StockBalance
  /** How full, 0–100: the width of the bar. */
  pct: number
  label: string
  /** The bar's colour at this level: red when finished, through to green when full. */
  colour: string
}

/** The five steps on the bar, emptiest first. */
export const LEVELS: StockLevel[] = [
  { value: 'EMPTY', pct: 0, label: '0%', colour: '#dc2626' },
  { value: 'QUARTER', pct: 25, label: '25%', colour: '#ea580c' },
  { value: 'HALF', pct: 50, label: '50%', colour: '#eab308' },
  { value: 'THREE_QUARTERS', pct: 75, label: '75%', colour: '#84cc16' },
  { value: 'FULL', pct: 100, label: '100%', colour: '#16a34a' },
]

/** Any balance as a level to draw. The old scale shows at its nearest step, under its old name. */
export function levelOf(balance: StockBalance | null | undefined): StockLevel | null {
  if (!balance) return null
  if (balance === 'MORE_THAN_HALF') return { ...LEVELS[3]!, value: balance, label: '> ½' }
  if (balance === 'LESS_THAN_HALF') return { ...LEVELS[1]!, value: balance, label: '< ½' }
  return LEVELS.find((level) => level.value === balance) ?? null
}

export type StockNote = { text: string; colour: string }

type NoteLine = {
  trackUnopened: boolean
  trackOpened: boolean
  trackBalance: boolean
  unopenedMilli: number | null
  openedMilli: number | null
  balance: StockBalance | null
}

/**
 * What to say at the end of a line. The bar is the opened one only, so an item
 * is finished, or low, only when no unopened stock is left as well: an empty
 * open bottle with sealed ones on the shelf is neither.
 */
export function stockNote(line: NoteLine): StockNote | null {
  const noneSealed = !line.trackUnopened || line.unopenedMilli === 0
  if (!noneSealed) return null
  if (line.trackBalance) {
    if (line.balance === 'EMPTY') return { text: 'Finished stock', colour: LEVELS[0]!.colour }
    if (line.balance === 'QUARTER') return { text: 'Low stock', colour: LEVELS[1]!.colour }
    return null
  }
  // No bar to read: nothing unopened, and nothing opened where that is counted.
  if (line.trackUnopened && (!line.trackOpened || line.openedMilli === 0)) {
    return { text: 'Finished stock', colour: LEVELS[0]!.colour }
  }
  return null
}

/**
 * Nothing unopened and nothing opened means the bar can only be at 0%, so it
 * is set there without a tap — unless a level was already chosen.
 */
export function impliedBalance(line: NoteLine): StockBalance | null {
  if (!line.trackBalance || line.balance !== null || !line.trackOpened || line.openedMilli !== 0) return line.balance
  if (line.trackUnopened && line.unopenedMilli !== 0) return line.balance
  return 'EMPTY'
}

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
    if (!draft || draft.businessDate !== businessDate) return null
    for (const entry of Object.values(draft.entries)) {
      if (entry.balance === 'MORE_THAN_HALF') entry.balance = 'THREE_QUARTERS'
      if (entry.balance === 'LESS_THAN_HALF') entry.balance = 'QUARTER'
    }
    return draft
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
