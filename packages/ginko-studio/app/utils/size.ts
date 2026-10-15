// File and content sizes as people read them: 1024-based, "340 KB" below a megabyte, "2,4 MB" above it (one
// decimal at most, in the Studio's language).

/** `format.number` of useI18n. */
type NumberFormat = (value: number, options?: Intl.NumberFormatOptions) => string

/**
 * "340 KB", "2,4 MB", "4 MB". `up` rounds up, for a size over a limit and the amount to cut: 1 byte over 480 KB reads
 * "481 KB von 480 KB, etwa 1 KB", never "480 KB von 480 KB" while the save is refused.
 */
export function sizeText(bytes: number, number: NumberFormat, up = false): string {
  const round = up ? Math.ceil : Math.round
  if (bytes < 1024 * 1024) return `${number(Math.max(1, round(bytes / 1024)))} KB`
  return `${number(round(bytes / (1024 * 1024) * 10) / 10, { maximumFractionDigits: 1 })} MB`
}
