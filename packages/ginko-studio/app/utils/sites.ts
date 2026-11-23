// The sites a person may open (sites.mine), as "Meine Seiten" and the command palette list them.
import { slugify } from '@lupinum/ginko/internal'

/**
 * A site's identifier as the server accepts it (ginko-server `lib/input.ts` SLUG, which decides): a lowercase letter,
 * then 1 to 40 lowercase letters, digits or hyphens. Checked here only so the form can name the rule next to the field.
 */
export const SITE_ID = /^[a-z][a-z0-9-]{1,40}$/

/** An identifier made from a site's name ("Café Central" → "cafe-central"), '' while the name gives none. */
export function siteIdOf(name: string): string {
  if (!/[a-z0-9]/i.test(name)) return ''
  return slugify(name).replace(/^[^a-z]+/, '').slice(0, 41).replace(/-+$/, '')
}

interface SiteLike { slug: string; name: string; url: string }

/** The address people know a site by ("gasthaus-linde.at"); the stored URL as it is when it does not parse. */
export function siteHost(url: string): string {
  try {
    return new URL(url).host
  } catch {
    return url
  }
}

/** By name, as the reader's language sorts ("Ährenfeld" next to "Ahorn"). */
export const bySiteName = (locale: string) => {
  const collator = new Intl.Collator(locale)
  return (a: SiteLike, b: SiteLike) => collator.compare(a.name, b.name)
}

/** Whether the typed text is part of the site's name, address or slug, ignoring case. */
export function siteMatches(site: SiteLike, text: string): boolean {
  const needle = text.trim().toLocaleLowerCase()
  return [site.name, siteHost(site.url), site.slug].some((value) => value.toLocaleLowerCase().includes(needle))
}
