// Builds a shadcn-vue registry from the component sources, so `npx shadcn-vue add <url>/r/callout.json` installs the
// same files the npm package ships. Nothing is copied into git: the output folder is generated (and git-ignored).
// Env GINKO_REGISTRY_URL = public URL of the output folder (inter-item dependencies are URLs).
// Run: pnpm --filter @lupinum/ginko-components registry [outDir]   (default: sites/docs/public/r)
//
// Layout: one item per component (name = kebab-case file name), one `ginko-utils` item for helper files that several
// items need, one `ginko-components` item with the stylesheet. No file has a `target`: the CLI then installs each file
// at <components alias>/<path>, i.e. all of them into `components/ginko/` of the app (a `target` would ignore the app's
// aliases and `src/` folder). That keeps the relative imports between the files valid. Every file is typed
// `registry:component` for the same reason: a `registry:lib` file would go to the lib alias instead.
import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { basename, dirname, join, resolve } from 'node:path'
import { STYLES } from '../src/styles.ts'

const pkgRoot = join(import.meta.dirname, '..')
const componentsDir = join(pkgRoot, 'src/runtime/components')
// An installed copy has no ginko-i18n behind it: its fallback texts are the English ones.
const i18nFile = join(pkgRoot, 'i18n/en.json')
const DEFAULT_BASE_URL = 'http://localhost:3500/r' // the docs dev server; set GINKO_REGISTRY_URL for a deployed registry
const FILE_TYPE = 'registry:component'
const SCHEMA_BASE = 'https://shadcn-vue.com/schema'
/** Files that belong to one item although nothing in that item imports them (the callout aliases note, info, ...). */
const EXTRA_FILES: Record<string, string[]> = { callout: ['aliases.ts'] }
/** Imports that need no npm install: the host app provides vue. */
const PROVIDED = new Set(['vue'])

export interface RegistryFile { path: string, type: string, content: string }
export interface RegistryItem {
  $schema: string
  name: string
  type: string
  title: string
  description: string
  dependencies?: string[]
  registryDependencies?: string[]
  files: RegistryFile[]
  docs?: string
}

const kebab = (file: string) => basename(file, '.vue').replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase()
const importRe = /(?:^|\n)\s*(?:import|export)\s[^'"\n]*?from\s*['"]([^'"]+)['"]|(?:^|\n)\s*import\s*['"]([^'"]+)['"]/g

function specifiers(source: string): string[] {
  return [...source.matchAll(importRe)].map((m) => (m[1] ?? m[2])!)
}

/** `./icons` → `icons.ts`, `./Callout.vue` → itself; undefined when no such file sits next to the component. */
function resolveLocal(spec: string, files: Set<string>): string | undefined {
  const name = spec.replace(/^\.\//, '')
  return [name, `${name}.ts`].find((c) => files.has(c))
}

function packageName(spec: string): string {
  const parts = spec.split('/')
  return spec.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0]!
}

const sourceOf = (file: string) => readFileSync(join(componentsDir, file), 'utf8')

/** The text.ts fallback reads `../../../i18n/de.json`; installed, a generated `texts.ts` (the English texts) sits next to it.
 *  The CLI parses every `registry:component` file as TypeScript, so the JSON itself cannot be shipped. */
function rewrite(file: string, source: string): string {
  return file === 'text.ts' ? source.replace('../../../i18n/de.json', './texts') : source
}

/**
 * `baseUrl` is where the folder is served (`https://docs.example.com/r`). The CLI resolves a bare name in
 * `registryDependencies` against the shadcn-vue registry, so a dependency between our items must be a full URL.
 */
export function buildRegistry(outDir: string, baseUrl = DEFAULT_BASE_URL): RegistryItem[] {
  const base = baseUrl.replace(/\/$/, '')
  const files = new Set(readdirSync(componentsDir).filter((f) => /\.(vue|ts)$/.test(f) && f !== 'index.ts'))
  const components = [...files].filter((f) => f.endsWith('.vue')).sort()
  const itemOf = new Map(components.map((f) => [f, kebab(f)]))

  // Walk each component's imports: .vue files become registry dependencies, helper .ts files are collected.
  const own = new Map<string, Set<string>>() // item → .ts files it reaches
  const deps = new Map<string, Set<string>>() // item → other component items
  const npm = new Map<string, Set<string>>() // item → npm packages
  const reachedBy = new Map<string, Set<string>>() // .ts file → items reaching it
  for (const vue of components) {
    const item = kebab(vue)
    own.set(item, new Set())
    deps.set(item, new Set())
    npm.set(item, new Set())
    const seen = new Set<string>()
    const visit = (file: string) => {
      if (seen.has(file)) return
      seen.add(file)
      for (const spec of specifiers(sourceOf(file))) {
        if (spec.startsWith('.')) {
          const target = resolveLocal(spec, files)
          if (!target) {
            if (!(file === 'text.ts' && spec.endsWith('/de.json'))) throw new Error(`${file}: cannot resolve ${spec}`)
            continue
          }
          if (target.endsWith('.vue')) deps.get(item)!.add(itemOf.get(target)!)
          else {
            own.get(item)!.add(target)
            reachedBy.set(target, (reachedBy.get(target) ?? new Set()).add(item))
            visit(target)
          }
        } else if (!PROVIDED.has(packageName(spec))) npm.get(item)!.add(packageName(spec))
      }
    }
    visit(vue)
    for (const extra of EXTRA_FILES[item] ?? []) visit(extra)
    for (const extra of EXTRA_FILES[item] ?? []) { own.get(item)!.add(extra); reachedBy.set(extra, (reachedBy.get(extra) ?? new Set()).add(item)) }
  }
  // seen-walk above skips .vue targets; their own imports belong to their own item.

  const shared = new Set([...reachedBy].filter(([, items]) => items.size > 1).map(([file]) => file))
  const utilsNpm = new Set<string>()
  for (const file of shared) for (const spec of specifiers(sourceOf(file))) if (!spec.startsWith('.') && !PROVIDED.has(packageName(spec))) utilsNpm.add(packageName(spec))

  const toFile = (file: string): RegistryFile => ({ path: `ginko/${file}`, type: FILE_TYPE, content: rewrite(file, sourceOf(file)) })

  const items: RegistryItem[] = []
  const css: RegistryItem = {
    $schema: `${SCHEMA_BASE}/registry-item.json`,
    name: 'ginko-components',
    type: 'registry:component',
    title: 'Ginko components stylesheet',
    description: 'The styles of all Ginko content components (plain CSS, class prefix ginko-, reads the shadcn tokens).',
    files: [{
      path: 'ginko/ginko-components.css', type: FILE_TYPE,
      content: STYLES.map((f) => readFileSync(join(pkgRoot, 'src/runtime', f), 'utf8').trimEnd()).join('\n\n') + '\n',
    }],
    docs: 'Import the stylesheet once, e.g. in your main CSS: @import "./components/ginko/ginko-components.css"; (path relative to that CSS file)',
  }
  items.push(css)

  const sharedNpm = [...utilsNpm].sort()
  items.push({
    $schema: `${SCHEMA_BASE}/registry-item.json`,
    name: 'ginko-utils',
    type: 'registry:component',
    title: 'Ginko shared helpers',
    description: 'Helper functions and texts that several Ginko components use.',
    ...(sharedNpm.length ? { dependencies: sharedNpm } : {}),
    files: [...shared].sort().map((f) => toFile(f)).concat(
      shared.has('text.ts') ? [{ path: 'ginko/texts.ts', type: FILE_TYPE, content: `export default ${readFileSync(i18nFile, 'utf8').trim()}\n` }] : [],
    ),
  })

  for (const vue of components) {
    const name = kebab(vue)
    const mine = [...own.get(name)!].filter((f) => !shared.has(f)).sort()
    const registryDependencies = new Set([...deps.get(name)!].filter((d) => d !== name))
    registryDependencies.add('ginko-components')
    if ([...own.get(name)!].some((f) => shared.has(f))) registryDependencies.add('ginko-utils')
    const dependencies = [...npm.get(name)!].sort()
    items.push({
      $schema: `${SCHEMA_BASE}/registry-item.json`,
      name,
      type: 'registry:component',
      title: vue.replace(/\.vue$/, ''),
      description: `Ginko ${vue.replace(/\.vue$/, '')} content component.`,
      ...(dependencies.length ? { dependencies } : {}),
      registryDependencies: [...registryDependencies].sort().map((d) => `${base}/${d}.json`),
      files: [toFile(vue), ...mine.map(toFile)],
    })
  }

  rmSync(outDir, { recursive: true, force: true })
  mkdirSync(outDir, { recursive: true })
  for (const item of items) writeFileSync(join(outDir, `${item.name}.json`), JSON.stringify(item, null, 2) + '\n')
  const index = {
    $schema: `${SCHEMA_BASE}/registry.json`,
    name: 'ginko',
    homepage: base.replace(/\/r$/, ''),
    items: items.map(({ files, docs, ...rest }) => ({ ...rest, files: files.map(({ content, ...f }) => f) })),
  }
  writeFileSync(join(outDir, 'registry.json'), JSON.stringify(index, null, 2) + '\n')
  return items
}

if (process.argv[1] && resolve(process.argv[1]) === import.meta.filename) {
  const out = resolve(process.argv[2] ?? join(pkgRoot, '../../sites/docs/public/r'))
  const items = buildRegistry(out, process.env.GINKO_REGISTRY_URL)
  console.log(`registry: ${items.length} items → ${out} (dependency URLs: ${process.env.GINKO_REGISTRY_URL ?? DEFAULT_BASE_URL})`)
}
