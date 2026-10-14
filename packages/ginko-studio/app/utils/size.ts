// File and content sizes as people read them: 1024-based, "340 KB" below a megabyte, "2,4 MB" above it (one
// decimal at most, in the Studio's language).

/** `format.number` of useI18n. */
type NumberFormat = (value: number, options?: Intl.NumberFormatOptions) => string

/** "340 KB", "2,4 MB", "4 MB". */
export function sizeText(bytes: number, number: NumberFormat): string {
  if (bytes < 1024 * 1024) return `${number(Math.max(1, Math.round(bytes / 1024)))} KB`
  return `${number(bytes / (1024 * 1024), { maximumFractionDigits: 1 })} MB`
}
