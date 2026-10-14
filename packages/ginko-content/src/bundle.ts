import { mkdirSync, readFileSync } from 'node:fs'
import { basename, extname, join } from 'node:path'
import type { Locale } from '@lupinum/ginko'
import { buildBundle, imageInfo, isVisible, resolveRouteLinks, todayIn, type Bundle, type FileInfo, type Schema } from '@lupinum/ginko/internal'
import { hashOf, head } from './images.ts'
import { makeVariants } from './variants.ts'
import { readContent, type ContentError, type ReadOptions } from './read.ts'

/** The schema with only the file bricks: what the site's build turns into a bundle (CONTENT.md). */
export function fileSchema(schema: Schema): Schema {
  return { ...schema, bricks: Object.fromEntries(Object.entries(schema.bricks).filter(([, brick]) => brick.source === 'files')) }
}

/**
 * The bundle a site serves to everyone (`/__ginko/files/*`, page state, search): items whose visibility window
 * ended before `now` are left out (an expired offer is not private data to publish), and the repo path
 * `source` is dropped unless `keepSource` is set (docs pages need it for their "Edit this page" link).
 * Items whose window is current or still to come stay: the page filters them by date in the browser.
 * @internal Loaded by the Ginko module and CLI; sites do not import it.
 */
export function publicBundle(bundle: Bundle, schema: Schema, now: Date, options: { keepSource?: boolean } = {}): Bundle {
  const today = todayIn(schema.timeZone, now)
  const bricks = Object.fromEntries(Object.entries(bundle.bricks).map(([key, brick]) => {
    if (brick.kind !== 'collection') return [key, brick]
    const def = schema.bricks[key]
    const items = brick.items
      .filter((item) => !def || isVisible(def, item.data, today))
      .map(({ source, ...item }) => (options.keepSource && source !== undefined ? { ...item, source } : item))
    return [key, { ...brick, items }]
  }))
  return { ...bundle, bricks }
}

/**
 * One bundle per locale from the files, built by the core's buildBundle, so visibility, order, URLs
 * and fallbacks follow the same rules as platform content. Revisions are 0: files have no history.
 * @internal Loaded by the Ginko module and CLI; sites do not import it.
 */
export async function buildFileBundles(options: BuildOptions): Promise<BuildResult> {
  const { contentDir, publicDir, schema, now = new Date() } = options
  const files = fileSchema(schema)
  const { entries, files: fileInfo, images, errors } = await readContent(contentDir, publicDir, files, options)
  const imageFiles = new Set<string>()
  if (options.imageDir) await addVariants(fileInfo, images, publicDir, options.imageDir, imageFiles)
  const build = (locale: Locale) => buildBundle({
    schema: files, requestedLocale: locale, entries, files: (id) => fileInfo[id],
    schemaRev: 0, contentRev: 0, generatedAt: now.toISOString(), today: todayIn(schema.timeZone, now),
  })
  // Links to an entry left out of a language (not translated) go to its main-language page.
  const main = build(schema.locales[0]!)
  const bundles: Partial<Record<Locale, Bundle>> = {}
  for (const locale of schema.locales) bundles[locale] = resolveRouteLinks(locale === main.locale ? main : build(locale), files, main)
  return { bundles, images, imageFiles, errors }
}

export interface BuildOptions extends ReadOptions {
  /** The site's `content/` folder. */
  contentDir: string
  /** The site's `public/` folder. */
  publicDir: string
  schema: Schema
  /** The time the build counts as "now" (visibility windows, `generatedAt`). Default: the current time. */
  now?: Date
  /** Where the WebP variants of the site's images are written (the folder served at `/_ginko/img`). Without it, no variants are made. */
  imageDir?: string
}

export interface BuildResult {
  /** One bundle per locale of the schema. */
  bundles: Partial<Record<Locale, Bundle>>
  /** Co-located Markdown images: served URL to absolute path. */
  images: Map<string, string>
  /** Every WebP variant file name that was written to `imageDir`. */
  imageFiles: Set<string>
  errors: ContentError[]
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
