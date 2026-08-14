// Copyright © 2026 Jalapeno Labs

const MINUTE = 60
const HOUR = MINUTE * 60
const DAY = HOUR * 24

const THRESHOLDS = [
  { limit: MINUTE, unit: 'second', size: 1 },
  { limit: HOUR, unit: 'minute', size: MINUTE },
  { limit: DAY, unit: 'hour', size: HOUR },
  { limit: DAY * 30, unit: 'day', size: DAY }
] as const

// Relative time, formatted by the platform so it follows the reader's locale rather than our
// guess at one. Anything older than a month reads better as an actual date.
export function describeAge(timestamp: Date, now: Date): string {
  const elapsed = Math.round((now.getTime() - timestamp.getTime()) / 1000)

  const threshold = THRESHOLDS.find((candidate) => elapsed < candidate.limit)
  if (!threshold) {
    return timestamp.toLocaleDateString()
  }

  const formatter = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' })
  return formatter.format(-Math.round(elapsed / threshold.size), threshold.unit)
}
