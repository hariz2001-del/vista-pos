import type { Brand, Cashier, Category, Product } from '../../domain/types'
import { BRANDS, CATEGORIES, PRODUCTS } from './catalogue'

/**
 * A fake account standing in for the server, so the UI can be designed and
 * reviewed before any of `api-vista` exists.
 *
 * This is shaped like the bootstrap payload the real API will return, so
 * replacing it later means swapping the import for a `fetch` — not reworking
 * every component that reads it.
 */
export type AccountSnapshot = {
  account: {
    id: string
    businessName: string
    outletName: string
    timeZone: string
  }
  cashier: Cashier
  brands: Brand[]
  categories: Category[]
  products: Product[]
  isDemo: boolean
}

export const FAKE_ACCOUNT: AccountSnapshot = {
  account: {
    id: '00000000-0000-4000-8000-000000000001',
    businessName: 'Vista Demo Enterprise',
    outletName: 'Vista Counter · Section 7',
    timeZone: 'Asia/Kuala_Lumpur',
  },
  cashier: {
    id: '10000000-0000-4000-8000-000000000001',
    name: 'Aina (Demo)',
    imageUrl: '/profiles/aina-test.svg',
    // Fake, and deliberately obvious. Real PINs will be verified server-side and
    // must never be shipped to the client like this.
    pin: '1234',
  },
  brands: BRANDS,
  categories: CATEGORIES,
  products: PRODUCTS,
  isDemo: true,
}

/** Fake credentials for the demo sign-in screen. Shared with the future RMS login. */
export const FAKE_LOGIN = {
  email: 'demo@vistahub.my',
  password: 'vista',
}

export { BRANDS, CATEGORIES, PRODUCTS, BRAND_FOOD, BRAND_DRINKS } from './catalogue'
