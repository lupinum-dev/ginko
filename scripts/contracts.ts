// Compatibility corpus (SPEC part 1 and 14, "Korpus"): per demo a schema, example data and the expected
// bundle for every locale. The committed files protect bundle format 3.
//   node --experimental-strip-types scripts/contracts.ts          check, exit 1 on any difference
//   node --experimental-strip-types scripts/contracts.ts --write  regenerate schema.json and bundles
// Only --write touches the committed files. Invalid schema or data is never written.
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import industrie from '../sites/industrie/ginko.config.ts'
import saas from '../sites/saas/ginko.config.ts'
import restaurant from '../sites/restaurant/ginko.config.ts'
import {
  checkSchema, servedBundle, serializeSchema, validate,
  type FileInfo, type SiteInput, type StoredEntry,
} from '../packages/ginko/src/core/index.ts'

export const demos = { restaurant, industrie, saas } satisfies Record<string, SiteInput>
export type DemoName = keyof typeof demos

// Fixed inputs, so the bundles only change when the schema or the data changes.
const TODAY = '2026-10-08'
const SCHEMA_REV = 1
const CONTENT_REV = 1
const GENERATED_AT = '2026-10-08T06:00:00.000Z'

const image = (name: string, width: number, height: number, size: number): FileInfo => ({ url: `/media/${name}`, name, size, width, height })
const pdf = (name: string, size: number): FileInfo => ({ url: `/media/${name}`, name, size })

const FILES: Record<string, FileInfo> = {
  'fl-weinabend': image('weinabend.jpg', 1600, 1067, 183004),
  'fl-galerie-01': image('gastraum.jpg', 1600, 1200, 201552),
  'fl-galerie-02': image('schnitzel.jpg', 1600, 1067, 176410),
  'fl-galerie-03': image('gastgarten.jpg', 1600, 1067, 192877),
  'fl-galerie-04': image('kueche.jpg', 1200, 1600, 168230),
  'fl-cnc-halle': image('cnc-halle.jpg', 2000, 1333, 412009),
  'fl-pressemitteilung-cnc': pdf('pressemitteilung-cnc.pdf', 238112),
  'fl-drehteil-1': image('drehteil-serie-600.jpg', 1600, 1200, 221340),
  'fl-datenblatt-600': pdf('datenblatt-serie-600.pdf', 504220),
  'fl-foto-hofer': image('sabine-hofer.jpg', 800, 1000, 96118),
  'fl-iso9001': pdf('iso-9001-2015.pdf', 143871),
  'fl-en1090': pdf('en-1090-stahlbau.pdf', 151206),
  'fl-blog-pausen': image('pausen-dach.jpg', 1600, 900, 245017),
  'fl-logo-keller': image('logo-keller.png', 600, 240, 18452),
}

export interface Rendered {
  /** Path relative to contracts/<demo>/ → exact expected content. */
  files: Record<string, string>
  /** Schema or data problems. Non-empty means nothing is written. */
  problems: string[]
}

const json = (value: unknown) => `${JSON.stringify(value, null, 2)}\n`

/** Builds every generated file of one demo and lists schema and data problems. */
export async function render(name: DemoName): Promise<Rendered> {
  const problems: string[] = []
  const schema = serializeSchema(demos[name])
  problems.push(...checkSchema(schema).map((p) => `${name}: ${p}`))

  // Stored data per brick (SPEC 6): singles hold one row, collections hold entries.
  const data = JSON.parse(readFileSync(new URL(`../contracts/${name}/data.json`, import.meta.url), 'utf8')) as Record<string, StoredEntry[]>
  for (const key of Object.keys(data)) if (!(key in schema.bricks)) problems.push(`${name}: Daten für unbekannten Baustein „${key}“`)

  for (const [key, brick] of Object.entries(schema.bricks)) {
    if (brick.kind === 'single') {
      // A new single is created from defaults on release (SPEC 2.4), so every required field needs one.
      for (const [field, def] of Object.entries(brick.fields)) {
        if (!def.optional && def.default === undefined) problems.push(`${name}: ${key}.${field} ist ein Pflichtfeld ohne default`)
      }
    }
    for (const entry of data[key] ?? []) {
      const result = await validate(schema, key, entry.data, { mode: 'release' })
      for (const issue of result.errors) problems.push(`${name}: ${key}/${entry.id} ${issue.path} [${issue.code}] ${issue.message}`)
    }
  }

  const missingFiles = new Set<string>()
  const files: Record<string, string> = { 'schema.json': json(schema) }
  for (const locale of schema.locales) {
    // As the platform serves it: Markdown strings parsed into trees (convex/bundle.ts).
    const bundle = await servedBundle({
      schema,
      requestedLocale: locale,
      entries: data,
      files: (id) => {
        const info = FILES[id]
        if (!info) missingFiles.add(id)
        return info
      },
      schemaRev: SCHEMA_REV,
      contentRev: CONTENT_REV,
      generatedAt: GENERATED_AT,
      today: TODAY,
    })
    files[`bundle.format3.${locale}.json`] = json(bundle)
  }
  for (const id of missingFiles) problems.push(`${name}: Datei „${id}“ fehlt in FILES`)
  return { files, problems }
}

/** Committed files that differ from the render, or are missing. */
export function compare(name: DemoName, files: Record<string, string>): string[] {
  const problems: string[] = []
  for (const [file, expected] of Object.entries(files)) {
    const url = new URL(`../contracts/${name}/${file}`, import.meta.url)
    if (!existsSync(url)) problems.push(`contracts/${name}/${file} fehlt (mit --write erzeugen)`)
    else if (readFileSync(url, 'utf8') !== expected) problems.push(`contracts/${name}/${file} weicht ab (mit --write neu erzeugen)`)
  }
  return problems
}

/** Everything the test and the CLI check for one demo. Empty when the corpus is consistent. */
export async function check(name: DemoName): Promise<string[]> {
  const { files, problems } = await render(name)
  return [...problems, ...compare(name, files)]
}

async function main(write: boolean): Promise<number> {
  let failed = false
  for (const name of Object.keys(demos) as DemoName[]) {
    const { files, problems } = await render(name)
    if (problems.length) {
      failed = true
      console.error(problems.join('\n'))
      continue
    }
    if (write) {
      for (const [file, content] of Object.entries(files)) writeFileSync(new URL(`../contracts/${name}/${file}`, import.meta.url), content)
      console.log(`WRITTEN ${name}: ${Object.keys(files).length} files`)
      continue
    }
    const differences = compare(name, files)
    if (differences.length) {
      failed = true
      console.error(differences.join('\n'))
      continue
    }
    console.log(`OK ${name}: schema and ${Object.keys(files).length - 1} bundles match`)
  }
  return failed ? 1 : 0
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = await main(process.argv.includes('--write'))
}
