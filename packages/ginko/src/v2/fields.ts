// POC T2 (v2 spec, section 7): the v2 field builders. Every builder returns a v1 field, so the stored model is the
// one v1 writes. Only what differs from v1 is defined here: defaults for number, file and list, and `f.rows`.
import { f as v1, type ValueInput } from '../core/fields.ts'
import type { ChoiceField, Fields, FileField, Label, ListField, NumberField } from '../core/types.ts'
import { limitOf } from '../core/uploads.ts'

/** The options of a field type `F` that a v2 builder takes: without what the builder or the platform sets. */
type Opt<F> = Omit<F, 'type' | 'label' | 'pos' | 'retired' | 'default'>

/** The cells of one row as you write them: a value per column; only optional columns may be missing. */
type RowInput<G extends Fields> =
  & { [K in keyof G as G[K] extends { optional: true } ? never : K]: ValueInput<G[K]> }
  & { [K in keyof G as G[K] extends { optional: true } ? K : never]?: ValueInput<G[K]> }

type NumberOpts = Partial<Pick<NumberField, 'min' | 'max' | 'step'>> & Omit<Opt<NumberField>, 'min' | 'max' | 'step'> & { default?: number }
type FileOpts = Partial<Pick<FileField, 'accept' | 'maxBytes'>> & Omit<Opt<FileField>, 'accept' | 'maxBytes'>
type ListOpts<G extends Fields> = Omit<Opt<ListField>, 'of' | 'itemLabel' | 'max'> & {
  fields: G
  /** The word for one row ("Fact"). v1: `itemLabel`. */
  item?: Label
  /** Most rows. Default 50. */
  max?: number
  default?: readonly ({ _id: string } & RowInput<G>)[]
}
type RowOption<K extends string> = K | { value: K; label: Label }
type RowsOpts<K extends string, C extends string, G extends Fields> = Omit<Opt<ListField>, 'of' | 'itemLabel' | 'max' | 'min' | 'unique'> & {
  /** The rows, in order: keys, or keys with a label. */
  rows: readonly RowOption<K>[]
  /** The stored name of the column that holds the row's key. Default `row`; a table that exists in v1 keeps its name (`day`). */
  key?: C
  /** The word for one row ("Day"). It is also the label of the key column. */
  item: Label
  fields: G
  /**
   * Start values by row key. Give every row or none (checked when the config loads: `rows` is often a plain list).
   * A row id comes from the row key. A table that exists in v1 keeps its ids with `_id`: a release refuses a changed
   * start value (`diffSchema`: `defaultChanged`), and the id is part of it.
   */
  default?: { [P in K]?: RowInput<G> & { _id?: string } }
}

/** Marks a list that was written with `f.rows`: its value is the name of the key column. Not stored (a symbol key). */
export const ROWS_KEY: unique symbol = Symbol.for('ginko.v2.rows')

const ENTRY: Label = { de: 'Eintrag', en: 'Entry', fr: 'Entrée' }

/** A stable row id from a row key: v1 wants 10 letters or digits. */
function rowId(key: string): string {
  const id = `${key.replace(/[^a-zA-Z0-9]/g, '')}0000000000`.slice(0, 10)
  if (id.length < 10 || key.replace(/[^a-zA-Z0-9]/g, '').length > 10) throw new Error(`f.rows: the row key “${key}” cannot be made into a row id (at most 10 letters or digits).`)
  return id
}

export const f = {
  ...v1,
  /** v1 wants `min`, `max` and `step`; v2 defaults them to 0, 1 000 000 and 1. */
  number: <const O extends NumberOpts = {}>(label: Label, o?: O) =>
    ({ type: 'number', label, min: 0, max: 1_000_000, step: 1, ...o }) as NumberField & O,
  /** v1 wants `accept` and `maxBytes`; v2 defaults them to PDF and the upload limit. */
  file: <const O extends FileOpts = {}>(label: Label, o?: O) =>
    ({ type: 'file', label, accept: ['pdf'], maxBytes: limitOf('file'), ...o }) as FileField & O,
  /** v1 wants `max` and `itemLabel`; v2 defaults `max` to 50 and calls the label `item`. */
  list: <const G extends Fields, const O extends ListOpts<G>>(label: Label, o: O & { fields: G }) => {
    const { fields, item, ...rest } = o
    return { type: 'list', label, itemLabel: item ?? ENTRY, of: fields, max: 50, ...rest } as unknown as ListField<G> & Omit<O, 'fields' | 'item' | 'default'>
  },
  /**
   * A table with one row per key. Stored as the v1 list it replaces: a required choice column `key` with one option
   * per row, `min = max =` the number of rows, and `unique` on that column. Row ids come from the row keys.
   */
  rows: <const K extends string, const G extends Fields, const C extends string = 'row', const O extends RowsOpts<K, C, G> = RowsOpts<K, C, G>>(
    label: Label,
    o: O & { rows: readonly RowOption<K>[]; key?: C; fields: G },
  ) => {
    const { rows, key, item, fields, default: start, ...rest } = o
    const column = key ?? 'row'
    if (Object.hasOwn(fields, column)) throw new Error(`f.rows: the fields already have a column “${column}”; set another \`key\`.`)
    const options = rows.map((row) => (typeof row === 'string' ? { value: row, label: row } : row))
    const missing = start ? options.filter(({ value }) => !Object.hasOwn(start, value)).map(({ value }) => value) : []
    if (missing.length) throw new Error(`f.rows: \`default\` has no values for the rows ${missing.join(', ')}. Give every row or none.`)
    const list = {
      type: 'list',
      label,
      itemLabel: item,
      of: { [column]: { type: 'choice', label: item, options }, ...fields },
      min: options.length,
      max: options.length,
      unique: column,
      ...rest,
      ...(start ? { default: options.map(({ value }) => ({ _id: rowId(value), [column]: value, ...(start as Record<string, object>)[value] })) } : {}),
      [ROWS_KEY]: column,
    }
    return list as unknown as ListField<{ [P in C]: ChoiceField<K> } & G> & Omit<O, 'rows' | 'key' | 'item' | 'fields' | 'default'>
  },
}
