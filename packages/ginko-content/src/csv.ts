import type { Fields } from '@lupinum/ginko'

export interface CsvRow {
  /** 1-based line where the row starts (a quoted cell may span more lines). */
  line: number
  cells: string[]
}

export type CsvParse = { rows: CsvRow[] } | { error: { line: number; message: string } }

/** `;` wins when the header line has more of them than commas (German Excel); otherwise `,`. */
export function detectDelimiter(text: string): ',' | ';' {
  const header = text.replace(/^﻿/, '').split(/\r?\n/, 1)[0] ?? ''
  const count = (c: string) => header.split(c).length - 1
  return count(';') > count(',') ? ';' : ','
}

/** Rows of cells: quoted cells with `""` escapes and line breaks inside quotes, CRLF, a leading BOM. Empty lines are skipped. */
export function parseCsv(input: string): CsvParse {
  const text = input.replace(/^﻿/, '')
  const delimiter = detectDelimiter(text)
  const rows: CsvRow[] = []
  let cells: string[] = []
  let cell = ''
  let quoted = false
  let line = 1
  let rowLine = 1
  let quoteLine = 1
  const endRow = () => {
    cells.push(cell)
    if (cells.some((c) => c.trim() !== '')) rows.push({ line: rowLine, cells })
    cells = []
    cell = ''
  }
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++ }
      else if (c === '"') quoted = false
      else { if (c === '\n') line++; cell += c }
    } else if (c === '"' && cell.trim() === '') {
      quoted = true
      quoteLine = line
      cell = ''
    } else if (c === delimiter) {
      cells.push(cell)
      cell = ''
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++
      endRow()
      line++
      rowLine = line
    } else {
      cell += c
    }
  }
  if (quoted) return { error: { line: quoteLine, message: 'Ein Wert in Anführungszeichen wird nicht geschlossen.' } }
  if (cell !== '' || cells.length > 0) endRow()
  return { rows }
}

/**
 * One non-empty cell → the value `convertFields` expects for the field, or `{ error }` for a cell that cannot be
 * this field type. Numbers use `.` as decimal separator only.
 */
export function cellValue(fields: Fields, column: string, cell: string): { value: unknown } | { error: string } {
  const field = Object.hasOwn(fields, column) ? fields[column] : undefined
  const text = cell.trim()
  // Unknown columns pass through; convertFields reports them as unknown fields.
  if (!field) return { value: text }
  switch (field.type) {
    case 'number':
    case 'money':
      if (!/^-?\d+(\.\d+)?$/.test(text)) {
        return { error: `Spalte „${column}“: „${text}“ ist keine Zahl. Zahlen brauchen einen Punkt als Dezimaltrenner (12.5, nicht 12,5).` }
      }
      return { value: Number(text) }
    case 'boolean':
      if (text !== 'true' && text !== 'false') return { error: `Spalte „${column}“: „${text}“ ist kein Ja/Nein-Wert. Erlaubt: true oder false.` }
      return { value: text === 'true' }
    case 'list':
    case 'image':
    case 'choices':
    case 'daterange':
      return { error: `Spalte „${column}“: „${field.label}“ gibt es nicht in CSV. Dafür eine YAML- oder Markdown-Datei nehmen.` }
    default:
      return { value: text }
  }
}
