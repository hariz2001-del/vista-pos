import { CloudOff, Expand, LogOut, Minimize, PlugZap, ReceiptText, Wifi, WifiOff } from 'lucide-react'
import { formatBusinessDate } from '../domain/business-date'

type Props = {
  outletName: string
  businessDate: string
  cashierName: string
  cashierImageUrl: string
  isDemo: boolean
  isOnline: boolean
  pendingCount: number
  onOpenRecentSales: () => void
  onCloseShift: () => void
  displayMode: {
    isActive: boolean
    isSupported: boolean
    error: string | null
    toggle: () => Promise<void>
  }
  /** Dev-only switch so the offline path can actually be driven without pulling the plug. */
  simulatedOffline: {
    isForced: boolean
    toggle: () => void
  }
}

export function TopBar({
  outletName,
  businessDate,
  cashierName,
  cashierImageUrl,
  isDemo,
  isOnline,
  pendingCount,
  onOpenRecentSales,
  onCloseShift,
  displayMode,
  simulatedOffline,
}: Props) {
  const DisplayIcon = displayMode.isActive ? Minimize : Expand

  return (
    <header className="flex h-[4.5rem] shrink-0 items-center gap-3 bg-ink px-4 text-white shadow-lg sm:px-6">
      <div className="flex min-w-0 items-center gap-3">
        <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-white text-lg font-black text-ink">
          V
        </div>
        <div className="min-w-0">
          <p className="truncate text-[0.65rem] font-bold uppercase tracking-[0.24em] text-slate-400">
            {outletName}
          </p>
          <p className="truncate text-sm font-bold sm:text-base">
            Shift · {formatBusinessDate(businessDate)}
          </p>
        </div>
      </div>

      <div className="ml-auto flex items-center gap-2">
        <div className="hidden min-h-11 items-center gap-2 rounded-xl bg-white/10 px-3 text-sm font-semibold xl:flex">
          <img
            src={cashierImageUrl}
            alt=""
            className="size-7 rounded-full border border-white/30 object-cover"
          />
          {cashierName}
        </div>

        {isDemo ? (
          <span className="hidden rounded-lg bg-amber-300 px-2.5 py-1 text-xs font-black uppercase tracking-wider text-amber-950 md:inline-flex">
            Demo
          </span>
        ) : null}

        {pendingCount > 0 ? (
          <span
            className="flex min-h-11 items-center gap-2 rounded-xl bg-amber-400/20 px-3 text-sm font-black text-amber-200"
            role="status"
          >
            <CloudOff aria-hidden="true" className="size-4" />
            {pendingCount}
            <span className="hidden sm:inline">unsent</span>
          </span>
        ) : null}

        <button
          type="button"
          onClick={onOpenRecentSales}
          className="grid min-h-11 min-w-11 place-items-center rounded-xl border border-white/20 bg-white/10 transition hover:bg-white/20"
          aria-label="Today's sales"
          title="Today's sales"
        >
          <ReceiptText aria-hidden="true" className="size-5" />
        </button>

        {import.meta.env.DEV ? (
          <button
            type="button"
            onClick={simulatedOffline.toggle}
            className={`grid min-h-11 min-w-11 place-items-center rounded-xl border transition ${
              simulatedOffline.isForced
                ? 'border-amber-300 bg-amber-400/30 text-amber-100'
                : 'border-white/20 bg-white/10 hover:bg-white/20'
            }`}
            aria-label="Toggle simulated offline (dev only)"
            title="Dev: simulate offline"
          >
            <PlugZap aria-hidden="true" className="size-5" />
          </button>
        ) : null}

        <div
          className={`flex min-h-11 items-center gap-2 rounded-xl px-3 text-sm font-bold ${
            isOnline ? 'bg-green-500/20 text-green-200' : 'bg-red-500/20 text-red-200'
          }`}
          role="status"
        >
          {isOnline ? (
            <Wifi aria-hidden="true" className="size-4" />
          ) : (
            <WifiOff aria-hidden="true" className="size-4" />
          )}
          <span className="hidden sm:inline">{isOnline ? 'Online' : 'Offline'}</span>
        </div>

        <button
          type="button"
          onClick={() => void displayMode.toggle()}
          disabled={!displayMode.isSupported}
          title={displayMode.error ?? 'Full screen and wake lock'}
          className="grid min-h-11 min-w-11 place-items-center rounded-xl border border-white/20 bg-white/10 transition hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-40"
          aria-label={displayMode.isActive ? 'Exit full screen' : 'Enable full screen and wake lock'}
        >
          <DisplayIcon aria-hidden="true" className="size-5" />
        </button>

        <button
          type="button"
          onClick={onCloseShift}
          className="grid min-h-11 min-w-11 place-items-center rounded-xl border border-white/20 bg-white/10 transition hover:bg-danger"
          aria-label="Close shift"
          title="Close shift"
        >
          <LogOut aria-hidden="true" className="size-5" />
        </button>
      </div>
    </header>
  )
}
