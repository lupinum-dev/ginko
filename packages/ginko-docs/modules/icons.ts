// Icons for the layer without a runtime icon library. At build time this module finds every icon the docs need (the
// layer's own components, `icon` values in the site's content and app.config, the built-in `docs:` brand logos), reads
// exactly those from the installed @iconify-json sets and writes them to the virtual module `#docs-icons`. Only
// <DocsIcon> imports it, so a page outside the docs downloads no icon data. A name the build cannot find logs one
// warning with its file, and renders nothing.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { createRequire } from 'node:module'
import { extname, join, relative, resolve } from 'node:path'
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
const NAME = '[a-z0-9]+(?:-[a-z0-9]+)*(?::[a-z0-9]+(?:-[a-z0-9]+)*)?'
// In a .ts file (app.config) the value must be quoted, so a type like `icon: string` is not a name.
const QUOTED_NAME = new RegExp(`\\bicon\\??\\s*:\\s*['"](${NAME})['"]`, 'g')
// `icon: lucide:x` in YAML and front matter; a bare name is Lucide.
const YAML_NAME = new RegExp(`\\bicon["']?\\s*:\\s*["']?(${NAME})["']?(?=\\s|$|,|\\}|\\))`, 'gm')
// `icon="lucide:x"` and `:icon="'lucide:x'"` on a Markdown component or a Vue tag. A bound value without inner quotes
// (`:icon="item"`) is a variable, not a name.
const ATTR_NAME = new RegExp(`(?<![\\w-])(?::icon=["']['"]|(?<!:)icon=["'])(${NAME})["']`, 'g')
// <Icon name="lucide:x"> and <Icon :name="'lucide:x'"> in a site's own components.
const ICON_TAG = new RegExp(`<Icon\\b[^>]*?\\s(?::name=["']['"]|name=["'])(${NAME})["']`, 'g')

const matches = (re: RegExp, source: string) => [...source.matchAll(re)].map((m) => (m[1]!.includes(':') ? m[1]! : `lucide:${m[1]}`))

const stripCode = (code: string) => code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|\s)\/\/.*$/gm, '$1')

/**
 * Code without its comments, so a commented-out icon is not bundled. `//` counts only at a line start or after a space
 * (not in `https://`). In a .vue file the template keeps its text; only `<!-- -->` and the comments inside `<script>` go.
 */
export const stripComments = (source: string, file = ''): string =>
  file.endsWith('.vue')
    ? source.replace(/<!--[\s\S]*?-->/g, '').replace(/(<script\b[^>]*>)([\s\S]*?)(<\/script>)/g, (_, open: string, code: string, close: string) => open + stripCode(code) + close)
    : stripCode(source)

/** The icon names in app.config.ts (`icon: 'x'`) or a .vue file (`<Icon name="x">`, `icon="x"`). Comments are ignored. */
export const codeIconNames = (source: string, file: string): string[] => {
  const code = stripComments(source, file)
  return file.endsWith('.vue') ? [...matches(ICON_TAG, code), ...matches(ATTR_NAME, code)] : matches(QUOTED_NAME, code)
}

/**
 * The icon names a content file names. YAML, JSON and front matter are read whole. In Markdown only the front matter,
 * the attributes of a component (`:card{icon="x"}`) and the `---` block inside a `::component` count; prose and code are skipped.
 */
export const contentIconNames = (source: string, file: string): string[] => {
  if (!file.endsWith('.md')) return matches(YAML_NAME, source)
  const front = /^---\r?\n([\s\S]*?)\r?\n---/.exec(source)
  const body = (front ? source.slice(front[0].length) : source)
    .replace(/^(```|~~~)[^\n]*\n[\s\S]*?^\1[^\n]*$/gm, '')
    .replace(/`[^`\n]*`/g, '')
  const names = front ? matches(YAML_NAME, front[1]!) : []
  for (const m of body.matchAll(/:{1,}[a-z][\w-]*(?:\[[^\]\n]*\])?\{([^}\n]*)\}/g)) names.push(...matches(ATTR_NAME, m[1]!))
  for (const m of body.matchAll(/^:{2,}[\w-]+[^\n]*\n---\r?\n([\s\S]*?)\r?\n---/gm)) names.push(...matches(YAML_NAME, m[1]!))
  return names
}

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

export interface CollectOptions {
  /** The layer's own folder (its `app/` is scanned for literal names, its `icons/` holds the `docs:` logos). */
  layerRoot: string
  /** Root folders of every layer, the site first. Their `content/`, `app.config.ts` and (for the site's own layers) `app/` are scanned. */
  roots: readonly string[]
  /** Where to resolve `@iconify-json/<set>` from. */
  resolveFrom: readonly string[]
  /** Paths in warnings are shown relative to this folder. */
  relativeTo: string
}

/** Every icon the layer and the site name, read from the installed sets, plus one warning per name that is not installed. */
export const collectIcons = (o: CollectOptions): { icons: Record<string, Entry>, warnings: string[] } => {
  const found = new Map<string, Set<string>>() // name -> files that name it
  const add = (name: string, file: string) => found.set(name, (found.get(name) ?? new Set()).add(file))
  const read = (file: string) => readFileSync(file, 'utf8')

  for (const file of walk(join(o.layerRoot, 'app'), ['.vue', '.ts'])) {
    for (const m of stripComments(read(file), file).matchAll(OWN_NAME)) add(m[1]!, relative(o.layerRoot, file))
  }
  for (const root of o.roots) {
    const files = [
      ...walk(join(root, 'content'), ['.md', '.yml', '.yaml', '.json']),
      ...['app/app.config.ts', 'app.config.ts'].map((f) => join(root, f)).filter(existsSync),
    ]
    for (const file of files) {
      const names = file.endsWith('.ts') ? codeIconNames(read(file), file) : contentIconNames(read(file), file)
      for (const name of names) add(name, relative(o.relativeTo, file))
    }
    // A site's own components may use <Icon name="lucide:x"> directly; the layer's folder was scanned above. Only .vue
    // files: a .ts file holds style variants like `icon: 'size-11'` that are not icon names.
    if (resolve(root) !== resolve(o.layerRoot)) {
      for (const file of walk(join(root, 'app'), ['.vue'])) {
        for (const name of codeIconNames(read(file), file)) add(name, relative(o.relativeTo, file))
      }
    }
  }

  const sets = new Map<string, IconSet | undefined>()
  const customDir = join(o.layerRoot, 'icons')
  const icons: Record<string, Entry> = {}
  const warnings: string[] = []
  for (const name of [...found.keys()].sort()) {
    const entry = readIcon(name, o.resolveFrom, customDir, sets)
    if (entry) icons[name] = entry
    else warnings.push(`Icon "${name}" (${[...found.get(name)!][0]}) is not in an installed Iconify set; it renders nothing.`)
  }
  return { icons, warnings }
}

const docsIcons: NuxtModule = defineNuxtModule({
  meta: { name: '@lupinum/ginko-docs/icons' },
  setup(_, nuxt) {
    const { resolve: here } = createResolver(import.meta.url)
    const logger = useLogger('@lupinum/ginko-docs')
    const layerRoot = here('..')

    // Registered as the global `Icon`, which ginko-components' SiteIcon (tab, card and callout icons) looks up. The low
    // priority lets a site's own @nuxt/icon win. Nuxt loads a global component lazily.
    addComponent({ name: 'Icon', filePath: here('../app/components/DocsIcon.vue'), global: true, priority: -1 })

    const warned = new Set<string>()
    const collect = () => {
      const { icons, warnings } = collectIcons({
        layerRoot,
        roots: nuxt.options._layers.map((layer) => layer.config.rootDir ?? layer.cwd),
        resolveFrom: [nuxt.options.rootDir, layerRoot],
        relativeTo: nuxt.options.rootDir,
      })
      for (const warning of warnings) if (!warned.has(warning)) { warned.add(warning); logger.warn(warning) }
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

    // The icon map is only needed by a page that draws an icon from it; keep it out of the prefetch links every page carries.
    nuxt.hook('build:manifest', (manifest) => {
      for (const [key, item] of Object.entries(manifest)) {
        // A chunk that DocsIcon shares with the layer components has a hashed key and file, but keeps the name "DocsIcon".
        if ([key, item.file, item.name, item.src].some((s) => s && /DocsIcon|docs-icons/.test(s))) item.prefetch = false
      }
    })

    // In dev, an edited content file or app.config can name a new icon.
    if (nuxt.options.dev) {
      nuxt.hook('builder:watch', async (_event, path) => {
        if (/\.(md|ya?ml|json|vue)$|app\.config\.ts$/.test(path)) await updateTemplates({ filter: (t) => t.filename === 'docs-icons.mjs' })
      })
    }
  },
})

export default docsIcons
