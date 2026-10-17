// The sites a person may open (sites.mine), as "Meine Seiten" and the command palette list them.

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
