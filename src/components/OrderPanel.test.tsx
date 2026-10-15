import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import type { ComponentProps } from 'react'
import { OrderPanel } from './OrderPanel'

afterEach(cleanup)

const base: ComponentProps<typeof OrderPanel> = {
  mode: 'CONFIRMED', cart: [], cartDiscountSen: 0,
  totals: { subtotalSen: 0, itemDiscountSen: 0, cartDiscountSen: 0, discountSen: 0, netTotalSen: 0, itemCount: 0 },
  brandsById: new Map(), isOnline: true, isOpen: true, isSubmitting: false,
  hasAttempted: false, error: null, paidSale: null,
  onClose: vi.fn(), onQuantityChange: vi.fn(), onDiscount: vi.fn(), onClear: vi.fn(),
  onConfirmOrder: vi.fn(), onEditOrder: vi.fn(), onMarkPaid: vi.fn(), onNextOrder: vi.fn(),
}

it('asks for a pager only after confirmation and blocks payment until entered', () => {
  const { rerender } = render(<OrderPanel {...base} mode="BUILDING" pagerRequired />)
  expect(screen.queryByRole('button', { name: /Pager number/ })).toBeNull()
  rerender(<OrderPanel {...base} pagerRequired />)
  expect(screen.getByRole('button', { name: /Pager number/ })).toBeVisible()
  expect(screen.getByRole('button', { name: 'Mark Paid' })).toBeDisabled()
  rerender(<OrderPanel {...base} pagerRequired pagerNumber="007" />)
  expect(screen.getByRole('button', { name: 'Mark Paid' })).toBeEnabled()
})

it('leaves the existing flow available when pagers are off', () => {
  render(<OrderPanel {...base} />)
  expect(screen.queryByRole('button', { name: /Pager number/ })).toBeNull()
  expect(screen.getByRole('button', { name: 'Mark Paid' })).toBeEnabled()
})

it('locks the pager after a payment attempt so retries stay identical', () => {
  render(<OrderPanel {...base} pagerRequired pagerNumber="007" hasAttempted />)
  expect(screen.getByRole('button', { name: /Pager number/ })).toBeDisabled()
  expect(screen.getByRole('button', { name: 'Retry Same Order' })).toBeEnabled()
})
