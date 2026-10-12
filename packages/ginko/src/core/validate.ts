import { ALT_MAX, effectiveAlt, effectiveMax, effectiveProfile, isTranslatable, MAX_CENTS } from './fields.ts'
import { parseMarkdown } from './markdown.ts'
import { labelOf } from './labels.ts'
import { bare, DEFAULT_LOCALE, msg, type CoreKey, type Described, type Msg } from './messages.ts'
import { roundedMb, type UploadType } from './uploads.ts'
import { SLUG_PATTERN } from './slug.ts'
import type { Field, FileField, Fields, Issue, Locale, MarkdownField, Schema } from './types.ts'

export interface ValidateOptions {
  /** create/release: everything strict. patch: only paths under `changed` are errors, the rest are warnings. */
  mode: 'create' | 'patch' | 'release'
  /** Leaf paths changed by a patch, e.g. `closedNote` or `days.k3Fd9aZ0qx.dish`. */
  changed?: ReadonlySet<string>
  /** Whether entry `id` exists in collection brick `brick`. Without it, referenced IDs are not looked up. */
  refs?: (brick: string, id: string) => boolean
  /** The description text a file has in the Files library, per language. Without it an image field must carry its own main-language alt. */
  fileAlt?: (file: string) => Record<string, string> | undefined
}

export interface ValidationResult {
  errors: Issue[]
  warnings: Issue[]
}

const datePattern = /^\d{4}-\d{2}-\d{2}$/
const timePattern = /^([01]\d|2[0-3]):[0-5]\d$/
const rowIdPattern = /^[A-Za-z0-9_-]{10}$/

/**
 * Validates stored data of one brick entry against the schema (SPEC 2.3). Async because Markdown
 * values are parsed to check them against their field's profile.
 */
export async function validate(schema: Schema, brickKey: string, data: unknown, opts: ValidateOptions): Promise<ValidationResult> {
  // hasOwn: 'constructor' or '__proto__' must not find an Object.prototype member.
  const brick = Object.hasOwn(schema.bricks, brickKey) ? schema.bricks[brickKey] : undefined
  if (!brick) return { errors: [issue('', 'UNKNOWN_BRICK', 'unknownBrick', { brick: brickKey })], warnings: [] }
  const texts: MarkdownLeaf[] = []
  const issues = checkFields(brick.fields, data, '', { locales: schema.locales, main: schema.locales[0]!, texts, refs: opts.refs, fileAlt: opts.fileAlt })
  for (const { field, text, path } of texts) {
    const { problemMessages: problems } = await parseMarkdown(text, { profile: effectiveProfile(field), components: schema.components })
    for (const problem of problems) issues.push(issue(path, 'MARKDOWN', 'markdown', { label: shown(field, schema.locales[0]!), problem: bare(problem) }))
  }
  if (opts.mode !== 'patch') return { errors: issues, warnings: [] }
  const changed = opts.changed ?? new Set<string>()
  const errors: Issue[] = []
  const warnings: Issue[] = []
  for (const issue of issues) {
    // An issue counts when it lies inside a changed leaf or on a container of it (e.g. a list's row count).
    const related = [...changed].some((c) => issue.path === c || issue.path.startsWith(`${c}.`) || c.startsWith(`${issue.path}.`))
    if (related || issue.code === 'UNKNOWN_FIELD') errors.push(issue)
    else warnings.push(issue)
  }
  return { errors, warnings }
}

interface MarkdownLeaf { field: MarkdownField; text: string; path: string }
/** `texts` collects Markdown values for the profile check, which needs the async parser. */
interface Ctx { locales: Locale[]; main: Locale; texts?: MarkdownLeaf[]; refs?: ValidateOptions['refs']; fileAlt?: ValidateOptions['fileAlt'] }

function checkFields(fields: Fields, data: unknown, path: string, ctx: Ctx): Issue[] {
  if (!isRecord(data)) return [issue(path, 'NOT_OBJECT', 'notObject')]
  const issues: Issue[] = []
  for (const key of Object.keys(data)) {
    if (key === '_id' && path) continue
    if (!Object.hasOwn(fields, key)) issues.push(issue(join(path, key), 'UNKNOWN_FIELD', 'unknownField'))
  }
  for (const [key, field] of Object.entries(fields)) {
    if (field.retired) continue
    const at = join(path, key)
    const value = data[key]
    if (value === undefined || value === null) {
      if (!field.optional) issues.push(issue(at, 'REQUIRED', 'fieldMissing', { label: shown(field, ctx.main) }))
      continue
    }
    issues.push(...checkField(field, value, at, ctx))
  }
  return issues
}

function checkField(field: Field, value: unknown, path: string, ctx: Ctx): Issue[] {
  if (isTranslatable(field)) {
    if (!isRecord(value)) return [issue(path, 'NOT_LOCALIZED', 'notLocalized', { label: shown(field, ctx.main) })]
    const out: Issue[] = []
    for (const locale of Object.keys(value)) {
      if (!ctx.locales.includes(locale as Locale)) out.push(issue(join(path, locale), 'UNKNOWN_LOCALE', 'unknownLocale', { locale }))
    }
    const main = value[ctx.main]
    if (main === undefined || main === null || main === '') {
      if (!field.optional) out.push(issue(join(path, ctx.main), 'REQUIRED', 'fieldMissing', { label: shown(field, ctx.main) }))
    }
    for (const locale of ctx.locales) {
      const v = value[locale]
      if (v === undefined || v === null || v === '') continue
      out.push(...checkScalar(field, v, join(path, locale), locale === ctx.main, ctx))
    }
    return out
  }
  return checkScalar(field, value, path, true, ctx)
}

/** Control characters other than tab and line breaks: pasted junk that breaks XML, mail and search. */
const CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/

function checkScalar(field: Field, value: unknown, path: string, isMain: boolean, ctx?: Ctx): Issue[] {
  const label = shown(field, ctx?.main)
  const fail = (code: string, key: IssueKey, params?: Msg['params']) => [issue(path, code, key, { label, ...params })]
  switch (field.type) {
    case 'text':
    case 'longtext':
    case 'markdown': {
      if (typeof value !== 'string') return fail('TYPE', 'notText')
      const max = effectiveMax(field)
      if (!field.optional && isMain && value.trim() === '') return fail('REQUIRED', 'fieldEmpty')
      if (value.length > max) return fail('TOO_LONG', 'tooLong', { max })
      if (CONTROL.test(value)) return fail('FORMAT', 'controlChars')
      if (field.type === 'markdown') ctx?.texts?.push({ field, text: value, path })
      if (field.type === 'text' && field.format && value !== '') {
        const ok = field.format === 'url' ? /^https?:\/\/[^\s]+$/i.test(value)
          : field.format === 'email' ? /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
          : /^\+?[0-9 ()/-]{5,30}$/.test(value) && (value.match(/[0-9]/g)?.length ?? 0) >= 5
        if (!ok) return fail('FORMAT', 'badFormat')
      }
      return []
    }
    case 'slug':
      if (typeof value !== 'string' || !SLUG_PATTERN.test(value)) return fail('SLUG', 'badSlug')
      return []
    case 'number':
      if (typeof value !== 'number' || !Number.isFinite(value)) return fail('TYPE', 'notNumber')
      if (value < field.min || value > field.max) return fail('RANGE', 'outOfRange', { min: field.min, max: field.max })
      if (Math.abs(Math.round((value - field.min) / field.step) * field.step - (value - field.min)) > 1e-9) return fail('STEP', 'badStep', { step: field.step })
      return []
    case 'money': {
      if (!isRecord(value) || !Number.isSafeInteger(value.amount) || Object.keys(value).some((k) => k !== 'amount')) return fail('TYPE', 'notMoney')
      const cents = value.amount as number
      if (cents < (field.min ?? 0) || cents > effectiveMax(field)) return fail('RANGE', 'moneyOutOfRange')
      return []
    }
    case 'boolean':
      return typeof value === 'boolean' ? [] : fail('TYPE', 'notBoolean')
    case 'date':
      return isDate(value) ? [] : fail('DATE', 'badDate')
    case 'time':
      return typeof value === 'string' && timePattern.test(value) ? [] : fail('TIME', 'badTime')
    case 'daterange':
      if (!isRecord(value) || !isDate(value.from) || !isDate(value.to) || Object.keys(value).length !== 2) return fail('DATE', 'badDateRange')
      return (value.from as string) <= (value.to as string) ? [] : fail('DATE_ORDER', 'dateRangeOrder')
    case 'choice':
      return typeof value === 'string' && field.options.some((o) => o.value === value) ? [] : fail('CHOICE', 'badChoice')
    case 'choices': {
      if (!Array.isArray(value) || value.some((v) => typeof v !== 'string' || !field.options.some((o) => o.value === v))) return fail('CHOICE', 'badChoices')
      if (new Set(value).size !== value.length) return fail('DUPLICATE', 'duplicateValues')
      if (field.max !== undefined && value.length > field.max) return fail('TOO_MANY', 'tooManyChosen', { max: field.max })
      return []
    }
    case 'ref': {
      const ids = field.multiple ? value : [value]
      if (!Array.isArray(ids) || ids.some((v) => typeof v !== 'string' || v === '')) return fail('TYPE', field.multiple ? 'notIdList' : 'notId')
      if (new Set(ids).size !== ids.length) return fail('DUPLICATE', 'duplicateEntries')
      if (field.multiple && field.max !== undefined && ids.length > field.max) return fail('TOO_MANY', 'tooManyChosen', { max: field.max })
      const missing = ctx?.refs ? ids.filter((id) => !ctx.refs!(field.to, id as string)) : []
      return missing.length ? fail('REF_MISSING', 'refGone') : []
    }
    case 'list': {
      if (!Array.isArray(value)) return fail('TYPE', 'notList')
      if (value.length > field.max) return fail('TOO_MANY', 'tooManyRows', { max: field.max })
      if (field.min !== undefined && value.length < field.min) return fail('TOO_FEW', 'tooFewRows', { min: field.min })
      const out: Issue[] = []
      if (field.unique) {
        const key = field.unique
        const seen = new Set<string>()
        for (const row of value) {
          const v = isRecord(row) ? row[key] : undefined
          if (typeof v !== 'string') continue
          if (seen.has(v)) { out.push(issue(path, 'DUPLICATE', 'duplicateRowValue', { label, value: v })); break }
          seen.add(v)
        }
      }
      const ids = new Set<string>()
      value.forEach((row, index) => {
        const id = isRecord(row) && typeof row._id === 'string' ? row._id : undefined
        if (!id || !rowIdPattern.test(id)) { out.push(issue(join(path, String(index)), 'ROW_ID', 'badRowId', { label, row: index + 1 })); return }
        if (ids.has(id)) { out.push(issue(join(path, id), 'ROW_ID', 'duplicateRowId', { label })); return }
        ids.add(id)
        out.push(...checkFields(field.of, row, join(path, id), ctx!))
      })
      return out
    }
    case 'image':
      if (!isRecord(value) || typeof value.file !== 'string' || !isRecord(value.alt) || Object.keys(value).some((k) => k !== 'file' && k !== 'alt')) return fail('TYPE', 'notImage')
      for (const l of Object.keys(value.alt)) if (!ctx!.locales.includes(l as Locale)) return [issue(join(path, `alt.${l}`), 'UNKNOWN_LOCALE', 'unknownLocale', { locale: l })]
      if (effectiveAlt(value.alt, ctx!.fileAlt?.(value.file), ctx!.main) === '') return [issue(join(path, 'alt'), 'ALT_REQUIRED', 'altMissing', { label })]
      return Object.entries(value.alt).filter(([, a]) => typeof a !== 'string' || a.length > ALT_MAX).map(([l]) => issue(join(path, `alt.${l}`), 'TOO_LONG', 'altTooLong', { label }))
    case 'file':
      return isRecord(value) && typeof value.file === 'string' && Object.keys(value).length === 1 ? [] : fail('TYPE', 'notFile')
  }
}

/** Checks one stored value against one field, e.g. the `value` of a retired rule. */
export function checkValue(schema: Pick<Schema, 'locales'>, field: Field, value: unknown, path: string): Issue[] {
  const ctx = { locales: schema.locales, main: schema.locales[0]! }
  if (value === undefined || value === null) return field.optional ? [] : [issue(path, 'REQUIRED', 'fieldMissing', { label: shown(field, ctx.main) })]
  return checkField(field, value, path, ctx)
}

export function isDate(value: unknown): value is string {
  if (typeof value !== 'string' || !datePattern.test(value)) return false
  const year = Number(value.slice(0, 4))
  if (year < 1900 || year > 2199) return false
  const date = new Date(`${value}T00:00:00Z`)
  return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(value)
}

const FILE_TYPES: Record<FileField['accept'][number], UploadType> = { pdf: 'application/pdf' }

/**
 * Why a file may not be attached to a file field, or undefined when it may. Server and editor both
 * call it, so a file over `maxSize` or of another type is refused the same way everywhere.
 * It carries the catalog key and parameters, so each reader gets the text in their language.
 */
export function fileProblem(field: FileField, file: { size: number; contentType: string; name?: string }): Described | undefined {
  const type = file.contentType.split(';')[0]!.trim().toLowerCase()
  if (!field.accept.some((kind) => FILE_TYPES[kind] === type)) return msg('file.typeNotAllowed', { allowed: field.accept.map((kind) => kind.toUpperCase()).join(', ') })
  if (file.size > field.maxSize) return msg('file.tooBig', { max: roundedMb(field.maxSize) })
  return undefined
}

/** The field label in the language of the (German) issue texts, else the main language. */
const shown = (field: Field, main: string | undefined) => labelOf(field.label, DEFAULT_LOCALE, main ?? DEFAULT_LOCALE)

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function join(path: string, key: string) {
  return path ? `${path}.${key}` : key
}

type IssueKey = Stripped<CoreKey>
type Stripped<T> = T extends `issues.${infer K}` ? K : never

function issue(path: string, code: string, key: IssueKey | Described, params?: Msg['params']): Issue {
  const described = typeof key === 'string' ? msg(`issues.${key}`, params) : key
  return { path, code, ...described }
}
