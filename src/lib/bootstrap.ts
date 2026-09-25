import type { AccountSnapshot } from '../data/fake-account'
import type { ModifierType } from '../domain/types'
import { apiRequest } from './http'
import { setDeviceBusiness } from './offline-queue'

/**
 * The menu, the signed-in person, the business profile and any open shift —
 * everything the counter needs, in one request.
 *
 * The last good copy is kept on the device. A tablet that reloads mid-shift with
 * no connection can then still show the menu and keep selling into the local
 * queue. (Opening a shift still needs the server: it is the server that issues
 * the shift.)
 */

const CACHE_KEY = 'vista.pos.bootstrap'
const DEFAULT_AVATAR = '/profiles/aina-test.svg'

type BootstrapResponse = {
  business_date: string
  /** Which business this device is signed in to. Unsent sales are filed under it. */
  business_id?: string
  user: { id: string; name: string; role: string } | null
  account: { business_name: string; outlet_name: string; day_rollover_hour?: number } | null
  /** Absent from an older API. */
  promotions?: Array<{
    id: string
    name: string
    kind: 'PERCENT' | 'AMOUNT'
    value: number
    /** Absent from an older API: a whole-order, cashier-picked promo. */
    scope?: 'ORDER' | 'ITEMS' | 'COMBO'
    auto_apply?: boolean
    limit?: 'EACH' | 'ONCE_PER_ORDER'
    targets?: Array<{ product_id: string | null; category_id: string | null; quantity: number }>
    starts_on: string
    ends_on: string | null
  }>
  open_shift: { id: string; business_date: string; opened_at: string } | null
  brands: Array<{ id: string; name: string; colour: string; soft_colour: string }>
  categories: Array<{ id: string; brand_id: string; name: string }>
  products: Array<{
    id: string
    brand_id: string
    category_id: string
    name: string
    description: string | null
    unit_price_sen: number
    image_url: string | null
    sold_out: boolean
    modifier_groups: Array<{
      id: string
      name: string
      description: string | null
      min_select: number
      max_select: number
      options: Array<{ id: string; name: string; price_sen: number; type: ModifierType }>
    }>
  }>
}

export type OpenShift = { id: string; businessDate: string; openedAt: string }

export type Bootstrap = {
  snapshot: AccountSnapshot
  openShift: OpenShift | null
}

/** What the screens render before the first bootstrap has ever arrived. */
export const EMPTY_SNAPSHOT: AccountSnapshot = {
  account: {
    id: '',
    businessName: 'Vista',
    outletName: '',
    timeZone: 'Asia/Kuala_Lumpur',
    dayRolloverHour: 5,
  },
  cashier: { id: '', name: '', imageUrl: DEFAULT_AVATAR },
  brands: [],
  categories: [],
  products: [],
  promotions: [],
  isDemo: false,
}

function toBootstrap(raw: BootstrapResponse): Bootstrap {
  return {
    snapshot: {
      account: {
        id: 'server',
        businessName: raw.account?.business_name ?? 'Vista',
        outletName: raw.account?.outlet_name ?? '',
        timeZone: 'Asia/Kuala_Lumpur',
        dayRolloverHour: raw.account?.day_rollover_hour ?? 5,
      },
      cashier: {
        id: raw.user?.id ?? '',
        name: raw.user?.name ?? '',
        imageUrl: DEFAULT_AVATAR,
      },
      brands: raw.brands.map((brand) => ({
        id: brand.id,
        name: brand.name,
        colour: brand.colour,
        softColour: brand.soft_colour,
      })),
      categories: raw.categories.map((category) => ({
        id: category.id,
        name: category.name,
        brandId: category.brand_id,
      })),
      // Modifier ids here are the real database ids. The checkout payload sends
      // them back, and the server reprices from them — a demo id would be refused.
      products: raw.products.map((product) => ({
        id: product.id,
        name: product.name,
        description: product.description ?? '',
        brandId: product.brand_id,
        categoryId: product.category_id,
        unitPriceSen: product.unit_price_sen,
        imageUrl: product.image_url ?? '',
        soldOut: product.sold_out,
        modifierGroups: product.modifier_groups.map((group) => ({
          id: group.id,
          name: group.name,
          description: group.description ?? undefined,
          minSelect: group.min_select,
          maxSelect: group.max_select,
          options: group.options.map((option) => ({
            id: option.id,
            name: option.name,
            priceSen: option.price_sen,
            type: option.type,
          })),
        })),
      })),
      promotions: (raw.promotions ?? []).map((promotion) => ({
        id: promotion.id,
        name: promotion.name,
        kind: promotion.kind,
        value: promotion.value,
        scope: promotion.scope ?? 'ORDER',
        autoApply: promotion.auto_apply ?? false,
        limit: promotion.limit ?? 'EACH',
        targets: (promotion.targets ?? []).map((target) => ({
          productId: target.product_id,
          categoryId: target.category_id,
          quantity: target.quantity,
        })),
        startsOn: promotion.starts_on,
        endsOn: promotion.ends_on,
      })),
      isDemo: false,
    },
    openShift: raw.open_shift
      ? {
          id: raw.open_shift.id,
          businessDate: raw.open_shift.business_date,
          openedAt: raw.open_shift.opened_at,
        }
      : null,
  }
}

export async function loadBootstrap(): Promise<Bootstrap> {
  const raw = await apiRequest<BootstrapResponse>('GET', '/bootstrap')
  // Before anything is sent or counted: which business's records are ours.
  if (raw.business_id) await setDeviceBusiness(raw.business_id)
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(raw))
  } catch {
    // A full or blocked store only costs the offline-reload fallback.
  }
  return toBootstrap(raw)
}

/**
 * The last menu this device saw, or null. The open shift is dropped: whether a
 * shift is still open is a fact about the server now, not about the past.
 */
export function cachedBootstrap(): Bootstrap | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    if (!raw) return null
    return { ...toBootstrap(JSON.parse(raw) as BootstrapResponse), openShift: null }
  } catch {
    return null
  }
}

/**
 * Forget the cached menu. Signing in to a different business must not show the
 * last business's menu, even for a moment, even offline.
 */
export function clearCachedBootstrap(): void {
  try {
    localStorage.removeItem(CACHE_KEY)
  } catch {
    // Nothing cached, or nothing we can do.
  }
}
