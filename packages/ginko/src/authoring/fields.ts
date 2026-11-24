// The field builders a site developer writes with. Every builder returns a stored-form field (core/types.ts). Only
// what differs from the stored form is defined here: defaults for number, file and list, and the names `fields` and
// `item` of a list.
import { f as stored, type ValueInput } from '../core/fields.ts'
import type { Fields, FileField, Label, ListField, NumberField } from '../core/types.ts'
import { limitOf } from '../core/uploads.ts'

/** The options of a field type `F` that a builder takes: without what the builder or the platform sets. */
type Opt<F> = Omit<F, 'type' | 'label' | 'pos' | 'retired' | 'default'>

/** The cells of one row as you write them: a value per column; only optional columns may be missing. */
type RowInput<G extends Fields> =
  & { [K in keyof G as G[K] extends { optional: true } ? never : K]: ValueInput<G[K]> }
  & { [K in keyof G as G[K] extends { optional: true } ? K : never]?: ValueInput<G[K]> }

type NumberOpts = Partial<Pick<NumberField, 'min' | 'max' | 'step'>> & Omit<Opt<NumberField>, 'min' | 'max' | 'step'> & { default?: number }
type FileOpts = Partial<Pick<FileField, 'accept' | 'maxBytes'>> & Omit<Opt<FileField>, 'accept' | 'maxBytes'>
type ListOpts<G extends Fields> = Omit<Opt<ListField>, 'of' | 'itemLabel' | 'max'> & {
  /** The columns of one row. */
  fields: G
  /** The word for one row ("Fact"). Default: "Entry" in the editor's language. */
  item?: Label
  /** Most rows. Default 50. */
  max?: number
  default?: readonly ({ _id: string } & RowInput<G>)[]
}

const ENTRY: Label = { de: 'Eintrag', en: 'Entry', es: 'Entrada', fr: 'Entrée' }

export const f = {
  ...stored,
  /** A number. `min`, `max` and `step` default to 0, 1 000 000 and 1. */
  number: <const O extends NumberOpts = {}>(label: Label, o?: O) =>
    ({ type: 'number', label, min: 0, max: 1_000_000, step: 1, ...o }) as NumberField & O,
  /** A file for download. `accept` defaults to PDF, `maxBytes` to the upload limit. */
  file: <const O extends FileOpts = {}>(label: Label, o?: O) =>
    ({ type: 'file', label, accept: ['pdf'], maxBytes: limitOf('file'), ...o }) as FileField & O,
  /** A list of rows with the same columns (`fields`). `max` defaults to 50. */
  list: <const G extends Fields, const O extends ListOpts<G>>(label: Label, o: O & { fields: G }) => {
    const { fields, item, ...rest } = o
    const old = ['of', 'itemLabel'].filter((key) => Object.hasOwn(o, key))
    if (old.length || fields === undefined) throw new Error('f.list: the columns are `fields` (0.18: `of`) and the word for one row is `item` (0.18: `itemLabel`). To keep a config of 0.18 as it is, import from \'@lupinum/ginko/v1\'.')
    return { type: 'list', label, itemLabel: item ?? ENTRY, of: fields, max: 50, ...rest } as unknown as ListField<G> & Omit<O, 'fields' | 'item' | 'default'>
  },
}
