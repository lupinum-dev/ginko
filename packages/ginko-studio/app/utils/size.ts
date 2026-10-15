// File and content sizes as people read them: 1024-based, "340 KB" below a megabyte, "2,4 MB" above it (one
// decimal at most, in the Studio's language).

/** `format.number` of useI18n. */
type NumberFormat = (value: number, options?: Intl.NumberFormatOptions) => string

/**
 * "340 KB", "2,4 MB", "4 MB". Next to a limit the rounding must not cross it: `up` for a size over a limit and the
 * amount to cut (1 byte over 480 KB reads "481 KB von 480 KB, etwa 1 KB"), `down` for a size just under it
 * (1 byte under 4 MB reads "3,9 MB von 4 MB"), never "480 KB von 480 KB" or "4 MB von 4 MB" for either.
 */
export function sizeText(bytes: number, number: NumberFormat, rounding: 'up' | 'down' | 'nearest' = 'nearest'): string {
  const round = { up: Math.ceil, down: Math.floor, nearest: Math.round }[rounding]
  if (bytes < 1024 * 1024) return `${number(Math.max(1, round(bytes / 1024)))} KB`
  return `${number(round(bytes / (1024 * 1024) * 10) / 10, { maximumFractionDigits: 1 })} MB`
}
