import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { PinPad } from './PinPad'

afterEach(cleanup)

function renderPad(onSuccess = vi.fn()) {
  render(
    <PinPad
      title="Open Shift"
      expectedPin="1234"
      confirmLabel="PIN 4 digit"
      onSuccess={onSuccess}
    />,
  )
  return onSuccess
}

function press(...keys: string[]) {
  // One act() for all of them, so every handler runs before React re-renders.
  // This is what a fast double-tap looks like, and reading `digits` from the
  // render closure instead of a ref silently dropped the extra digits.
  act(() => {
    for (const key of keys) {
      screen.getByRole('button', { name: key }).click()
    }
  })
}

describe('PinPad', () => {
  it('accepts the correct PIN even when every digit lands in one tick', () => {
    const onSuccess = renderPad()
    press('1', '2', '3', '4')
    expect(onSuccess).toHaveBeenCalledTimes(1)
  })

  it('accepts the correct PIN entered one tap at a time', () => {
    const onSuccess = renderPad()
    press('1')
    press('2')
    press('3')
    press('4')
    expect(onSuccess).toHaveBeenCalledTimes(1)
  })

  it('rejects a wrong PIN without calling onSuccess', () => {
    const onSuccess = renderPad()
    press('9', '9', '9', '9')
    expect(onSuccess).not.toHaveBeenCalled()
    expect(screen.getByRole('alert')).toHaveTextContent('Wrong PIN')
  })

  it('ignores extra digits once four are entered', () => {
    const onSuccess = renderPad()
    press('1', '2', '3', '4', '5')
    expect(onSuccess).toHaveBeenCalledTimes(1)
  })

  it('removes the last digit on backspace', () => {
    const onSuccess = renderPad()
    press('1', '2', '9')
    act(() => {
      screen.getByRole('button', { name: 'Delete one digit' }).click()
    })
    press('3', '4')
    expect(onSuccess).toHaveBeenCalledTimes(1)
  })
})
