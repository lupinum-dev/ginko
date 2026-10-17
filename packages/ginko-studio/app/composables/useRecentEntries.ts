// The last entries a person opened on one site, for the empty command palette (UI.md 10.6), and the last sites opened,
// for "Meine Seiten". Kept in this browser only; storage can be blocked (private window), so every access is guarded.
export interface RecentEntry { to: string; label: string; area: string }

const MAX = 5
const keyOf = (slug: string) => `ginko:recent:${slug}`

export function readRecent(slug: string): RecentEntry[] {
  try {
    const list = JSON.parse(localStorage.getItem(keyOf(slug)) ?? '[]') as unknown
    return Array.isArray(list) ? (list as RecentEntry[]).filter((r) => typeof r?.to === 'string' && typeof r.label === 'string').slice(0, MAX) : []
  } catch {
    return []
  }
}

/** Newest first, no duplicates. */
export function rememberEntry(slug: string, entry: RecentEntry) {
  try {
    localStorage.setItem(keyOf(slug), JSON.stringify([entry, ...readRecent(slug).filter((r) => r.to !== entry.to)].slice(0, MAX)))
  } catch {
    // Not remembering is fine.
  }
}

const SITES_KEY = 'ginko:recent-sites'
const MAX_SITES = 3

/** The slugs of the sites opened last in this browser, newest first. */
export function readRecentSites(): string[] {
  try {
    const list = JSON.parse(localStorage.getItem(SITES_KEY) ?? '[]') as unknown
    return Array.isArray(list) ? list.filter((slug): slug is string => typeof slug === 'string').slice(0, MAX_SITES) : []
  } catch {
    return []
  }
}

export function rememberSite(slug: string) {
  try {
    localStorage.setItem(SITES_KEY, JSON.stringify([slug, ...readRecentSites().filter((s) => s !== slug)].slice(0, MAX_SITES)))
  } catch {
    // Not remembering is fine.
  }
}
