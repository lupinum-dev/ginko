// The input of one task as JSON Schema, for the agent door (SPEC 16): one task becomes one MCP tool.
// Values are what a person would type: plain text in the main language, money in euros or francs.
// The MCP layer turns them into the storage format (Localized, cents, list row ids; Markdown stays a string).
import { effectiveMax, effectiveProfile, isTranslatable } from './fields.ts'
import { describeProfile } from './markdown.ts'
import { minorDigits } from './money.ts'
import { labelOf } from './labels.ts'
import { createAsks } from './stale.ts'
import type { Brick, Currency, Field, Fields, Json, Label, Locale, Task } from './types.ts'

/** The JSON Schema subset the tools use. */
export interface JsonSchema {
  type?: 'string' | 'number' | 'integer' | 'boolean' | 'object' | 'array'
  description?: string
  enum?: readonly string[]
  const?: Json
  default?: Json
  format?: 'uri' | 'email'
  pattern?: string
  maxLength?: number
  minimum?: number
  maximum?: number
  multipleOf?: number
  items?: JsonSchema
  minItems?: number
  maxItems?: number
  uniqueItems?: boolean
  properties?: Record<string, JsonSchema>
  required?: string[]
  additionalProperties?: false
}
export type JsonSchemaObject = JsonSchema & { type: 'object'; properties: Record<string, JsonSchema>; required: string[]; additionalProperties: false }

export interface ToolSchemaContext {
  mainLocale: Locale
  currency: Currency
  /** Prefill of the task, already resolved by `tasks.prefill` (storage format). */
  prefill?: Record<string, Json>
}

const DATE = '^\\d{4}-\\d{2}-\\d{2}$'
const TIME = '^\\d{2}:\\d{2}$'

/** JSON Schema for the arguments of `task` on `brick`. */
export function taskInputSchema(brick: Brick, task: Task, ctx: ToolSchemaContext): JsonSchemaObject {
  const fields: Fields = {}
  if (task.kind === 'edit') for (const key of task.fields) { const field = brick.fields[key]; if (field) fields[key] = field }
  if (task.kind === 'create') for (const [key, field] of Object.entries(brick.fields)) if (createAsks(brick, key, task)) fields[key] = field
  const schema = objectOf(fields, ctx, ctx.prefill)
  const pick = task.kind === 'remove' || (task.kind === 'edit' && task.pick === true)
  if (pick) {
    schema.properties = { entry: { type: 'string', description: 'ID of the entry (from ginko_read)' }, ...schema.properties }
    schema.required = ['entry', ...schema.required]
  }
  if (task.kind === 'remove') {
    schema.properties.confirm = { type: 'boolean', const: true, description: 'Must be true: the entry will be removed.' }
    schema.required.push('confirm')
  }
  return schema
}

function objectOf(fields: Fields, ctx: ToolSchemaContext, prefill?: Record<string, Json>): JsonSchemaObject {
  const properties: Record<string, JsonSchema> = {}
  const required: string[] = []
  for (const [key, field] of Object.entries(fields)) {
    const prop = fieldSchema(field, ctx)
    if (!prop) continue
    const preset = prefill?.[key]
    if (preset !== undefined) {
      const value = typedValue(field, preset, ctx)
      if (value !== undefined) prop.default = value
    }
    properties[key] = prop
    if (!field.optional && field.default === undefined && preset === undefined) required.push(key)
  }
  return { type: 'object', properties, required, additionalProperties: false }
}

function fieldSchema(field: Field, ctx: ToolSchemaContext): JsonSchema | undefined {
  const label = labelOf(field.label, ctx.mainLocale, ctx.mainLocale)
  const description = field.hint ? `${label} — ${labelOf(field.hint, ctx.mainLocale, ctx.mainLocale)}` : label
  switch (field.type) {
    case 'text': {
      const format = field.format === 'url' ? 'uri' : field.format === 'email' ? 'email' : undefined
      return { type: 'string', description, maxLength: field.max ?? 200, ...(format ? { format } : {}) }
    }
    case 'longtext': return { type: 'string', description, maxLength: field.max ?? 2000 }
    case 'markdown': return { type: 'string', description: `${description} (Markdown: ${describeProfile(effectiveProfile(field), 'en')})`, maxLength: effectiveMax(field) }
    case 'number': return { type: 'number', description: field.unit ? `${description} (${field.unit})` : description, minimum: field.min, maximum: field.max, multipleOf: field.step }
    case 'money': return {
      type: 'number',
      description: `${description} in ${field.currency ?? ctx.currency}`,
      minimum: (field.min ?? 0) / unitsOf(field, ctx),
      ...(field.max !== undefined ? { maximum: field.max / unitsOf(field, ctx) } : {}),
    }
    case 'boolean': return { type: 'boolean', description }
    case 'date': return { type: 'string', description: `${description} (YYYY-MM-DD)`, pattern: DATE }
    case 'time': return { type: 'string', description: `${description} (HH:MM)`, pattern: TIME }
    case 'daterange': return {
      type: 'object', description,
      properties: { from: { type: 'string', pattern: DATE }, to: { type: 'string', pattern: DATE } },
      required: ['from', 'to'], additionalProperties: false,
    }
    case 'choice': return { type: 'string', description: withOptions(description, field.options, ctx.mainLocale), enum: field.options.map((o) => o.value) }
    case 'choices': return {
      type: 'array', description: withOptions(description, field.options, ctx.mainLocale),
      items: { type: 'string', enum: field.options.map((o) => o.value) }, uniqueItems: true,
      ...(field.max !== undefined ? { maxItems: field.max } : {}),
    }
    case 'ref': {
      const d = `${description} (ID of an entry in “${field.to}”)`
      return field.multiple
        ? { type: 'array', description: d, items: { type: 'string' }, uniqueItems: true, ...(field.max !== undefined ? { maxItems: field.max } : {}) }
        : { type: 'string', description: d }
    }
    case 'list': return {
      type: 'array', description: `${description} (one object per ${labelOf(field.itemLabel, ctx.mainLocale, ctx.mainLocale)})`,
      items: objectOf(field.of, ctx), maxItems: field.max,
      ...(field.min !== undefined ? { minItems: field.min } : {}),
    }
    case 'image': return {
      type: 'object', description: `${description} (the ID of an existing file)`,
      properties: { file: { type: 'string' }, alt: { type: 'string', description: 'Image description (for people who cannot see the image)' } },
      required: ['file', 'alt'], additionalProperties: false,
    }
    case 'file': return {
      type: 'object', description: `${description} (the ID of an existing file)`,
      properties: { file: { type: 'string' } }, required: ['file'], additionalProperties: false,
    }
    // Slugs come from another field when an entry is created.
    case 'slug':
      return undefined
  }
}

/** Minor units in one major unit of the field currency (100 for EUR, 1 for JPY). */
function unitsOf(field: Field, ctx: { currency?: Currency }): number {
  const currency = (field.type === "money" ? field.currency : undefined) ?? ctx.currency
  return currency === undefined ? 100 : 10 ** minorDigits(currency)
}

function withOptions(description: string, options: readonly { value: string; label: Label }[], main: string): string {
  return `${description}: ${options.map((o) => `${o.value} = ${labelOf(o.label, main, main)}`).join(', ')}`
}

/** A prefilled storage value as the tool takes it, or undefined when it has no simple form. */
function typedValue(field: Field, value: Json, ctx: ToolSchemaContext): Json | undefined {
  if (isTranslatable(field) && value && typeof value === 'object' && !Array.isArray(value)) return value[ctx.mainLocale]
  if (field.type === 'money' && value && typeof value === 'object' && !Array.isArray(value) && typeof value.amount === 'number') return value.amount / unitsOf(field, ctx)
  if (field.type === 'list' || field.type === 'image' || field.type === 'file') return undefined
  return value
}

export interface ToolInputContext {
  mainLocale: Locale
  /** The site currency, for a money field without its own: decides how many decimals a number has. Absent: 2. */
  currency?: Currency
  /** Stored values of the entry the task changes, so list rows keep their IDs (and translations). */
  stored?: Record<string, Json>
  /** A fresh list row ID (10 characters, see `validate`). */
  newRowId: () => string
}

/**
 * Tool arguments → storage format for `entries.create` / `entries.save`: text in the main language becomes
 * `{ [main]: text }`, euros become `{ amount: cents }`, list rows get IDs. Keys the
 * schema of `taskInputSchema` does not offer are not taken; `validate` checks the values afterwards.
 */
export function fromToolInput(fields: Fields, input: Record<string, Json>, ctx: ToolInputContext): Record<string, Json> {
  const out: Record<string, Json> = {}
  for (const [key, value] of Object.entries(input)) {
    const field = Object.hasOwn(fields, key) ? fields[key]! : undefined
    if (!field || value === undefined) continue
    out[key] = stored(field, value, ctx.stored?.[key], ctx)
  }
  return out
}

function stored(field: Field, value: Json, before: Json | undefined, ctx: ToolInputContext): Json {
  if (value === null) return null
  if (isTranslatable(field)) {
    return typeof value === 'string' ? { [ctx.mainLocale]: value } : value
  }
  if (field.type === 'money') return typeof value === 'number' ? { amount: Math.round(value * unitsOf(field, ctx)) } : value
  if (field.type === 'image' && isObject(value)) {
    return { file: value.file ?? null, alt: { [ctx.mainLocale]: typeof value.alt === 'string' ? value.alt : '' } }
  }
  if (field.type === 'list' && Array.isArray(value)) {
    const old = Array.isArray(before) ? before.filter(isObject) : []
    // A row keeps its ID when it is the same row: same `unique` value, else the same position.
    const match = (row: Record<string, Json>, index: number) => field.unique
      ? old.find((o) => o[field.unique!] !== undefined && o[field.unique!] === row[field.unique!])
      : old[index]
    return value.map((row, index) => {
      if (!isObject(row)) return row
      const prev = match(row, index)
      const id = typeof prev?._id === 'string' ? prev._id : ctx.newRowId()
      return { _id: id, ...fromToolInput(field.of, row, { ...ctx, stored: prev }) }
    })
  }
  return value
}

const isObject = (value: unknown): value is Record<string, Json> => typeof value === 'object' && value !== null && !Array.isArray(value)
