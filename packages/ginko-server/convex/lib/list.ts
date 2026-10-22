// What the Studio's pages read of entries (sites.meta has no entries): a list row with what a list shows, and the
// entry an editor opens. Each page subscribes only to the rows it shows, so a save elsewhere sends it little or nothing.
import type { Brick, Locale } from '@lupinum/ginko'
import { entryTitle, labelOf, ordered, type Schema } from '@lupinum/ginko/internal'
import type { Doc } from '../_generated/dataModel'
import type { Data } from './content'
import { leafStatus, type LeafStatus } from './translation'

/**
 * The fields a list row shows beside its title: the field `visible` reads (expired or not) and the first date or date
 * range (the date under the title). Only these values travel with a row.
 */
function dateKeys(brick: Brick): string[] {
  const keys = new Set<string>()
  if (brick.kind === 'collection' && brick.visible && brick.visible.mode !== 'always') keys.add(brick.visible.field)
  const first = ordered(brick.fields).find(([, field]) => !field.retired && (field.type === 'date' || field.type === 'daterange'))
  if (first) keys.add(first[0])
  return [...keys]
}

/**
 * Missing and outdated texts per foreign language, by the bundle's rule (leafStatus). Drafts get none: they are not
 * on the website yet, so the translation status leaves them out too.
 */
function gapsOf(schema: Schema, brick: string, row: Doc<'entries'>) {
  if (row.state === 'draft') return []
  return schema.locales.slice(1).map((locale) => {
    const status = leafStatus(schema, brick, row, locale)
    return { locale, missing: status.missing.length, outdated: status.outdated.length }
  })
}

/**
 * An entry's title as the Studio shows it: its own text in the main language, a planned week with the field label in
 * the person's `language`; null while nothing is typed (the Studio shows the brick's label then).
 */
export function titleOf(schema: Schema, brick: Brick, data: Data, language: string | undefined): string | null {
  const main = schema.locales[0]!
  return entryTitle(brick, data, main, (label) => labelOf(label, language ?? main, main)) ?? null
}

/** One row of a collection list (about 150 B): its title, its state, the date values the row shows, and its translation gaps. */
export function listRow(schema: Schema, brick: string, row: Doc<'entries'>, language?: string) {
  const def = schema.bricks[brick]!
  const data = row.data as Data
  const dates: Data = {}
  for (const key of dateKeys(def)) if (data[key] !== undefined) dates[key] = data[key]!
  return {
    _id: row._id,
    order: row.order,
    ...(row.state === undefined ? {} : { state: row.state }),
    ...(row.publishAt === undefined ? {} : { publishAt: row.publishAt }),
    title: titleOf(schema, def, data, language),
    dates,
    gaps: gapsOf(schema, brick, row),
  }
}

/**
 * An entry as an editor needs it: the stored row without its derived trees and counters, and `deleted` instead of the
 * time it went to the trash (an open form keeps the person's input when someone removes the entry).
 */
export function editorEntry(row: Doc<'entries'>) {
  return {
    _id: row._id,
    brick: row.brick,
    kind: row.kind,
    order: row.order,
    data: row.data as Data,
    rev: row.rev,
    fieldRevs: row.fieldRevs,
    lifeRev: row.lifeRev,
    prints: row.prints,
    ...(row.state === undefined ? {} : { state: row.state }),
    ...(row.publishAt === undefined ? {} : { publishAt: row.publishAt }),
    deleted: row.deletedAt !== undefined,
  }
}

/**
 * `editorEntry` of a collection entry with only what a row of Schnell ändern and its pick list read: the text fields
 * its title comes from, the dates that plan or time it (also the date of a planned price), the choices and prices
 * the pick list groups and shows, and the yes/no fields a row marks ("Ausgebucht").
 * Long texts, lists and files stay out, so a timed collection near the site budget does not send megabytes on every
 * change; a sheet that edits the entry reads it whole (entries.get).
 */
export function slimEntry(brick: Brick, row: Doc<'entries'>) {
  const dates = new Set([brick.kind === 'collection' ? brick.plans?.field : undefined, brick.kind === 'collection' && brick.visible?.mode === 'until' ? brick.visible.field : undefined, brick.planned?.from])
  const small = new Set(['text', 'longtext', 'choice', 'money', 'boolean'])
  const keep = (key: string) => dates.has(key) || small.has(brick.fields[key]?.type ?? '')
  const entry = editorEntry(row)
  return { ...entry, data: Object.fromEntries(Object.entries(entry.data).filter(([key]) => keep(key))), prints: {} }
}

/**
 * `editorEntry` with each foreign language's translation state: the texts it misses or has outdated (the language
 * switch shows a dot), the missing ones that keep the entry from having a page there, and what the website shows.
 */
export function editorEntryWithTranslation(schema: Schema, row: Doc<'entries'>) {
  const translation: Record<Locale, LeafStatus> = {}
  if (row.state !== 'draft' && row.deletedAt === undefined && Object.hasOwn(schema.bricks, row.brick)) {
    for (const locale of schema.locales.slice(1)) translation[locale] = leafStatus(schema, row.brick, row, locale)
  }
  return { ...editorEntry(row), translation }
}
