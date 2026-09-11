export type ModifierType = 'ADD_ON' | 'REMOVAL'

/**
 * Brands are data, not a hardcoded union. Every financial dimension in the RMS
 * (net sales by brand, partner profit share, shared overhead allocation) keys off
 * a brand id, so a rename or a third brand must never be a code change.
 *
 * Colours are hex rather than Tailwind class names because a data-driven value
 * cannot be safely interpolated into a utility class at build time.
 */
export type Brand = {
  id: string
  name: string
  colour: string
  softColour: string
}

export type Category = {
  id: string
  name: string
  brandId: string
}

export type ModifierOption = {
  id: string
  name: string
  priceSen: number
  type: ModifierType
}

export type ModifierGroup = {
  id: string
  name: string
  description?: string
  /** A group with minSelect > 0 is required. There is no separate `required` flag: two sources of truth would eventually disagree. */
  minSelect: number
  maxSelect: number
  options: ModifierOption[]
}

export type Product = {
  id: string
  name: string
  description: string
  brandId: string
  categoryId: string
  unitPriceSen: number
  imageUrl: string
  soldOut: boolean
  modifierGroups: ModifierGroup[]
}

export type SnapshottedModifier = {
  modifierId: string
  groupName: string
  name: string
  priceSen: number
  type: ModifierType
}

/**
 * Brand and category are snapshotted onto the line, not looked up later, so that
 * renaming a brand cannot retroactively change what an old sale reported.
 */
export type CartLine = {
  cartLineId: string
  productId: string
  productName: string
  brandId: string
  brandName: string
  categoryId: string
  categoryName: string
  quantity: number
  unitPriceSen: number
  modifiers: SnapshottedModifier[]
  discountSen: number
}

export type CartTotals = {
  subtotalSen: number
  itemDiscountSen: number
  cartDiscountSen: number
  discountSen: number
  netTotalSen: number
  itemCount: number
}

/** Discount attributed to one brand, for the reporting the RMS will do later. */
export type BrandDiscountShare = {
  brandId: string
  brandName: string
  grossSen: number
  itemDiscountSen: number
  cartDiscountSen: number
  discountSen: number
  netSen: number
}

// ---------------------------------------------------------------------------
// Shift
// ---------------------------------------------------------------------------

export type Cashier = {
  id: string
  name: string
  imageUrl: string
  /** Fake local PIN. Real verification will happen server-side; this never ships as-is. */
  pin: string
}

export type Shift = {
  id: string
  businessDate: string
  openedAt: string
  openedByCashierId: string
}

// ---------------------------------------------------------------------------
// Sales and the offline queue
// ---------------------------------------------------------------------------

export type SaleSyncStatus = 'SYNCED' | 'PENDING'

export type CheckoutModifierRequest = {
  name: string
  price_sen: number
  type: ModifierType
}

export type CheckoutCartItemRequest = {
  product_id: string
  product_name: string
  brand_id: string
  category_id: string
  quantity: number
  unit_price_sen: number
  modifier_total_sen: number
  /**
   * Per-line discount. The server needs this to attribute every sen of discount
   * to a brand and category; a single cart-level figure cannot be split back out.
   */
  discount_sen: number
  modifiers: CheckoutModifierRequest[]
}

export type FinalizeCheckoutRequest = {
  shift_id: string
  /** Minted on the device and reused across retries. This is what makes a replayed sale idempotent. */
  client_txn_id: string
  business_date: string
  /** Cart-wide discount only. Line discounts travel on their own lines. */
  cart_discount_sen: number
  cart_items: CheckoutCartItemRequest[]
}

export type CompletedSale = {
  clientTxnId: string
  /** Server order id once synced; null while the sale exists only on this device. */
  orderId: string | null
  /** `#042` when the server allocated it, `#OFF-01` while pending. */
  queueLabel: string
  /**
   * The label actually called out to the customer if this sale was rung up
   * offline. Retained after syncing, because the queue number the kitchen
   * shouted is the only way to trace the order back afterwards.
   */
  offlineLabel: string | null
  totalSen: number
  itemCount: number
  completedAt: string
  businessDate: string
  syncStatus: SaleSyncStatus
  /** Cashier cannot void a paid sale; they raise a flag and the owner corrects it in the RMS. */
  flaggedForOwner: boolean
  flagReason: string | null
  request: FinalizeCheckoutRequest
}

export type CheckoutResult = {
  sale: CompletedSale
  /** True when the sale was written to the local queue instead of the server. */
  wasOffline: boolean
}
