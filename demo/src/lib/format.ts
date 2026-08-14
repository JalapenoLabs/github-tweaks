// Copyright © 2026 Jalapeno Labs

const BYTE_UNITS = ['B', 'kB', 'MB', 'GB', 'TB'] as const

// Sizes are shown to people, not machines, so we stop at one decimal place: the difference
// between 1.4 MB and 1.43 MB never changes what anyone does next.
export function formatBytes(bytes: number): string {
  if (bytes < 1) {
    return '0 B'
  }

  const unitIndex = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), BYTE_UNITS.length - 1)
  const scaled = bytes / 1024 ** unitIndex

  return `${scaled.toFixed(unitIndex ? 1 : 0)} ${BYTE_UNITS[unitIndex]}`
}

// Truncates in the middle rather than the end, which keeps the file extension visible. A list
// of "componentWithAVeryLongNa…" reads as identical rows; keeping the tail does not.
export function truncateMiddle(text: string, maxLength: number): string {
  if (text.length <= maxLength) {
    return text
  }

  const head = Math.ceil((maxLength - 1) / 2)
  const tail = Math.floor((maxLength - 1) / 2)

  return `${text.slice(0, head)}…${text.slice(text.length - tail)}`
}
