// Markdown trees out of page state (CONTENT.md, Phase 14): a page's payload carries `{ ref }`, and the tree loads
// from the site path in `ref` only where a page renders it. One function for file and platform bricks, so a ref in
// page state always matches the path the site's route serves.
import type { Bundle } from './bundle.ts'
import type { MarkdownTree, MarkdownValue } from './markdown.ts'
import type { Locale, Schema } from './types.ts'

/** The ref of one markdown field: `brick` and `id` name the entry (a single's id is its brick), `field` the field. */
export type MarkdownRefOf = (brick: string, id: string, field: string) => string

// `id` may contain `/` (`docs/einstieg`), kept as path segments because a static build would double-encode `%2F`.
const tail = (brick: string, id: string, field: string) => `${encodeURIComponent(brick)}/${id.split('/').map(encodeURIComponent).join('/')}/${encodeURIComponent(field)}.json`

/** The site path that serves a tree of a file brick, from the build (`/__ginko/files/<locale>/md/…`). */
export function fileMarkdownRef(locale: Locale, brick: string, id: string, field: string): string {
  return `/__ginko/files/${locale}/md/${tail(brick, id, field)}`
}

/**
 * The site path that serves a tree of a platform brick at content revision `rev` (`<schemaRev>.<contentRev>`).
 * The rev in the path lets the site's route keep one copy of the platform's trees per revision.
 */
export function platformMarkdownRef(locale: Locale, rev: string, brick: string, id: string, field: string): string {
  return `/__ginko/platform/${locale}/${rev}/md/${tail(brick, id, field)}`
}

/**
 * The bundle for page state: every markdown field that holds its tree becomes `{ ref, toc }` (values that are refs
 * already stay); the toc stays for lists and navigation. `trees` collects the trees by their ref, for the route
 * that serves them. Markdown inside `list` fields stays inline.
 */
export function withMarkdownRefs(bundle: Bundle, schema: Pick<Schema, 'bricks'>, trees: Map<string, MarkdownTree>, refOf: MarkdownRefOf): Bundle {
  const swap = (brick: string, id: string, data: Record<string, unknown>) => {
    const out = { ...data }
    for (const [name, field] of Object.entries(schema.bricks[brick]?.fields ?? {})) {
      const value = out[name] as MarkdownValue | undefined
      if (field.type !== 'markdown' || !value || !('nodes' in value)) continue
      const ref = refOf(brick, id, name)
      trees.set(ref, value)
      out[name] = value.toc === undefined ? { ref } : { ref, toc: value.toc }
    }
    return out
  }
  const bricks = Object.fromEntries(Object.entries(bundle.bricks).map(([key, b]) => [key, b.kind === 'single'
    ? { ...b, data: swap(key, key, b.data) }
    : { ...b, items: b.items.map((item) => ({ ...item, data: swap(key, item.id, item.data) })) }]))
  return { ...bundle, bricks }
}
