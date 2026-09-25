import { CalendarDays, Moon } from 'lucide-react'
import { PinPad, type PinVerdict } from '../components/PinPad'
import { formatBusinessDate } from '../domain/business-date'
import type { Cashier } from '../domain/types'

type Props = {
  cashier: Cashier
  outletName: string
  businessDate: string
  /** Opens the shift on the server; resolves to what the PIN pad should show. */
  verifyPin: (pin: string) => Promise<PinVerdict>
  /** Something the cashier should know before opening, e.g. another business's unsent sales. */
  notice?: string | null
}

/**
 * The business date is resolved once, here, and every sale in the shift is
 * stamped with it. A shift that runs past midnight keeps the date it opened on,
 * so a 1am sale reports as part of the night it belongs to.
 *
 * There is deliberately no sign-out here. The counter stays signed in; the PIN
 * is the only thing the cashier ever uses, and only the owner can sign the
 * tablet out, from the RMS.
 */
export function ShiftOpenScreen({ cashier, outletName, businessDate, verifyPin, notice = null }: Props) {
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

          {notice ? (
            <p className="mt-3 rounded-2xl bg-amber-50 p-3 text-xs font-bold text-amber-900" role="status">
              {notice}
            </p>
          ) : null}

          <div className="mt-7 grid place-items-center">
            <PinPad
              title="Open Shift"
              subtitle="Enter the counter PIN to start"
              confirmLabel="4-digit PIN"
              verify={verifyPin}
            />
          </div>
        </div>
      </div>
    </div>
  )
}
