import type { ModifierGroup } from '../../domain/types'

export const FOOD_ADD_ONS: ModifierGroup = {
  id: 'food-add-ons',
  name: 'Add extras',
  description: 'Choose up to two extras',
  minSelect: 0,
  maxSelect: 2,
  options: [
    { id: 'extra-sambal', name: 'Extra Sambal', priceSen: 150, type: 'ADD_ON' },
    { id: 'extra-egg', name: 'Fried Egg', priceSen: 200, type: 'ADD_ON' },
    { id: 'extra-cheese', name: 'Extra Cheese', priceSen: 200, type: 'ADD_ON' },
  ],
}

export const FOOD_REMOVALS: ModifierGroup = {
  id: 'food-removals',
  name: 'Remove ingredients',
  description: 'Instructions for the kitchen',
  minSelect: 0,
  maxSelect: 3,
  options: [
    { id: 'no-onion', name: 'No Onion', priceSen: 0, type: 'REMOVAL' },
    { id: 'no-cucumber', name: 'No Cucumber', priceSen: 0, type: 'REMOVAL' },
    { id: 'no-sauce', name: 'No Sauce', priceSen: 0, type: 'REMOVAL' },
  ],
}

/** Required group: minSelect 1 forces a choice before the item can be added. */
export const SPICE_LEVEL: ModifierGroup = {
  id: 'spice-level',
  name: 'Spice level',
  description: 'Pick one, required',
  minSelect: 1,
  maxSelect: 1,
  options: [
    { id: 'spice-none', name: 'Not Spicy', priceSen: 0, type: 'REMOVAL' },
    { id: 'spice-mild', name: 'Medium', priceSen: 0, type: 'REMOVAL' },
    { id: 'spice-hot', name: 'Extra Spicy', priceSen: 0, type: 'REMOVAL' },
  ],
}

export const DRINK_REMOVALS: ModifierGroup = {
  id: 'drink-removals',
  name: 'Drink preferences',
  description: 'Choose up to two',
  minSelect: 0,
  maxSelect: 2,
  options: [
    { id: 'less-sweet', name: 'Less Sweet', priceSen: 0, type: 'REMOVAL' },
    { id: 'no-sugar', name: 'No Sugar', priceSen: 0, type: 'REMOVAL' },
    { id: 'no-ice', name: 'No Ice', priceSen: 0, type: 'REMOVAL' },
  ],
}

export const DRINK_ADD_ONS: ModifierGroup = {
  id: 'drink-add-ons',
  name: 'Drink add-ons',
  minSelect: 0,
  maxSelect: 2,
  options: [
    { id: 'extra-shot', name: 'Extra Shot', priceSen: 250, type: 'ADD_ON' },
    { id: 'oat-milk', name: 'Oat Milk', priceSen: 200, type: 'ADD_ON' },
    { id: 'extra-gula-melaka', name: 'Gula Melaka', priceSen: 100, type: 'ADD_ON' },
  ],
}

export const CUP_SIZE: ModifierGroup = {
  id: 'cup-size',
  name: 'Cup size',
  description: 'Pick one, required',
  minSelect: 1,
  maxSelect: 1,
  options: [
    { id: 'size-regular', name: 'Regular', priceSen: 0, type: 'REMOVAL' },
    { id: 'size-large', name: 'Large', priceSen: 150, type: 'ADD_ON' },
  ],
}
