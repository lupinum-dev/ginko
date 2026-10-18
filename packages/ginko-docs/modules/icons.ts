// Icons for the layer without a runtime icon library. At build time this module finds every icon the docs need (the
// layer's own components, `icon` values in the site's content and app.config, the built-in `docs:` brand logos), reads
// exactly those from the installed @iconify-json sets and writes them to the virtual module `#docs-icons`. Only
// <DocsIcon> imports it, so a page outside the docs downloads no icon data. A name the build cannot find logs one
// warning with its file, and renders nothing.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { createRequire } from 'node:module'
import { extname, join, relative } from 'node:path'
import { addComponent, addTemplate, addTypeTemplate, createResolver, defineNuxtModule, updateTemplates, useLogger } from '@nuxt/kit'
import { getIconData, iconToSVG } from '@iconify/utils'
import type { NuxtModule } from 'nuxt/schema'

type IconSet = Parameters<typeof getIconData>[0]
type Entry = [body: string, viewBox: string]

const SKIP_DIRS = new Set(['node_modules', '.git', '.nuxt', '.output', 'dist'])
const walk = (dir: string, extensions: readonly string[], out: string[] = []): string[] => {
  if (!existsSync(dir)) return out
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name) || name.startsWith('.')) continue
    const path = join(dir, name)
    if (statSync(path).isDirectory()) walk(path, extensions, out)
    else if (extensions.includes(extname(name))) out.push(path)
  }
  return out
}

// Names the layer's own components write as string literals.
const OWN_NAME = /['"`]((?:lucide|docs):[a-z0-9]+(?:-[a-z0-9]+)*)['"`]/g
// In a .ts file (app.config) the value must be quoted, so a type like `icon: string` is not a name.
const QUOTED_NAME = /\bicon\??\s*:\s*['"]([a-z0-9]+(?:-[a-z0-9]+)*(?::[a-z0-9]+(?:-[a-z0-9]+)*)?)['"]/g
// `icon: lucide:x` (front matter, YAML, app.config) and `icon="lucide:x"` (Markdown components); a bare name is Lucide.
const CONTENT_NAME = /\bicon["']?\s*[:=]\s*["']?([a-z0-9]+(?:-[a-z0-9]+)*(?::[a-z0-9]+(?:-[a-z0-9]+)*)?)["']?(?=\s|$|,|\}|\))/gm

/** The icon names a file mentions, as `prefix:name` (a bare name is Lucide). */
export const iconNames = (source: string, isTs: boolean): string[] =>
  [...source.matchAll(isTs ? QUOTED_NAME : CONTENT_NAME)].map((m) => (m[1]!.includes(':') ? m[1]! : `lucide:${m[1]}`))

/** One icon as [svg body, viewBox], read from the `docs` collection folder or an installed @iconify-json set (looked up from `roots`). */
export const readIcon = (name: string, roots: readonly string[], customDir: string, sets = new Map<string, IconSet | undefined>()): Entry | undefined => {
  const [prefix = '', icon = ''] = name.split(':')
  if (prefix === 'docs') {
    const file = join(customDir, `${icon}.svg`)
    if (!existsSync(file)) return
    const svg = readFileSync(file, 'utf8')
    const body = /<svg[^>]*>([\s\S]*)<\/svg>/.exec(svg)?.[1]?.trim()
    const viewBox = /viewBox="([^"]+)"/.exec(svg)?.[1]
    return body && viewBox ? [body, viewBox] : undefined
  }
  if (!sets.has(prefix)) {
    for (const from of roots) {
      try {
        sets.set(prefix, JSON.parse(readFileSync(createRequire(join(from, 'noop.js')).resolve(`@iconify-json/${prefix}/icons.json`), 'utf8')) as IconSet)
        break
      } catch { /* try the next place */ }
    }
    if (!sets.has(prefix)) sets.set(prefix, undefined)
  }
  const set = sets.get(prefix)
  const data = set && getIconData(set, icon)
  if (!data) return
  const svg = iconToSVG(data)
  return [svg.body, svg.attributes.viewBox]
}

const docsIcons: NuxtModule = defineNuxtModule({
  meta: { name: '@lupinum/ginko-docs/icons' },
  setup(_, nuxt) {
    const { resolve } = createResolver(import.meta.url)
    const logger = useLogger('@lupinum/ginko-docs')
    const layerRoot = resolve('..')
    const customDir = join(layerRoot, 'icons')

    // Registered as the global `Icon`, which ginko-components' SiteIcon (tab, card and callout icons) looks up. Nuxt loads a
    // global component lazily, so it costs a page that does not draw an icon almost nothing.
    addComponent({ name: 'Icon', filePath: resolve('../app/components/DocsIcon.vue'), global: true })

    const sets = new Map<string, IconSet | undefined>()
    const resolveIcon = (name: string) => readIcon(name, [nuxt.options.rootDir, layerRoot], customDir, sets)

    const collect = () => {
      const found = new Map<string, Set<string>>() // name -> files that name it
      const add = (name: string, file: string) => {
        const full = name.includes(':') ? name : `lucide:${name}`
        found.set(full, (found.get(full) ?? new Set()).add(file))
      }
      for (const file of walk(join(layerRoot, 'app'), ['.vue', '.ts'])) {
        for (const m of readFileSync(file, 'utf8').matchAll(OWN_NAME)) add(m[1]!, relative(layerRoot, file))
      }
      for (const layer of nuxt.options._layers) {
        const root = layer.config.rootDir ?? layer.cwd
        const files = [
          ...walk(join(root, 'content'), ['.md', '.yml', '.yaml', '.json']),
          ...['app/app.config.ts', 'app.config.ts'].map((f) => join(root, f)).filter(existsSync),
        ]
        for (const file of files) {
          for (const name of iconNames(readFileSync(file, 'utf8'), file.endsWith('.ts'))) add(name, relative(nuxt.options.rootDir, file))
        }
      }
      const icons: Record<string, Entry> = {}
      for (const name of [...found.keys()].sort()) {
        const entry = resolveIcon(name)
        if (entry) icons[name] = entry
        else logger.warn(`Icon "${name}" (${[...found.get(name)!][0]}) is not in an installed Iconify set; it renders nothing.`)
      }
      return icons
    }

    const template = addTemplate({
      filename: 'docs-icons.mjs',
      write: true,
      getContents: () => `export default ${JSON.stringify(collect())}\n`,
    })
    nuxt.options.alias['#docs-icons'] = template.dst
    addTypeTemplate({
      filename: 'types/docs-icons.d.ts',
      getContents: () => `declare module '#docs-icons' {\n  const icons: Record<string, [body: string, viewBox: string]>\n  export default icons\n}\n`,
    })

    // In dev, an edited content file or app.config can name a new icon.
    if (nuxt.options.dev) {
      nuxt.hook('builder:watch', async (_event, path) => {
        if (/\.(md|ya?ml|json)$|app\.config\.ts$/.test(path)) await updateTemplates({ filter: (t) => t.filename === 'docs-icons.mjs' })
      })
    }
  },
})

export default docsIcons
