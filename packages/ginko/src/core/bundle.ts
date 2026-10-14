import { parseMarkdown, type MarkdownTree } from './markdown.ts'
import type { Currency, Fields, Json, Locale, Schema } from './types.ts'

/** 3: text fields carry comark trees; collection items carry `updatedAt` and, for file entries, `source`. Other formats are refused. */
export const BUNDLE_FORMAT = 3

export interface BundleItem {
  id: string
  data: Record<string, unknown>
  /** Leaves delivered in the main language because the requested translation is missing or outdated. */
  fallback: string[]
  /** Only for collections with `route`, only visible entries, only locales where the entry exists. */
  urls?: Partial<Record<Locale, string>>
  /** When the entry last changed (ISO 8601, UTC). Files: last commit of its files, else file time. Platform: last published change. */
  updatedAt?: string
  /** Repo-relative path of the main-language file (POSIX separators). File entries only. */
  source?: string
}

export type BundleBrick =
  | { kind: 'single'; data: Record<string, unknown>; fallback: string[] }
  | { kind: 'collection'; items: BundleItem[] }

/** GET <platform>/bundle/<site>?format=3&locale=<l> (SPEC part 6). */
export interface Bundle {
  format: typeof BUNDLE_FORMAT
  site: string
  locale: Locale
  requestedLocale?: string
  locales: Locale[]
  mainLocale: Locale
  currency: Currency
  schemaRev: number
  contentRev: number
  generatedAt: string
  bricks: Record<string, BundleBrick>
}

/**
 * Structural check of a bundle as received over the network: every brick and item has the
 * shape of this format. A bundle that fails is a platform failure (503 on the site), never
 * something defaults could paper over.
 */
export function isBundle(value: unknown): value is Bundle {
  if (!isRecord(value)) return false
  const b = value
  if (b.format !== BUNDLE_FORMAT || typeof b.site !== 'string' || typeof b.locale !== 'string') return false
  if (!Number.isInteger(b.schemaRev) || !Number.isInteger(b.contentRev) || !isRecord(b.bricks)) return false
  return Object.values(b.bricks).every(isBundleBrick)
}

/**
 * The bundle with only the bricks the site's schema knows. A platform may already serve newer
 * bricks (release before deploy); an unknown key such as `__proto__` never reaches page state.
 */
export function knownBricks(bundle: Bundle, schema: Pick<Schema, 'bricks'>): Bundle {
  return { ...bundle, bricks: Object.fromEntries(Object.entries(bundle.bricks).filter(([key]) => Object.hasOwn(schema.bricks, key))) }
}

/**
 * The page bundle of a site with file bricks (CONTENT.md): the platform's bricks, then the file
 * bricks on top. A platform brick with a file brick's key is dropped: one brick, one source.
 * Revisions and metadata come from the platform bundle when there is one.
 */
export function withFileBricks(platform: Bundle | undefined, files: Bundle | undefined, schema: Pick<Schema, 'bricks'>): Bundle {
  const base = platform ?? files
  if (!base) throw new Error('withFileBricks: no bundle')
  const fromPlatform = Object.entries(platform?.bricks ?? {}).filter(([key]) => schema.bricks[key]?.source !== 'files')
  return { ...base, bricks: { ...Object.fromEntries(fromPlatform), ...files?.bricks } }
}

/** Leaf path (as `StoredEntry.prints`: `body`, `sections.<row id>.text`) → the tree of its text, or of each locale's text. */
export type MarkdownTrees = Record<string, MarkdownTree | Partial<Record<Locale, MarkdownTree>>>

/**
 * The tree of every Markdown text in an entry's stored data. The platform stores them with the data
 * and the bundle serves them (`StoredEntry.trees`): a request reads trees and parses nothing, so its
 * cost follows the stored bytes, not how much work the texts take to parse.
 */
export async function markdownTrees(fields: Fields, data: Record<string, Json>): Promise<MarkdownTrees> {
  const trees: MarkdownTrees = {}
  const parse = async (text: string) => (await parseMarkdown(text)).value
  const walk = async (inner: Fields, row: Record<string, unknown>, path: string) => {
    for (const [name, field] of Object.entries(inner)) {
      const value = row[name]
      const leaf = path ? `${path}.${name}` : name
      if (field.type === 'markdown' && typeof value === 'string') trees[leaf] = await parse(value)
      else if (field.type === 'markdown' && isRecord(value)) {
        const perLocale: Partial<Record<Locale, MarkdownTree>> = {}
        for (const [locale, text] of Object.entries(value)) if (typeof text === 'string') perLocale[locale as Locale] = await parse(text)
        trees[leaf] = perLocale
      } else if (field.type === 'list' && Array.isArray(value)) {
        for (const r of value) if (isRecord(r) && typeof r._id === 'string') await walk(field.of, r, `${leaf}.${r._id}`)
      }
    }
  }
  await walk(fields, data, '')
  return trees
}

/**
 * The bundle with every Markdown string replaced by its parsed tree, so sites render without a parser
 * (V1.md rule 1). Part of `servedBundle`; file bundles carry trees already.
 * Values are validated on save, so the profile is not checked again; trees (file bricks, the platform's
 * stored trees: `markdownTrees`) stay as they are.
 */
export async function withMarkdownTrees(bundle: Bundle, schema: Pick<Schema, 'bricks'>): Promise<Bundle> {
  const fill = async (fields: Fields, data: Record<string, unknown>): Promise<Record<string, unknown>> => {
    const out = { ...data }
    for (const [key, field] of Object.entries(fields)) {
      const value = out[key]
      if (field.type === 'markdown' && typeof value === 'string') out[key] = (await parseMarkdown(value)).value
      else if (field.type === 'list' && Array.isArray(value)) out[key] = await Promise.all(value.map((row) => (isRecord(row) ? fill(field.of, row) : row)))
    }
    return out
  }
  const bricks: Record<string, BundleBrick> = {}
  for (const [key, brick] of Object.entries(bundle.bricks)) {
    const fields = Object.hasOwn(schema.bricks, key) ? schema.bricks[key]!.fields : undefined
    if (!fields) bricks[key] = brick
    else if (brick.kind === 'single') bricks[key] = { ...brick, data: await fill(fields, brick.data) }
    else bricks[key] = { ...brick, items: await Promise.all(brick.items.map(async (item) => ({ ...item, data: await fill(fields, item.data) }))) }
  }
  return { ...bundle, bricks }
}

/** The bundle fits the site's own schema: every brick the site knows has the kind it expects. */
export function bundleFits(bundle: Bundle, schema: Pick<Schema, 'bricks'>): boolean {
  return Object.entries(schema.bricks).every(([key, brick]) => {
    const have = Object.hasOwn(bundle.bricks, key) ? bundle.bricks[key] : undefined
    return have === undefined || have.kind === (brick.kind === 'single' ? 'single' : 'collection')
  })
}

function isBundleBrick(brick: unknown): boolean {
  if (!isRecord(brick)) return false
  if (brick.kind === 'single') return isRecord(brick.data) && isStrings(brick.fallback)
  if (brick.kind !== 'collection' || !Array.isArray(brick.items)) return false
  return brick.items.every((item) => isRecord(item) && typeof item.id === 'string' && isRecord(item.data) && isStrings(item.fallback)
    && (item.urls === undefined || (isRecord(item.urls) && Object.values(item.urls).every((u) => typeof u === 'string')))
    && (item.updatedAt === undefined || typeof item.updatedAt === 'string') && (item.source === undefined || typeof item.source === 'string'))
}

function isStrings(value: unknown): boolean {
  return Array.isArray(value) && value.every((v) => typeof v === 'string')
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
