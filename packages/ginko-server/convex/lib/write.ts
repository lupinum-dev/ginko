// Steps 6 and 7 of the shared write flow (SPEC 4.1): check files and budget, then write
// the entry with its revisions, the change row and the file references in one place.
import type { Field, Fields, Json } from '@lupinum/ginko'
import type { FileField } from '@lupinum/ginko/internal'
import { checkLinks, entryBytes, fileProblem, linkTargets, stableJson, type LinkIssue, type Schema, type ValidateOptions } from '@lupinum/ginko/internal'
import type { Doc, Id } from '../_generated/dataModel'
import type { MutationCtx, QueryCtx } from '../_generated/server'
import { bundleOf, type NewItem } from '../bundle'
import { byOf, fail, type Actor } from './access'
import { fileIdsOf, treesOf, usesOf, type Data, type Prints, type Use } from './content'
import type { Recorded } from './history'
import { putTrees } from './trees'

export { SITE_BUDGET as BUDGET } from '@lupinum/ginko/internal'
import { SITE_BUDGET as BUDGET } from '@lupinum/ginko/internal'

/** "340 KB", "4.2 MB": sizes in error texts, on the same 1024 base as the Studio's `sizeText` (components/files/util.ts). */
export function sizeText(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1).replace(/\.0$/, '')} MB`
}

/** The params of a budget error: how much is used, the limit, and how much is over it. */
export const overBudget = (used: number, limit: number) => ({ used: sizeText(used), limit: sizeText(limit), over: sizeText(used - limit) })

/**
 * Fields may only point at ready uploads of the same site (SPEC 4.3 point 3). The ids in `images`
 * are the ones written to an `image` field: they must be image uploads, not a PDF.
 */
export async function checkFiles(ctx: QueryCtx, site: Id<'sites'>, ids: Iterable<string>, images: ReadonlySet<string> = new Set()) {
  for (const id of ids) {
    const upload = ctx.db.normalizeId('uploads', id) ? await ctx.db.get(id as Id<'uploads'>) : null
    if (!upload || upload.site !== site || upload.status !== 'ready' || upload.trashedAt) {
      fail('INVALID', 'errors.fileNoLongerAvailable', undefined, { file: id })
    }
    if (images.has(id) && !upload.mime.startsWith('image/')) fail('INVALID', 'errors.fileNotImage', undefined, { file: id })
  }
}

/** Checks the files an edit adds: those new to the entry, those new to an image field (a PDF may already sit in a file field), and every file newly placed in a file field. */
export async function checkNewFiles(ctx: QueryCtx, site: Id<'sites'>, fields: Fields, before: Data, after: Data) {
  const known = fileIdsOf(fields, before)
  const knownImages = fileIdsOf(fields, before, 'image')
  const images = new Set([...fileIdsOf(fields, after, 'image')].filter((id) => !knownImages.has(id)))
  const added = [...fileIdsOf(fields, after)].filter((id) => !known.has(id))
  await checkFiles(ctx, site, new Set([...added, ...images]), images)
  // A file's rules belong to the field it sits in. An upload already in a lenient field must still pass the stricter field it is newly placed in.
  const placed = new Set(placementsOf(fields, before).map((p) => `${p.path}\n${p.id}`))
  for (const p of placementsOf(fields, after)) {
    if (placed.has(`${p.path}\n${p.id}`)) continue
    const upload = await ctx.db.get(p.id as Id<'uploads'>)
    const problem = upload ? fileProblem(p.field, { size: upload.size, contentType: upload.mime, name: upload.name }) : undefined
    if (problem?.key === 'file.tooBig') fail('INVALID', 'errors.fileTooBig', problem.params as { max: number }, { file: p.id })
    if (problem) fail('INVALID', 'errors.fileTypeNotAllowed', problem.params as { allowed: string }, { file: p.id })
  }
}

/** One entry's content as it becomes live: `before` is what was live (nothing for a draft going online), `after` what goes live. */
export interface LiveEdit {
  /** `isNew`: not stored yet (a create that is only proposed); its `_id` is a temporary one and the bundle gets it as an extra item. */
  entry: Pick<Doc<'entries'>, '_id' | 'brick'>; fields: Fields; before: Data; after: Data; isNew?: true
}

/**
 * Refuses a write that puts a new broken link live (V1 link check, "blocks publish on error"). Only links
 * the edit adds count: an old broken link in untouched text never blocks, and warnings never do.
 * Cheap first: without a new link target in the Markdown text no bundle is built. Otherwise the bundles of
 * all languages are built with the new data of every edit in place of the stored one and checked by the core
 * `checkLinks` without a `files` option (the platform does not know the site's public files, so an unknown
 * plain path is not an error). Edits of drafts are not live and must not be passed.
 */
export async function checkNewLinks(ctx: QueryCtx, site: Doc<'sites'>, edits: LiveEdit[]) {
  const issue = await brokenNewLinks(ctx, site, edits)
  if (issue) fail('INVALID', 'errors.linkBroken', { link: issue.href }, { field: issue.field, link: issue.href })
}

/** The first new broken link of the edits, if any; `checkNewLinks` throws on it, the scheduled publish records it. */
export async function brokenNewLinks(ctx: QueryCtx, site: Doc<'sites'>, edits: LiveEdit[]): Promise<LinkIssue | undefined> {
  const added = new Map<string, Set<string>>()
  for (const e of edits) {
    const known = linkTargets(e.fields, e.before)
    const fresh = new Set([...linkTargets(e.fields, e.after)].filter((href) => !known.has(href)))
    if (fresh.size) added.set(e.entry._id, fresh)
  }
  if (!added.size) return undefined
  const schema = site.schema as Schema
  const overrides = new Map(edits.map((e) => [e.entry._id as string, e.after]))
  const items: NewItem[] = edits.filter((e) => e.isNew).map((e) => ({ brick: e.entry.brick, id: e.entry._id, data: e.after }))
  const bundles = await Promise.all(schema.locales.map((locale) => bundleOf(ctx, site, locale, overrides, items)))
  for (const issue of checkLinks(bundles, schema)) {
    if (issue.severity !== 'error') continue
    const edit = edits.find((e) => issue.brick === e.entry.brick && (issue.id === e.entry._id || issue.id === e.entry.brick))
    if (edit && added.get(edit.entry._id)?.has(issue.href)) return issue
  }
  return undefined
}

/** The `refs` callback for validate(): looks up every entry the data points to (live entries of the target brick on this site). */
export async function refsFor(ctx: QueryCtx, site: Id<'sites'>, fields: Fields, data: Data): Promise<NonNullable<ValidateOptions['refs']>> {
  const wanted: { to: string; id: string }[] = []
  const walk = (field: Field, value: Json | undefined) => {
    if (field.type === 'ref') for (const id of [value].flat()) if (typeof id === 'string') wanted.push({ to: field.to, id })
    if (field.type === 'list' && Array.isArray(value)) for (const row of value) for (const [k, inner] of Object.entries(field.of)) walk(inner, (row as Data)[k])
  }
  for (const [name, field] of Object.entries(fields)) walk(field, data[name])
  const found = new Set<string>()
  for (const { to, id } of wanted) {
    const key = ctx.db.normalizeId('entries', id)
    const row = key ? await ctx.db.get(key) : null
    if (row && row.site === site && row.brick === to && !row.deletedAt) found.add(`${to}\n${id}`)
  }
  return (brick, id) => found.has(`${brick}\n${id}`)
}

/**
 * The Files library descriptions of the images in `data`, for `usesOf` and validate(): one read per
 * image file. Ids that are no upload give no text.
 */
async function altsFor(ctx: QueryCtx, fields: Fields, data: Data): Promise<(file: string) => Record<string, string> | undefined> {
  const found = new Map<string, Record<string, string>>()
  for (const id of fileIdsOf(fields, data, 'image')) {
    const key = ctx.db.normalizeId('uploads', id)
    const alt = key ? (await ctx.db.get(key))?.alt : undefined
    if (alt) found.set(id, alt)
  }
  return (file) => found.get(file)
}

/** Every use of a file in `data` with its "missing alt text" mark, library descriptions included (`usesOf`). */
export async function entryUses(ctx: QueryCtx, fields: Fields, data: Data, locales: readonly string[]): Promise<Map<string, Use[]>> {
  return usesOf(fields, data, locales, await altsFor(ctx, fields, data))
}

/** The options validate() takes from the database: the entries a ref field points to and the library descriptions of the images. */
export async function lookupsFor(ctx: QueryCtx, site: Id<'sites'>, fields: Fields, data: Data): Promise<Pick<ValidateOptions, 'refs' | 'fileAlt'>> {
  return { refs: await refsFor(ctx, site, fields, data), fileAlt: await altsFor(ctx, fields, data) }
}

/** A file upload in a file field: the field's path in the entry (`doc`, `files.0.doc`), the upload ID and the field's rules. */
interface Placement {
  path: string
  id: string
  field: FileField
}

/** Every file placed in a file field of the entry, list rows included. */
function placementsOf(fields: Fields, data: Data): Placement[] {
  const out: Placement[] = []
  const walk = (path: string, field: Field, value: Json | undefined) => {
    if (typeof value !== 'object' || value === null) return
    if (field.type === 'file' && !Array.isArray(value) && typeof value.file === 'string') out.push({ path, id: value.file, field })
    if (field.type === 'list' && Array.isArray(value)) {
      value.forEach((row, i) => {
        if (typeof row === 'object' && row !== null && !Array.isArray(row)) for (const [k, inner] of Object.entries(field.of)) walk(`${path}.${i}.${k}`, inner, row[k])
      })
    }
  }
  for (const [name, field] of Object.entries(fields)) walk(name, field, data[name])
  return out
}

/** Replaces the file references of one holder with exactly `ids`. */
export async function syncFileRefs(ctx: MutationCtx, site: Id<'sites'>, holder: 'entry' | 'change', holderId: string, ids: Set<string>) {
  const rows = await ctx.db.query('fileRefs').withIndex('by_holder', (q) => q.eq('holder', holder).eq('holderId', holderId)).collect()
  const have = new Set(rows.map((r) => r.file as string))
  for (const row of rows) if (!ids.has(row.file)) await ctx.db.delete(row._id)
  for (const id of ids) if (!have.has(id)) await ctx.db.insert('fileRefs', { site, file: id as Id<'uploads'>, holder, holderId })
}

/**
 * Replaces the file references of one entry with exactly the files in `uses` (from `usesOf`, the
 * same walk that finds the ids), and keeps each row's `uses` and `missingAlt` current.
 */
export async function syncEntryRefs(ctx: MutationCtx, site: Id<'sites'>, entry: Id<'entries'>, uses: Map<string, Use[]>) {
  const rows = await ctx.db.query('fileRefs').withIndex('by_holder', (q) => q.eq('holder', 'entry').eq('holderId', entry)).collect()
  const have = new Set<string>()
  for (const row of rows) {
    const wanted = uses.get(row.file)
    // A second row for the same file is a leftover; one row per file is the rule.
    if (!wanted || have.has(row.file)) {
      await ctx.db.delete(row._id)
      continue
    }
    have.add(row.file)
    const missingAlt = wanted.some((u) => u.missingAlt)
    if (!same(row.uses, wanted) || row.missingAlt !== missingAlt) await ctx.db.patch(row._id, { uses: wanted, missingAlt })
  }
  for (const [file, list] of uses) {
    if (!have.has(file)) await ctx.db.insert('fileRefs', { site, file: file as Id<'uploads'>, holder: 'entry', holderId: entry, uses: list, missingAlt: list.some((u) => u.missingAlt) })
  }
}

export interface EntryWrite {
  actor: Actor
  entry: Doc<'entries'>
  fields: Fields
  /** Root fields this write changed (value or prints). */
  roots: string[]
  data: Data
  prints: Prints
  kind: 'save' | 'confirm' | 'undo'
  history: Recorded
  opId: string
}

/**
 * Writes a changed entry: rev+1, fieldRevs of the roots, contentRev+1 (not for a draft: the
 * public bundle does not change, SPEC 15), budget, one change
 * row with before/after values and prints of the roots, file references. Callers decide
 * before calling whether anything changed; an unchanged write must not reach this.
 */
export async function commitEntry(ctx: MutationCtx, w: EntryWrite) {
  const { actor, entry } = w
  const site = actor.site
  const bytes = entryBytes(w.data, w.prints)
  if (bytes > BUDGET.entryBytes) fail('TOO_LARGE', 'errors.entryTooLarge', overBudget(bytes, BUDGET.entryBytes))
  const siteBytes = site.bytes - entry.bytes + bytes
  if (siteBytes > BUDGET.siteBytes) fail('TOO_LARGE', 'errors.siteStorageLimitReached', overBudget(siteBytes, BUDGET.siteBytes))
  const trees = await treesOf(w.fields, w.data)
  const treeBytes = (site.treeBytes ?? 0) - (entry.treeBytes ?? 0) + trees.bytes
  if (treeBytes > BUDGET.treeBytes) fail('TOO_LARGE', 'errors.entryTooComplex')

  const rev = entry.rev + 1
  const fieldRevs = { ...entry.fieldRevs }
  for (const root of w.roots) fieldRevs[root] = rev
  const draft = entry.state === 'draft'
  const contentRev = draft ? site.contentRev : site.contentRev + 1
  const now = Date.now()
  await ctx.db.patch(entry._id, { data: w.data, prints: w.prints, trees: undefined, rev, fieldRevs, bytes, treeBytes: trees.bytes })
  await putTrees(ctx, site._id, entry._id, trees.json)
  await ctx.db.patch(site._id, { contentRev, bytes: siteBytes, treeBytes })

  const pick = (data: Data) => Object.fromEntries(w.roots.filter((r) => data[r] !== undefined).map((r) => [r, data[r]!]))
  const pickPrints = (prints: Prints) => Object.fromEntries(Object.entries(prints).filter(([leaf]) => w.roots.some((r) => leaf === r || leaf.startsWith(`${r}.`))))
  const before = pick(entry.data as Data)
  const after = pick(w.data)
  const change = await ctx.db.insert('changes', {
    site: site._id, entry: entry._id, brick: entry.brick, ...byOf(actor), opId: w.opId, kind: w.kind, ...w.history,
    fields: w.roots, before, after, printsBefore: pickPrints(entry.prints), printsAfter: pickPrints(w.prints),
    entryRev: rev, contentRev, at: now,
  })
  await syncEntryRefs(ctx, site._id, entry._id, await entryUses(ctx, w.fields, w.data, (site.schema as Schema).locales))
  const changeFiles = new Set([...fileIdsOf(w.fields, before), ...fileIdsOf(w.fields, after)])
  if (changeFiles.size) await syncFileRefs(ctx, site._id, 'change', change, changeFiles)
  return { change, rev, contentRev }
}

export function same(a: unknown, b: unknown): boolean {
  return stableJson((a ?? null) as Json) === stableJson((b ?? null) as Json)
}
