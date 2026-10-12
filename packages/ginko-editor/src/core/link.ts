// Rules for the address of a link that the UI shows before it asks the core (`isSafeHref`).

export const LINK_REFUSED = 'Dieser Link ist nicht erlaubt. Erlaubt sind Webadressen (https://…), E-Mail (mailto:) und Telefon (tel:).'

/** What a person types into the link box, made into an address: "www.x.de" gets https://, "a@b.de" gets mailto:. */
export function normalizeHref(raw: string): string {
  const t = raw.trim()
  // The core rule refuses spaces anywhere, so "tel:+41 44 123 45 67" is written without them.
  if (/^tel:/i.test(t)) return t.replace(/\s+/g, '')
  if (/^[a-z0-9-]+(\.[a-z0-9-]+)+([/?#]\S*)?$/i.test(t)) return `https://${t}`
  if (/^[^\s@/:]+@[^\s@/:]+\.[^\s@/:]+$/.test(t)) return `mailto:${t}`
  return t
}
