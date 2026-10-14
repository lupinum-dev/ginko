// The pure part of the agent routes: which entry a path belongs to, and whether a client asks for Markdown.
import type { Bundle, BundleItem } from './bundle.ts'

export interface EntryMatch { brick: string; item: BundleItem; /** The entry's page URL in the bundle's locale. */ url: string }

const trimSlash = (path: string) => (path.length > 1 ? path.replace(/\/+$/, '') || '/' : path)

/** `/docs/a.md` is the Markdown of `/docs/a`; `/index.md` is `/`. Undefined when the path is not a Markdown path. */
export function markdownRequestPath(path: string): string | undefined {
  if (!path.endsWith('.md')) return undefined
  const page = path.slice(0, -3)
  if (page === '' || page === '/index') return '/'
  return page.endsWith('/') ? undefined : page
}

/** The collection entry whose URL in the bundle's locale is `path` (a trailing slash does not matter). */
export function findEntryByPath(bundle: Bundle, path: string): EntryMatch | undefined {
  const wanted = trimSlash(path)
  for (const [brick, entry] of Object.entries(bundle.bricks)) {
    if (entry.kind !== 'collection') continue
    for (const item of entry.items) {
      const url = item.urls?.[bundle.locale]
      if (url && trimSlash(url) === wanted) return { brick, item, url }
    }
  }
  return undefined
}
