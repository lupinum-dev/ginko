// Links between pages (CONTENT.md, "Links zwischen Seiten"): `$blog.my-post` and `$page.menu` in Markdown,
// `::snippet{name="…"}` for reusable text, and a link check that runs on bundles before any HTML exists.
// Pure: works on bundles and comark trees.
import type { Bundle, BundleItem } from './bundle.ts'
import { msg, type CoreKey, type Msg } from './messages.ts'
import { entryRedirects, matchRedirect, type Redirect } from './redirects.ts'
import type { Fields, Json, Schema } from './types.ts'

export type LinkLevel = 'error' | 'warn' | 'off'
export interface LinkConfig { broken?: LinkLevel; anchors?: LinkLevel; /** A link to a path that redirects; default `warn`. */ redirected?: LinkLevel
  /** Opt-in check of `http(s)://` links over the network (build and `ginko check`, never dev); default off. See `src/nuxt/external-links.ts`. */
  external?: LinkLevel
}
export interface LinkIssue {
  severity: 'error' | 'warn'
  locale: string
  brick: string
  id: string
  field: string
  href: string
  /** Catalog key (`links.linkBroken`) and parameters: `coreMessage(locale, key, params)`. */
  key: string
  params?: Msg['params']
  message: string
}
export interface CheckLinksOptions {
  /** True when `path` (e.g. `/media/menu.pdf`) is a file in the site's public files. Without it, unknown paths are not checked. */
  files?: (path: string) => boolean
  /** Severities; default: broken `error`, anchors and redirected `warn`. Callers pass the site's `linkCheck`. */
  linkCheck?: LinkConfig
  /** The site's redirect rules (config); entry rules (`redirectFrom`) are read from the bundles. */
  redirects?: Redirect[]
}

type LinkKey = CoreKey extends infer K ? (K extends `links.${infer N}` ? N : never) : never
type Tree = { nodes: Json[]; toc?: unknown; summary?: Json[] }
type Pages = Pick<Schema, 'pages' | 'bricks'>
type Node = [string, Record<string, Json>, ...Json[]]

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const isTree = (v: unknown): v is Tree => isRecord(v) && Array.isArray(v.nodes)
const isNode = (n: unknown): n is Node => Array.isArray(n) && typeof n[0] === 'string' && isRecord(n[1])

/** Calls `fn` for every Markdown tree of the bundle (also in list rows) with where it is; its result replaces the tree. */
function mapTrees(bundle: Bundle, fn: (tree: Tree, at: { brick: string; id: string; field: string }) => Tree): Bundle {
  const walk = (value: unknown, at: { brick: string; id: string }, field: string): unknown => {
    if (isTree(value)) return fn(value, { ...at, field })
    if (Array.isArray(value)) return value.map((v, i) => walk(v, at, `${field}.${i}`))
    if (isRecord(value)) return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, walk(v, at, field ? `${field}.${k}` : k)]))
    return value
  }
  const data = (d: Record<string, unknown>, brick: string, id: string) => walk(d, { brick, id }, '') as Record<string, unknown>
  const bricks = Object.fromEntries(Object.entries(bundle.bricks).map(([key, b]) => [key, b.kind === 'single'
    ? { ...b, data: data(b.data, key, key) }
    : { ...b, items: b.items.map((item) => ({ ...item, data: data(item.data, key, item.id) })) }]))
  return { ...bundle, bricks }
}

function find(bundle: Bundle, brick: string, ref: string): BundleItem | undefined {
  const b = Object.hasOwn(bundle.bricks, brick) ? bundle.bricks[brick] : undefined
  if (b?.kind !== 'collection') return undefined
  return b.items.find((i) => i.id === `${brick}/${ref}` || i.id === ref || i.data.slug === ref)
}

/** The path a `$…` link points to in the bundle's locale, or undefined. `ref` has no `$` and no `#anchor`. */
function routeTarget(bundle: Bundle, schema: Pages, ref: string): string | undefined {
  const dot = ref.indexOf('.')
  if (dot < 1) return undefined
  const head = ref.slice(0, dot)
  const rest = ref.slice(dot + 1)
  if (head === 'page') return Object.hasOwn(schema.pages, rest) ? schema.pages[rest]![bundle.locale] : undefined
  // An entry listed in this locale without its own page there (`untranslated: 'fallback'`) links to its main-language page.
  const urls = find(bundle, head, rest)?.urls
  return urls?.[bundle.locale] ?? urls?.[bundle.mainLocale]
}

/**
 * The bundle with `$…` links turned into paths and `::snippet` components replaced by their text.
 * `$page.<key>` is a page of `schema.pages`; `$<brick>.<slug-or-id>` is an entry's URL; a `#anchor` is kept.
 * What cannot be resolved stays as it is and gets `data-broken: true`. A snippet is the `body` of the entry
 * `snippets/<name>` of the collection `snippets`; a snippet inside a snippet stays as it is. No mutation.
 */
export function resolveRouteLinks(bundle: Bundle, schema: Pages): Bundle {
  const hasSnippets = Object.hasOwn(schema.bricks, 'snippets') && schema.bricks.snippets!.kind === 'collection'
  const snippetNodes = (name: string): Json[] | undefined => {
    const body = hasSnippets ? find(bundle, 'snippets', name)?.data.body : undefined
    return isTree(body) ? body.nodes : undefined
  }
  const resolve = (nodes: Json[], nested: boolean): Json[] => nodes.flatMap((node): Json[] => {
    if (!isNode(node)) return [node]
    const [tag, props, ...children] = node
    if (tag === 'snippet' && !nested) {
      const inner = typeof props.name === 'string' ? snippetNodes(props.name) : undefined
      return inner ? resolve(inner, true) : [[tag, { ...props, 'data-broken': true }, ...children] as Json]
    }
    let next = props
    const href = props.href
    if (tag === 'a' && typeof href === 'string' && href.startsWith('$')) {
      const hash = href.indexOf('#')
      const target = routeTarget(bundle, schema, hash === -1 ? href.slice(1) : href.slice(1, hash))
      next = target === undefined ? { ...props, 'data-broken': true } : { ...props, href: target + (hash === -1 ? '' : href.slice(hash)) }
    }
    return [[tag, next, ...resolve(children, nested)] as Json]
  })
  return mapTrees(bundle, (tree) => ({
    ...tree,
    nodes: resolve(tree.nodes, false),
    ...(tree.summary ? { summary: resolve(tree.summary, false) } : {}),
  }))
}

function eachNode(nodes: readonly Json[], fn: (node: Node) => void) {
  for (const node of nodes) if (isNode(node)) { fn(node); eachNode(node.slice(2), fn) }
}

const normal = (path: string) => (path.length > 1 && path.endsWith('/') ? path.slice(0, -1) : path)

/**
 * Link check over bundles (one per locale) before any HTML exists. Errors: route links and snippets that
 * `resolveRouteLinks` could not resolve, and `/…` paths that match no entry URL, no page and no public file.
 * Warnings: a `#anchor` whose target text has no heading with that id. External links are not checked here (no network in core): see `externalLinks`.
 */
export function checkLinks(bundles: Bundle[], schema: Pages, options: CheckLinksOptions = {}): LinkIssue[] {
  const config = options.linkCheck ?? {}
  const levels = { broken: config.broken ?? 'error', anchors: config.anchors ?? 'warn', redirected: config.redirected ?? 'warn' }
  const rules = [...(options.redirects ?? []), ...bundles.flatMap(entryRedirects)]
  const known = new Set<string>()
  const trees = new Map<string, Tree[]>() // path -> the texts of the entry served there
  for (const bundle of bundles) {
    for (const pages of Object.values(schema.pages)) { const p = pages[bundle.locale]; if (p) known.add(normal(p)) }
    for (const b of Object.values(bundle.bricks)) {
      if (b.kind !== 'collection') continue
      for (const item of b.items) {
        const url = item.urls?.[bundle.locale]
        if (!url) continue
        known.add(normal(url))
        const own: Tree[] = []
        mapTrees({ ...bundle, bricks: { x: { kind: 'single', data: item.data, fallback: [] } } }, (t) => { own.push(t); return t })
        trees.set(normal(url), own)
      }
    }
  }
  const hasId = (list: Tree[], id: string) => list.some((t) => {
    let found = false
    eachNode(t.nodes, (n) => { if (/^h[1-6]$/.test(n[0]) && n[1].id === id) found = true })
    return found
  })
  const issues: LinkIssue[] = []
  for (const bundle of bundles) {
    mapTrees(bundle, (tree, at) => {
      const add = (severity: LinkIssue['severity'], href: string, key: LinkKey, params: Msg['params']) => issues.push({ severity, locale: bundle.locale, brick: at.brick, id: at.id, field: at.field, href, ...msg(`links.${key}`, params) })
      const broken = (href: string, key: LinkKey, params: Msg['params']) => { if (levels.broken !== 'off') add(levels.broken, href, key, params) }
      eachNode([...tree.nodes, ...(tree.summary ?? [])], (node) => {
        const [tag, props] = node
        if (tag === 'snippet' && props['data-broken']) return broken(`snippet:${String(props.name)}`, 'snippetMissing', { name: String(props.name) })
        const href = props.href
        if (tag !== 'a' || typeof href !== 'string') return
        if (props['data-broken']) {
          // A link to a brick of the schema that this bundle does not carry (a platform brick in a file bundle) cannot be judged here.
          const head = href.slice(1).split('.')[0]!
          if (href.startsWith('$') && head !== 'page' && Object.hasOwn(schema.bricks, head) && !Object.hasOwn(bundle.bricks, head)) return
          return broken(href, 'linkBroken', { href })
        }
        const hash = href.indexOf('#')
        const path = hash === -1 ? href : href.slice(0, hash)
        const anchor = hash === -1 ? '' : href.slice(hash + 1)
        let target: Tree[] | undefined
        if (path === '') target = [tree]
        else if (path.startsWith('/') && !path.startsWith('//')) {
          const clean = normal(path.split('?')[0]!)
          const moved = levels.redirected === 'off' ? undefined : matchRedirect(rules, clean)
          if (moved) { add(levels.redirected as 'error' | 'warn', href, 'linkRedirected', { href, to: moved.to }); return }
          if (!known.has(clean)) {
            if (options.files && !options.files(clean)) broken(href, 'pathUnknown', { path: clean })
            return
          }
          target = trees.get(clean)
        } else return
        if (anchor && levels.anchors !== 'off' && target && !hasId(target, anchor)) add(levels.anchors, href, 'anchorMissing', { anchor })
      })
      return tree
    })
  }
  return issues
}

export interface ExternalLink { href: string; locale: string; brick: string; id: string; field: string }

/** Every `http://` and `https://` link in the Markdown fields of the bundles, with where it is. Pure: the network check lives in `src/nuxt/external-links.ts`. */
export function externalLinks(bundles: Bundle[]): ExternalLink[] {
  const out: ExternalLink[] = []
  for (const bundle of bundles) {
    mapTrees(bundle, (tree, at) => {
      eachNode([...tree.nodes, ...(tree.summary ?? [])], ([tag, props]) => {
        const href = props.href
        if (tag === 'a' && typeof href === 'string' && /^https?:\/\//.test(href)) out.push({ href, locale: bundle.locale, ...at })
      })
      return tree
    })
  }
  return out
}

const MD_INLINE = /\]\(\s*<?([^)\s>]+)/g
const MD_DEFINITION = /^[ \t]{0,3}\[[^\]]+\]:[ \t]*<?(\S+?)>?(?:[ \t]+.*)?$/gm
const MD_SNIPPET = /::snippet\{[^}]*\bname="([^"]*)"/g

/**
 * The link targets written in the Markdown fields of one entry's data, in all languages and list rows:
 * inline links and link definitions as written (`$page.menu#top`, `/menu`, `https://…`) and snippets as
 * `snippet:<name>` (the `href` of their `checkLinks` issues). Works on the stored text, before any parsing,
 * so a save can tell cheaply whether it adds a target at all.
 */
export function linkTargets(fields: Fields, data: Record<string, Json>): Set<string> {
  const out = new Set<string>()
  const text = (value: Json | undefined) => {
    for (const markdown of typeof value === 'string' ? [value] : isRecord(value) ? Object.values(value) : []) {
      if (typeof markdown !== 'string') continue
      for (const m of markdown.matchAll(MD_INLINE)) out.add(m[1]!)
      for (const m of markdown.matchAll(MD_DEFINITION)) out.add(m[1]!)
      for (const m of markdown.matchAll(MD_SNIPPET)) out.add(`snippet:${m[1]!}`)
    }
  }
  const walk = (inner: Fields, row: Record<string, Json>) => {
    for (const [name, field] of Object.entries(inner)) {
      const value = row[name]
      if (field.type === 'markdown') text(value)
      else if (field.type === 'list' && Array.isArray(value)) for (const r of value) if (isRecord(r)) walk(field.of, r as Record<string, Json>)
    }
  }
  walk(fields, data)
  return out
}
