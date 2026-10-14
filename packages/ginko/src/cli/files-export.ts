// `pnpm local:files-export` (monorepo only): the Markdown/YAML files of a site as a `ginko export` folder, so that
// `pnpm local:import` can load them into the local platform and the Studio shows the site's file content.
// The files are read by the same code as the site's build (@lupinum/ginko-content readContent); nothing is parsed here.
// Every brick of the config counts as file content from `content/<key>/` next to the config, whatever its `source` is:
// the site will move those bricks to the platform afterwards, so the exported schema has no `source`.
import { mkdir, readdir, writeFile } from 'node:fs/promises'
import { basename, dirname, join } from 'node:path'
import { serializeSchema, type Schema } from '../core/index.ts'
import { loadConfig } from './config.ts'
import { CliError, type ExportEntry, type SiteExport } from './model.ts'

export interface FilesExportInput {
  /** The site's ginko.config.ts. */
  config: string
  /** Target folder; default `ginko-export-<site>-files` in the working folder. It must be missing or empty. */
  dir?: string
  log: (line: string) => void
}

export async function filesExport(input: FilesExportInput): Promise<{ dir: string; site: string; entries: number; bricks: Record<string, number>; files: number }> {
  const config = await loadConfig(input.config)
  const root = dirname(input.config)
  const plain = serializeSchema(config)
  const filesSchema: Schema = { ...plain, bricks: Object.fromEntries(Object.entries(plain.bricks).map(([key, brick]) => [key, { ...brick, source: 'files' as const }])) }
  const schema: Schema = { ...plain, bricks: Object.fromEntries(Object.entries(plain.bricks).map(([key, { source: _source, ...brick }]) => [key, brick])) as Schema['bricks'] }

  const dir = input.dir ?? `ginko-export-${plain.site}-files`
  const present = await readdir(dir).catch((error: NodeJS.ErrnoException) => {
    if (error.code === 'ENOENT') return []
    throw new CliError(error.code === 'ENOTDIR' ? `“${dir}” is not a folder.` : `The folder “${dir}” cannot be read.`, 'USAGE')
  })
  if (present.length > 0) throw new CliError(`The folder “${dir}” is not empty. Choose a new folder.`, 'USAGE')

  let content: typeof import('@lupinum/ginko-content')
  try {
    content = await import('@lupinum/ginko-content')
  } catch (error) {
    if ((error as { code?: string }).code !== 'ERR_MODULE_NOT_FOUND') throw error
    throw new CliError('Install @lupinum/ginko-content to read file content.', 'USAGE')
  }
  const result = await content.readContent(join(root, 'content'), join(root, 'public'), filesSchema)
  if (result.errors.length > 0) throw new CliError(`The content has errors:\n${result.errors.map(content.errorLine).join('\n')}`)

  const entries: ExportEntry[] = []
  const bricks: Record<string, number> = {}
  for (const [brick, list] of Object.entries(result.entries)) {
    bricks[brick] = list.length
    list.forEach((entry, index) => {
      const { updatedAt: _updatedAt, sources: _sources, trees: _trees, ...rest } = entry
      // `data` holds each translatable field as { de, en } and `prints` marks each translation as fresh: the shape of a platform entry.
      entries.push({ id: rest.id, brick, kind: plain.bricks[brick]!.kind === 'single' ? 'single' : 'item', order: index, data: rest.data, prints: (rest.prints ?? {}) as ExportEntry['prints'], rev: 1 })
    })
  }
  const images = Object.keys(result.files)
  if (images.length > 0) input.log(`Warning: ${images.length} file(s) are referenced from frontmatter (${images.slice(0, 3).join(', ')}…). They are not uploaded; the entries keep the paths.`)

  const out: SiteExport = {
    format: 1, site: plain.site, name: plain.name, schema, schemaRev: 1, contentRev: 1,
    exportedAt: new Date().toISOString(), entries, folders: [], files: [],
  }
  await mkdir(join(dir, 'files'), { recursive: true })
  await writeFile(join(dir, 'export.json'), `${JSON.stringify(out, null, 2)}\n`)
  input.log(`Wrote ${entries.length} entries to ${join(dir, 'export.json')} (${basename(root)}).`)
  return { dir, site: plain.site, entries: entries.length, bricks, files: images.length }
}
