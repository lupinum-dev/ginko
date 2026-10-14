// `pnpm local:files-export` (monorepo only): the Markdown/YAML files of a site as a `ginko export` folder, so that
// `pnpm local:import` can load them into the local platform and the Studio shows the site's file content.
// The files are read by the same code as the site's build (@lupinum/ginko-content readContent); nothing is parsed here.
// Every brick of the config counts as file content from `content/<key>/` next to the config, whatever its `source` is:
// the site will move those bricks to the platform afterwards, so the exported schema has no `source`.
// The images and files the content uses (frontmatter values, Markdown images, component image props) go into the
// export as originals for the Files library: one file per content (same bytes under two paths are one file), in
// folders that mirror their folders under public/. Entries then name them by ID, Markdown texts by `$file.<id>`.
import { createHash } from 'node:crypto'
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises'
import { basename, dirname, join, posix, resolve, sep } from 'node:path'
import type { Field, Fields, Json } from '../core/types.ts'
import { imageInfo, imagePropsOf, limitOf, parseMarkdown, remapFileIds, serializeSchema, UPLOAD_TYPES, type Schema, type UploadType } from '../core/index.ts'
import { loadConfig } from './config.ts'
import { CliError, type ExportEntry, type ExportFolder, type SiteExport } from './model.ts'

export interface FilesExportInput {
  /** The site's ginko.config.ts. */
  config: string
  /** Target folder; default `ginko-export-<site>-files` in the working folder. It must be missing or empty. */
  dir?: string
  log: (line: string) => void
}

/** Where readContent serves images that lie next to a Markdown file (ginko-content IMAGE_URL_PREFIX). */
const CONTENT_IMAGE_PREFIX = '/_ginko/img/'

const EXTENSIONS: Record<UploadType, string> = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp', 'image/heic': '.heic', 'application/pdf': '.pdf' }

export async function filesExport(input: FilesExportInput): Promise<{ dir: string; site: string; entries: number; bricks: Record<string, number>; files: number }> {
  const config = await loadConfig(input.config)
  const root = dirname(input.config)
  const publicDir = join(root, 'public')
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
  const result = await content.readContent(join(root, 'content'), publicDir, filesSchema, { markdown: 'text' })
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

  // Where each referenced file lies on disk: frontmatter values by their public path, Markdown sources as written.
  const imageProps = imagePropsOf(plain.components)
  const located = new Map<string, string>()
  const locate = (src: string) => {
    if (located.has(src)) return
    const contentImage = result.images.get(src)
    if (contentImage) return void located.set(src, contentImage)
    const publicRoot = resolve(publicDir)
    const abs = resolve(publicRoot, src.replace(/^\/+/, ''))
    if (abs.startsWith(publicRoot + sep)) located.set(src, abs)
  }
  for (const src of Object.keys(result.files)) locate(src)
  for (const entry of entries) {
    for (const text of markdownTexts(schema.bricks[entry.brick]!.fields, entry.data)) for (const src of await localSources(text, imageProps)) locate(src)
  }

  // Read every file once: its ID is the hash of its bytes, so the same picture under two paths is one library file.
  const out: SiteExport['files'] = []
  const folders = new Map<string, ExportFolder>()
  const ids = new Map<string, string>()
  const refused: string[] = []
  const tooLarge: string[] = []
  const missing: string[] = []
  const bytesOf = new Map<string, Uint8Array>()
  for (const [src, abs] of located) {
    const bytes = await readFile(abs).catch(() => undefined)
    if (!bytes) { missing.push(src); continue }
    const info = imageInfo(bytes)
    const mime = info?.type === 'jpeg' ? 'image/jpeg' : info?.type === 'png' ? 'image/png' : info?.type === 'webp' ? 'image/webp'
      : !info && bytes.subarray(0, 5).toString('latin1') === '%PDF-' ? 'application/pdf' : undefined
    if (!mime) { refused.push(src); continue }
    if (bytes.byteLength > limitOf(UPLOAD_TYPES[mime].kind)) { tooLarge.push(src); continue }
    const id = createHash('sha256').update(bytes).digest('hex')
    ids.set(src, id)
    if (out.some((file) => file.id === id)) continue
    const folder = src.startsWith(CONTENT_IMAGE_PREFIX) ? undefined : folderOf(src, folders)
    const path = `files/${id}${EXTENSIONS[mime]}`
    bytesOf.set(path, bytes)
    out.push({
      id, name: basename(abs), mime, size: bytes.byteLength, ...(info ? { width: info.width, height: info.height } : {}),
      sha256: id, original: true, path, ...(folder ? { folder } : {}),
    })
  }
  const problems = [
    ...(refused.length ? [`These images cannot go into the Files library (it takes JPEG, PNG, WebP and HEIC, and PDF files): ${refused.join(', ')}. Convert them, for example to WebP, and run local:files-export again.`] : []),
    ...(tooLarge.length ? [`These files are larger than the Files library takes (images ${limitOf('image') / 1024 / 1024} MB, PDF files ${limitOf('file') / 1024 / 1024} MB): ${tooLarge.join(', ')}. Make them smaller and run local:files-export again.`] : []),
  ]
  // Nothing is written before every file passed: a refused export leaves the folder as it was.
  if (problems.length) throw new CliError(problems.join('\n'))
  await mkdir(join(dir, 'files'), { recursive: true })
  for (const [path, bytes] of bytesOf) await writeFile(join(dir, path), bytes)
  if (missing.length) input.log(`Warning: ${missing.length} image path(s) in Markdown texts point to no file under public/ (${missing.slice(0, 3).join(', ')}). They stay as they are.`)

  // Entries name the files by ID: frontmatter values through the shared walk, Markdown sources as `$file.<id>`.
  const refs = new Map([...ids].map(([src, id]) => [src, `$file.${id}`]))
  let kept = 0
  for (const entry of entries) {
    const fields = schema.bricks[entry.brick]!.fields
    entry.data = mapMarkdown(fields, remapFileIds(fields, entry.data, ids), (text) => toFileRefs(text, refs, imageProps))
    for (const text of markdownTexts(fields, entry.data)) kept += [...await localSources(text, imageProps)].filter((src) => ids.has(src)).length
  }
  if (kept > 0) input.log(`Warning: ${kept} image(s) inside Markdown texts keep their public/ path, written in a form this export cannot rewrite; the site must keep serving them.`)

  const export_: SiteExport = {
    format: 1, site: plain.site, name: plain.name, schema, schemaRev: 1, contentRev: 1,
    exportedAt: new Date().toISOString(), entries, folders: [...folders.values()], files: out,
  }
  await writeFile(join(dir, 'export.json'), `${JSON.stringify(export_, null, 2)}\n`)
  input.log(`Wrote ${entries.length} entries and ${out.length} files to ${join(dir, 'export.json')} (${basename(root)}).`)
  return { dir, site: plain.site, entries: entries.length, bricks, files: out.length }
}

/** The folder of a public path (`/images/team/a.png` → `images/team`), with every folder up to it added to `folders`. */
function folderOf(src: string, folders: Map<string, ExportFolder>): string | undefined {
  const parts = posix.dirname(src.replace(/^\/+/, '')).split('/').filter((part) => part !== '' && part !== '.')
  let parent: string | undefined
  for (const part of parts) {
    const id = parent === undefined ? part : `${parent}/${part}`
    if (!folders.has(id)) folders.set(id, { id, name: part, ...(parent === undefined ? {} : { parent }) })
    parent = id
  }
  return parent
}

/** Every Markdown text of an entry: each language, list rows included. */
function markdownTexts(fields: Fields, data: Record<string, Json>): string[] {
  const texts: string[] = []
  mapMarkdown(fields, data, (text) => { texts.push(text); return text })
  return texts
}

/** The data with `fn` applied to every Markdown text. */
function mapMarkdown(fields: Fields, data: Record<string, Json>, fn: (text: string) => string): Record<string, Json> {
  const walk = (field: Field, value: Json): Json => {
    if (field.type === 'markdown') {
      if (typeof value === 'string') return fn(value)
      if (isRecord(value)) return Object.fromEntries(Object.entries(value).map(([locale, text]) => [locale, typeof text === 'string' ? fn(text) : text]))
    }
    if (field.type === 'list' && Array.isArray(value)) {
      return value.map((row) => (isRecord(row) ? { ...row, ...mapMarkdown(field.of, row, fn) } : row))
    }
    return value
  }
  return Object.fromEntries(Object.entries(data).map(([name, value]) => [name, Object.hasOwn(fields, name) ? walk(fields[name]!, value) : value]))
}

/** The site paths (`/images/a.png`, `/_ginko/img/<hash>.png`) a text shows as an image or in a component image prop. */
async function localSources(text: string, imageProps: Record<string, string[]>): Promise<Set<string>> {
  const out = new Set<string>()
  const visit = (nodes: readonly Json[]) => {
    for (const node of nodes) {
      if (!Array.isArray(node) || typeof node[0] !== 'string' || !isRecord(node[1])) continue
      const props = node[1]
      const names = node[0] === 'img' ? ['src'] : Object.hasOwn(imageProps, node[0]) ? imageProps[node[0]]! : []
      for (const name of names) {
        const src = props[name]
        if (typeof src === 'string' && src.startsWith('/') && !src.startsWith('//')) out.add(src)
      }
      visit(node.slice(2))
    }
  }
  visit((await parseMarkdown(text)).value.nodes)
  return out
}

/** The text with each path of `refs` replaced by its reference where it is an image destination or a component image prop. */
function toFileRefs(text: string, refs: ReadonlyMap<string, string>, imageProps: Record<string, string[]>): string {
  const names = [...new Set(Object.values(imageProps).flat())].map(escape)
  let out = text
  for (const [src, ref] of refs) {
    const path = escape(src)
    out = out.replace(new RegExp(`(!\\[[^\\]]*\\]\\(\\s*<?)${path}(?=[>)\\s])`, 'g'), (_m, head: string) => head + ref)
    if (names.length) out = out.replace(new RegExp(`(\\b(?:${names.join('|')})=)(["'])${path}\\2`, 'g'), (_m, head: string, quote: string) => `${head}${quote}${ref}${quote}`)
  }
  return out
}

const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

function isRecord(value: unknown): value is Record<string, Json> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
