import { useMemo, useState } from 'react'
import { Check, Plus, X } from 'lucide-react'
import { formatRinggit, formatSignedRinggit } from '../domain/money'
import type { Brand, Product, SnapshottedModifier } from '../domain/types'

type Props = {
  product: Product
  brand: Brand | undefined
  categoryName: string
  onClose: () => void
  onConfirm: (modifiers: SnapshottedModifier[]) => void
}

/**
 * Rendered inside the catalogue column, not over the whole app, so it is
 * absolutely positioned rather than fixed. The order panel on the right stays
 * visible and readable while the cashier configures an item.
 */
export function ModifierModal({ product, brand, categoryName, onClose, onConfirm }: Props) {
  const [selected, setSelected] = useState<Record<string, string[]>>({})

  const isValid = product.modifierGroups.every((group) => {
    const count = selected[group.id]?.length ?? 0
    return count >= group.minSelect && count <= group.maxSelect
  })

  const selectedModifiers = useMemo(
    () =>
      product.modifierGroups.flatMap((group) =>
        group.options
          .filter((option) => selected[group.id]?.includes(option.id))
          .map((option) => ({
            modifierId: option.id,
            groupName: group.name,
            name: option.name,
            priceSen: option.priceSen,
            type: option.type,
          })),
      ),
    [product.modifierGroups, selected],
  )

  const addOnTotalSen = selectedModifiers.reduce((sum, modifier) => sum + modifier.priceSen, 0)

  function toggleOption(groupId: string, optionId: string, maxSelect: number) {
    setSelected((current) => {
      const values = current[groupId] ?? []
      if (values.includes(optionId)) {
        return { ...current, [groupId]: values.filter((id) => id !== optionId) }
      }
      if (maxSelect === 1) return { ...current, [groupId]: [optionId] }
      if (values.length >= maxSelect) return current
      return { ...current, [groupId]: [...values, optionId] }
    })
  }

  return (
    <div
      className="absolute inset-0 z-30 flex items-center justify-center bg-ink/25 p-4 backdrop-blur-sm sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="modifier-title"
    >
      <div className="flex max-h-full w-full max-w-3xl flex-col overflow-hidden rounded-3xl bg-canvas shadow-2xl ring-1 ring-black/5">
        <header className="flex min-h-20 shrink-0 items-center gap-4 border-b border-slate-200 bg-white px-5">
          <button
            type="button"
            onClick={onClose}
            className="grid size-12 shrink-0 place-items-center rounded-xl bg-slate-100 hover:bg-slate-200"
            aria-label="Close options"
          >
            <X aria-hidden="true" className="size-6" />
          </button>
          <div className="min-w-0">
            <p
              style={{ color: brand?.colour ?? '#101826' }}
              className="truncate text-xs font-black uppercase tracking-wider"
            >
              {brand?.name ?? '—'} · {categoryName}
            </p>
            <h2 id="modifier-title" className="truncate text-2xl font-black">
              {product.name}
            </h2>
          </div>
          <p className="ml-auto shrink-0 text-xl font-black">
            {formatRinggit(product.unitPriceSen + addOnTotalSen)}
          </p>
        </header>

        <div className="scrollbar-subtle min-h-0 flex-1 overflow-y-auto p-5">
          <div className="space-y-5">
            {product.modifierGroups.map((group) => {
              const selectedCount = selected[group.id]?.length ?? 0
              const groupValid =
                selectedCount >= group.minSelect && selectedCount <= group.maxSelect
              return (
                <section
                  key={group.id}
                  className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h3 className="text-lg font-black">{group.name}</h3>
                      <p className="mt-1 text-sm text-slate-500">
                        {group.description ?? `Choose up to ${group.maxSelect}`}
                      </p>
                    </div>
                    <span
                      className={`rounded-full px-3 py-1 text-xs font-black ${
                        groupValid ? 'bg-green-100 text-success' : 'bg-amber-100 text-warning'
                      }`}
                    >
                      {group.minSelect > 0
                        ? `Required · pick ${group.minSelect}`
                        : `Up to ${group.maxSelect}`}
                    </span>
                  </div>

                  <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-3">
                    {group.options.map((option) => {
                      const isSelected = selected[group.id]?.includes(option.id) ?? false
                      const isAtLimit = !isSelected && selectedCount >= group.maxSelect
                      return (
                        <button
                          key={option.id}
                          type="button"
                          onClick={() => toggleOption(group.id, option.id, group.maxSelect)}
                          disabled={isAtLimit}
                          aria-pressed={isSelected}
                          className={`flex min-h-20 items-center gap-3 rounded-2xl border-2 p-4 text-left transition ${
                            isSelected
                              ? 'border-ink bg-ink text-white shadow-md'
                              : 'border-slate-200 bg-white hover:border-slate-400 disabled:opacity-40'
                          }`}
                        >
                          <span
                            className={`grid size-8 shrink-0 place-items-center rounded-full ${
                              isSelected ? 'bg-white text-ink' : 'bg-slate-100'
                            }`}
                          >
                            {isSelected ? (
                              <Check aria-hidden="true" className="size-4" />
                            ) : (
                              <Plus aria-hidden="true" className="size-4" />
                            )}
                          </span>
                          <span className="min-w-0">
                            <span className="block font-extrabold">{option.name}</span>
                            <span
                              className={`mt-0.5 block text-sm font-bold ${
                                isSelected
                                  ? 'text-slate-300'
                                  : option.priceSen > 0
                                    ? 'text-food'
                                    : 'text-slate-500'
                              }`}
                            >
                              {option.priceSen > 0 ? formatSignedRinggit(option.priceSen) : 'RM 0.00'}
                            </span>
                          </span>
                        </button>
                      )
                    })}
                  </div>
                </section>
              )
            })}
          </div>
        </div>

        <footer className="shrink-0 border-t border-slate-200 bg-white p-4">
          <button
            type="button"
            disabled={!isValid}
            onClick={() => onConfirm(selectedModifiers)}
            className="flex min-h-16 w-full items-center justify-center rounded-2xl bg-ink px-6 text-lg font-black text-white shadow-lg hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            {isValid
              ? `Add to Order · ${formatRinggit(product.unitPriceSen + addOnTotalSen)}`
              : 'Choose the required options'}
          </button>
        </footer>
      </div>
    </div>
  )
}
