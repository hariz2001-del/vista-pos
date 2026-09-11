const BUSINESS_TIME_ZONE = 'Asia/Kuala_Lumpur'

type DateParts = {
  year: number
  month: number
  day: number
  hour: number
}

function malaysiaParts(date: Date): DateParts {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: BUSINESS_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date)

  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]))
  return {
    year: Number(values.year),
    month: Number(values.month),
    day: Number(values.day),
    hour: Number(values.hour),
  }
}

function isoDate(year: number, month: number, day: number): string {
  return `${year.toString().padStart(4, '0')}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`
}

export function getBusinessDate(date: Date, cutoffHour = 5): string {
  const parts = malaysiaParts(date)
  if (parts.hour >= cutoffHour) {
    return isoDate(parts.year, parts.month, parts.day)
  }

  const priorDay = new Date(Date.UTC(parts.year, parts.month - 1, parts.day - 1, 12))
  return isoDate(
    priorDay.getUTCFullYear(),
    priorDay.getUTCMonth() + 1,
    priorDay.getUTCDate(),
  )
}

export function formatBusinessDate(value: string): string {
  const [year, month, day] = value.split('-').map(Number)
  return new Intl.DateTimeFormat('en-MY', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: BUSINESS_TIME_ZONE,
  }).format(new Date(Date.UTC(year, month - 1, day, 12)))
}
