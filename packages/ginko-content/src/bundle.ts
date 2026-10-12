import { mkdirSync, readFileSync } from 'node:fs'
import { basename, extname, join } from 'node:path'
import { buildBundle, imageInfo, resolveRouteLinks, todayIn, type Bundle, type FileInfo, type Locale, type MarkdownValue, type Schema } from '@lupinum/ginko'
import { hashOf, head } from './images.ts'
import { makeVariants } from './variants.ts'
import { readContent, type ContentError, type ReadOptions } from './read.ts'

/** The schema with only the file bricks: what the site's build turns into a bundle (CONTENT.md). */
export function fileSchema(schema: Schema): Schema {
  return { ...schema, bricks: Object.fromEntries(Object.entries(schema.bricks).filter(([, brick]) => brick.source === 'files')) }
}

/** The site path that serves one markdown tree; `id` may contain `/` (`docs/einstieg`), kept as path segments because a static build would double-encode `%2F`. */
export function markdownRef(locale: Locale, brick: string, id: string, field: string): string {
  return `/__ginko/files/${locale}/md/${encodeURIComponent(brick)}/${id.split('/').map(encodeURIComponent).join('/')}/${encodeURIComponent(field)}.json`
}

/**
 * The bundle for page state: every markdown tree replaced by `{ ref, toc }` (CONTENT.md, Phase 14).
 * `trees` collects the trees by their ref, for the route that serves them.
 */
export function withMarkdownRefs(bundle: Bundle, schema: Schema, trees: Map<string, MarkdownValue>): Bundle {
  const swap = (brick: string, id: string, data: Record<string, unknown>) => {
    const out = { ...data }
    for (const [name, field] of Object.entries(schema.bricks[brick]?.fields ?? {})) {
      const value = out[name] as MarkdownValue | undefined
      if (field.type !== 'markdown' || !value || !('nodes' in value)) continue
      const ref = markdownRef(bundle.locale as Locale, brick, id, name)
      trees.set(ref, value)
      out[name] = value.toc === undefined ? { ref } : { ref, toc: value.toc }
    }
    return out
  }
  const bricks = Object.fromEntries(Object.entries(bundle.bricks).map(([key, b]) => [key, b.kind === 'single'
    ? { ...b, data: swap(key, key, b.data) }
    : { ...b, items: b.items.map((item) => ({ ...item, data: swap(key, item.id, item.data) })) }]))
  return { ...bundle, bricks }
}

/**
 * One bundle per locale from the files, built by the core's buildBundle, so visibility, order, URLs
 * and fallbacks follow the same rules as platform content. Revisions are 0: files have no history.
 */
export async function buildFileBundles(contentDir: string, publicDir: string, schema: Schema, now = new Date(), options: BuildOptions = {}): Promise<{ bundles: Partial<Record<Locale, Bundle>>; images: Map<string, string>; imageFiles: Set<string>; errors: ContentError[] }> {
  const files = fileSchema(schema)
  const { entries, files: fileInfo, images, errors } = await readContent(contentDir, publicDir, files, options)
  const imageFiles = new Set<string>()
  if (options.imageDir) await addVariants(fileInfo, images, publicDir, options.imageDir, imageFiles)
  const bundles: Partial<Record<Locale, Bundle>> = {}
  for (const locale of schema.locales) {
    bundles[locale] = resolveRouteLinks(buildBundle({
      schema: files, requestedLocale: locale, entries, files: (id) => fileInfo[id],
      schemaRev: 0, contentRev: 0, generatedAt: now.toISOString(), today: todayIn(schema.timezone, now),
    }), files)
  }
  return { bundles, images, imageFiles, errors }
}

export interface BuildOptions extends ReadOptions {
  /** Where the WebP variants of the site's images are written (the folder served at `/_ginko/img`). Without it, no variants are made. */
  imageDir?: string
}

/**
 * WebP copies (480, 960, 1600 px, narrower than the image) of the images in `public/` that frontmatter fields use
 * (set on their `FileInfo`, so image values carry `variants`) and of the co-located images in Markdown.
 * `names` receives every variant file name. Logs one line with the count and time when something was encoded.
 */
async function addVariants(fileInfo: Record<string, FileInfo>, images: Map<string, string>, publicDir: string, imageDir: string, names: Set<string>) {
  mkdirSync(imageDir, { recursive: true })
  const started = performance.now()
  const counter = { encoded: 0 }
  const jobs: (() => Promise<void>)[] = []
  for (const file of Object.values(fileInfo)) {
    if (!file.width) continue
    const abs = join(publicDir, file.url.replace(/^\/+/, ''))
    jobs.push(async () => {
      const variants = await makeVariants(abs, hashOf(readFileSync(abs)), file.width!, imageDir, names, counter)
      if (variants.length) file.variants = variants
    })
  }
  for (const [url, abs] of images) {
    jobs.push(async () => {
      const info = imageInfo(head(abs, 64 * 1024))
      if (info) await makeVariants(abs, basename(url, extname(url)), info.width, imageDir, names, counter)
    })
  }
  for (let i = 0; i < jobs.length; i += 4) await Promise.all(jobs.slice(i, i + 4).map((job) => job()))
  if (counter.encoded) console.log(`[ginko] ${counter.encoded} image variants (WebP) in ${((performance.now() - started) / 1000).toFixed(1)} s`)
}
