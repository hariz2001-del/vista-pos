import { CalendarDays, Moon } from 'lucide-react'
import { PinPad } from '../components/PinPad'
import { formatBusinessDate } from '../domain/business-date'
import type { Cashier } from '../domain/types'

type Props = {
  cashier: Cashier
  outletName: string
  businessDate: string
  onShiftOpen: () => void
  onSignOut: () => void
}

/**
 * The business date is resolved once, here, and every sale in the shift is
 * stamped with it. A shift that runs past midnight keeps the date it opened on,
 * so a 1am sale reports as part of the night it belongs to.
 */
export function ShiftOpenScreen({
  cashier,
  outletName,
  businessDate,
  onShiftOpen,
  onSignOut,
}: Props) {
  const isAfterMidnight = new Date().getHours() < 5

  return (
    <div className="grid min-h-dvh place-items-center bg-canvas p-5">
      <div className="w-full max-w-md">
        <div className="rounded-3xl bg-white p-7 shadow-xl">
          <div className="flex items-center gap-4">
            <img
              src={cashier.imageUrl}
              alt=""
              className="size-14 rounded-2xl border border-slate-200 object-cover"
            />
            <div className="min-w-0">
              <p className="truncate text-xs font-bold uppercase tracking-[0.2em] text-slate-400">
                {outletName}
              </p>
              <p className="truncate text-lg font-black text-ink">{cashier.name}</p>
            </div>
          </div>

          <div className="mt-5 flex items-center gap-3 rounded-2xl bg-canvas p-4">
            <CalendarDays aria-hidden="true" className="size-5 shrink-0 text-slate-500" />
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-slate-500">
                Business date
              </p>
              <p className="text-base font-black text-ink">{formatBusinessDate(businessDate)}</p>
            </div>
          </div>

          {isAfterMidnight ? (
            <p className="mt-3 flex items-start gap-2 rounded-2xl bg-amber-50 p-3 text-xs font-bold text-amber-900">
              <Moon aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
              After midnight — sales are recorded under yesterday's business date until 5am.
            </p>
          ) : null}

          <div className="mt-7 grid place-items-center">
            <PinPad
              title="Open Shift"
              subtitle="Enter the counter PIN to start"
              expectedPin={cashier.pin}
              confirmLabel="4-digit PIN"
              onSuccess={onShiftOpen}
            />
          </div>
        </div>

        <button
          type="button"
          onClick={onSignOut}
          className="mx-auto mt-4 block min-h-11 px-4 text-sm font-black text-slate-500 hover:text-ink"
        >
          Sign out
        </button>
      </div>
    </div>
  )
}
