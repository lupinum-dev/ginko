/**
 * A phone number as a `tel:` link target: a leading `+` stays, every other character that is not a digit goes
 * (`+43 681 203-03 240` → `+4368120303240`). Empty when the number has no digits.
 */
export function telHref(phone: string | null | undefined): string {
  const digits = (phone ?? '').replace(/\D/g, '')
  if (!digits) return ''
  return (phone ?? '').trim().startsWith('+') ? `+${digits}` : digits
}
