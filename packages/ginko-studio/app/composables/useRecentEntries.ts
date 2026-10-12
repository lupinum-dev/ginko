// The last entries a person opened on one site, for the empty command palette (UI.md 10.6).
// Kept in this browser only; storage can be blocked (private window), so every access is guarded.
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
