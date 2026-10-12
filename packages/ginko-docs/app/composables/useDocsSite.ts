// The site's own entries in app.config (nav, footer and banner links): their texts and their addresses.
export function useDocsSite() {
  const { t, localePath } = useI18n()
  return {
    /** A message key the site defines (`docs.nav.<id>`, `docs.footer.<id>`, `docs.banner.<id>`); the layer's types do not know them. */
    text: t as (key: string) => string,
    /** An internal path in the reader's language; an absolute URL, a mail link or an anchor stays as written. */
    href: (raw: string) => (raw.startsWith('/') && !raw.startsWith('//') ? localePath(raw) : raw),
  }
}
