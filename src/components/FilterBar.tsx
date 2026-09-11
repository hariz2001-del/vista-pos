import { Search, X } from 'lucide-react'
import type { Brand, Category } from '../domain/types'

type Props = {
  brands: Brand[]
  categories: Category[]
  selectedBrandId: string | null
  selectedCategoryId: string | null
  search: string
  onBrandChange: (brandId: string | null) => void
  onCategoryChange: (categoryId: string | null) => void
  onSearchChange: (value: string) => void
}

export function FilterBar({
  brands,
  categories,
  selectedBrandId,
  selectedCategoryId,
  search,
  onBrandChange,
  onCategoryChange,
  onSearchChange,
}: Props) {
  return (
    <div className="space-y-3 border-b border-slate-200 bg-white px-4 py-3 sm:px-5">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex gap-2" aria-label="Filter by brand">
          <button
            type="button"
            onClick={() => onBrandChange(null)}
            className={`min-h-11 min-w-20 rounded-xl px-4 text-sm font-extrabold transition ${
              selectedBrandId === null
                ? 'bg-ink text-white shadow-md'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            All
          </button>

          {brands.map((brand) => {
            const isActive = selectedBrandId === brand.id
            return (
              <button
                key={brand.id}
                type="button"
                onClick={() => onBrandChange(brand.id)}
                // Brand colours are data, so they cannot be Tailwind utility
                // classes resolved at build time.
                style={isActive ? { backgroundColor: brand.colour } : undefined}
                className={`min-h-11 min-w-20 rounded-xl px-4 text-sm font-extrabold transition ${
                  isActive ? 'text-white shadow-md' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                {brand.name}
              </button>
            )
          })}
        </div>

        <div className="relative ml-auto min-w-[10rem] flex-1 sm:max-w-xs">
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400"
          />
          <input
            type="search"
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder="Search items…"
            aria-label="Search items"
            className="min-h-11 w-full rounded-xl border border-slate-200 bg-slate-50 pl-9 pr-9 text-sm font-semibold focus:border-ink focus:bg-white"
          />
          {search ? (
            <button
              type="button"
              onClick={() => onSearchChange('')}
              className="absolute right-1.5 top-1/2 grid size-8 -translate-y-1/2 place-items-center rounded-lg text-slate-400 hover:bg-slate-200"
              aria-label="Clear search"
            >
              <X aria-hidden="true" className="size-4" />
            </button>
          ) : null}
        </div>
      </div>

      <div
        className="scrollbar-subtle flex gap-2 overflow-x-auto pb-1"
        aria-label="Filter by category"
      >
        <button
          type="button"
          onClick={() => onCategoryChange(null)}
          className={`min-h-10 shrink-0 rounded-full border px-4 text-sm font-bold transition ${
            selectedCategoryId === null
              ? 'border-ink bg-ink text-white'
              : 'border-slate-200 bg-white text-slate-600 hover:border-slate-400'
          }`}
        >
          All categories
        </button>

        {categories.map((category) => (
          <button
            key={category.id}
            type="button"
            onClick={() => onCategoryChange(category.id)}
            className={`min-h-10 shrink-0 rounded-full border px-4 text-sm font-bold transition ${
              selectedCategoryId === category.id
                ? 'border-ink bg-ink text-white'
                : 'border-slate-200 bg-white text-slate-600 hover:border-slate-400'
            }`}
          >
            {category.name}
          </button>
        ))}
      </div>
    </div>
  )
}
