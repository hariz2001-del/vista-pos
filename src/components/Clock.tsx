import { Clock3 } from 'lucide-react'
import { useEffect, useState } from 'react'

const TIME = new Intl.DateTimeFormat('en-MY', {
  hour: 'numeric',
  minute: '2-digit',
  hour12: true,
  timeZone: 'Asia/Kuala_Lumpur',
})

/**
 * The time at the counter, Malaysia time whatever the tablet's own setting.
 * Checked every few seconds so the minute turns over on time without
 * re-rendering the register every second.
 */
export function Clock() {
  const [now, setNow] = useState(() => new Date())

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 5_000)
    return () => window.clearInterval(timer)
  }, [])

  return (
    <time
      dateTime={now.toISOString()}
      className="flex min-h-11 items-center gap-2 rounded-xl bg-white/10 px-3 text-base font-black tabular-nums"
    >
      <Clock3 aria-hidden="true" className="size-4 text-slate-300" />
      {TIME.format(now)}
    </time>
  )
}
