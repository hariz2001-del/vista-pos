import type { Brand } from '../domain/types'

/**
 * Which category a line came from — drinks against food, say — at a glance, on
 * the order being built and on past receipts alike. Tinted with the brand's
 * colours, as the product tiles are. With no name (a category deleted since
 * the sale) the tag is left off.
 */
export function CategoryTag({ name, brand }: { name?: string; brand?: Brand }) {
  if (!name) return null
  return (
    <span
      // Brand colours are data, so they cannot be Tailwind utility classes.
      style={{
        backgroundColor: brand?.softColour ?? '#eef1f0',
        color: brand?.colour ?? '#101826',
      }}
      className="ml-2 inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 align-middle text-[11px] font-black"
    >
      <span aria-hidden="true" style={{ backgroundColor: brand?.colour ?? '#101826' }} className="size-1.5 rounded-full" />
      {name}
    </span>
  )
}
