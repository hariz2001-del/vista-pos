import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { PagerModal } from './PagerModal'

afterEach(cleanup)

function press(...keys: string[]) {
  act(() => { for (const key of keys) screen.getByRole('button', { name: key }).click() })
}

it('uses its own keypad without a native text input and applies the entered number', () => {
  const apply = vi.fn()
  const { container } = render(<PagerModal currentNumber="" onClose={vi.fn()} onApply={apply} />)
  expect(container.querySelector('input')).toBeNull()
  expect(screen.getByRole('button', { name: 'Apply' })).toBeDisabled()
  press('0', '0', '7')
  expect(screen.getByRole('status', { name: 'Entered pager number' })).toHaveTextContent('007')
  press('Apply')
  expect(apply).toHaveBeenCalledWith('007')
})

it('replaces a prefilled number, limits entry to four digits, and supports delete and clear', () => {
  render(<PagerModal currentNumber="007" onClose={vi.fn()} onApply={vi.fn()} />)
  press('1', '2', '3', '4', '5')
  expect(screen.getByRole('status')).toHaveTextContent('1234')
  press('Delete')
  expect(screen.getByRole('status')).toHaveTextContent('123')
  press('Clear')
  expect(screen.getByRole('button', { name: 'Apply' })).toBeDisabled()
})

it('accepts hardware digits and lets Escape cancel without saving', () => {
  const close = vi.fn()
  const apply = vi.fn()
  render(<PagerModal currentNumber="" onClose={close} onApply={apply} />)
  const dialog = screen.getByRole('dialog')
  fireEvent.keyDown(dialog, { key: '8' })
  fireEvent.keyDown(dialog, { key: 'Enter' })
  expect(apply).toHaveBeenCalledWith('8')
  fireEvent.keyDown(dialog, { key: 'Escape' })
  expect(close).toHaveBeenCalledOnce()
})
