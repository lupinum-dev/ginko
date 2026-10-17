/**
 * A phone number as a `tel:` link target: a leading `+` stays, a trunk `(0)` after the country code goes, and so does
 * every other character that is not a digit (`+43 (0)681 203-03 240` → `+4368120303240`). Empty without digits.
 */
export function telHref(phone: string | null | undefined): string {
  const text = (phone ?? '').trim()
  const international = text.startsWith('+')
  const digits = (international ? text.replace(/\(0\)/g, '') : text).replace(/\D/g, '')
  if (!digits) return ''
  return international ? `+${digits}` : digits
}
