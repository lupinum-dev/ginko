// Pure helpers of the api block: grouping of parameters, the signature text and deep-link ids. No Vue.

/** The label of a parameter's group; a missing or blank `group` falls into the default group. */
export function groupLabel(raw: unknown, fallback: string): string {
  return String(raw ?? '').trim() || fallback
}

/** Stable deep-link id of a parameter row, e.g. `api-query-page-size` for group "Query", name `page_size`. */
export function apiEntryId(group: string, name: string): string {
  const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
  return `api-${slug(group)}-${slug(name)}`
}

/** Everything after the name, built from the props so authors never type a signature: `?`, `: type`, ` = default`. */
export function signatureTail(p: { type?: string; optional?: boolean; defaultValue?: string }): string {
  return `${p.optional ? '?' : ''}${p.type ? `: ${p.type}` : ''}${p.defaultValue ? ` = ${p.defaultValue}` : ''}`
}

/** Group labels in order of first appearance, each with the indexes of its parameters. */
export function groupParams(groupOf: readonly string[]): { label: string; indexes: number[] }[] {
  const groups = new Map<string, number[]>()
  groupOf.forEach((label, i) => groups.set(label, [...(groups.get(label) ?? []), i]))
  return [...groups].map(([label, indexes]) => ({ label, indexes }))
}
