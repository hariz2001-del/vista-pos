import { Ban, SlidersHorizontal } from 'lucide-react'
import { formatRinggit } from '../domain/money'
import type { Brand, Product } from '../domain/types'

type Props = {
  products: Product[]
  brandsById: Map<string, Brand>
  onProductTap: (product: Product) => void
}

export function ProductGrid({ products, brandsById, onProductTap }: Props) {
  if (products.length === 0) {
    return (
      <div className="grid flex-1 place-items-center p-8 text-center">
        <div>
          <p className="text-xl font-black">No items</p>
          <p className="mt-1 text-slate-500">Try another brand or category.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="scrollbar-subtle grid flex-1 auto-rows-max grid-cols-2 gap-3 overflow-y-auto p-4 sm:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
      {products.map((product) => {
        const brand = brandsById.get(product.brandId)
        return (
        <button
          key={product.id}
          type="button"
          onClick={() => onProductTap(product)}
          disabled={product.soldOut}
          className="group relative min-h-52 overflow-hidden rounded-2xl border border-slate-200 bg-white text-left shadow-sm transition duration-150 hover:-translate-y-0.5 hover:shadow-lg active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-65"
        >
          <div className="relative h-28 overflow-hidden bg-slate-100">
            {product.imageUrl ? (
              <img
                src={product.imageUrl}
                alt=""
                className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
              />
            ) : (
              // A new business's items often have no picture yet: the brand
              // colour and the item's initials stand in, rather than a broken image.
              <div
                aria-hidden="true"
                className="grid h-full w-full place-items-center text-3xl font-black"
                style={{
                  backgroundColor: brand?.softColour ?? '#eef1f0',
                  color: brand?.colour ?? '#101826',
                }}
              >
                {product.name
                  .split(/\s+/)
                  .slice(0, 2)
                  .map((word) => word[0] ?? '')
                  .join('')
                  .toUpperCase()}
              </div>
            )}
            <span
              style={{ backgroundColor: brand?.colour ?? '#101826' }}
              className="absolute left-2 top-2 rounded-full px-2.5 py-1 text-[0.65rem] font-black uppercase tracking-wider text-white"
            >
              {brand?.name ?? '—'}
            </span>
            {product.modifierGroups.length > 0 ? (
              <span className="absolute right-2 top-2 grid size-8 place-items-center rounded-full bg-white/95 text-ink shadow">
                <SlidersHorizontal aria-label="Has options" className="size-4" />
              </span>
            ) : null}
            {product.soldOut ? (
              <div className="absolute inset-0 grid place-items-center bg-ink/75 text-white">
                <span className="flex items-center gap-2 rounded-full bg-danger px-3 py-1.5 text-sm font-black uppercase tracking-wide">
                  <Ban aria-hidden="true" className="size-4" /> Sold out
                </span>
              </div>
            ) : null}
          </div>
          <div className="p-3.5">
            <p className="line-clamp-1 font-black text-ink">{product.name}</p>
            <p className="mt-1 line-clamp-1 text-xs text-slate-500">{product.description}</p>
            <p className="mt-3 text-lg font-black text-ink">{formatRinggit(product.unitPriceSen)}</p>
          </div>
        </button>
        )
      })}
    </div>
  )
}
