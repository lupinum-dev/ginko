// Small pure helpers of the docs page (edit link, Markdown twin, "open in" links), kept apart for tests.

/** Edit link of a page's file. Template placeholders: `{url}`, `{branch}`, `{source}`; default is the GitHub form. */
export function docsEditUrl(repo: { url: string, branch?: string, editUrl?: string } | undefined, source: string | undefined): string | undefined {
  if (!repo?.url || !source) return undefined
  const values: Record<string, string> = { url: repo.url.replace(/\/+$/, ''), branch: repo.branch ?? 'main', source }
  return (repo.editUrl ?? '{url}/edit/{branch}/{source}').replace(/\{(url|branch|source)\}/g, (_, k: string) => values[k]!)
}

/**
 * Edit link of a page stored on the Ginko platform: its form in the Studio, `<platform>/s/<site>/all/<brick>/<id>`.
 * No platform address (a production build without NUXT_PUBLIC_GINKO_PLATFORM): no link.
 */
export function docsStudioUrl(platform: string | undefined, site: string, brick: string, id: string): string | undefined {
  if (!platform) return undefined
  return `${platform.replace(/\/+$/, '')}/s/${[site, 'all', brick, id].map(encodeURIComponent).join('/')}`
}

/**
 * "Edit this page" of a docs page. A page from a file links to its repository file; a page stored on the platform
 * links to the Studio only when the site opts in (`studioEditLink`), since visitors of a public site have no use for it.
 */
export function docsPageEditUrl(doc: { id: string, source?: string }, options: { repository?: Parameters<typeof docsEditUrl>[0], studioEditLink?: boolean, platform?: string, site: string, brick: string }): string | undefined {
  if (doc.source) return docsEditUrl(options.repository, doc.source)
  return options.studioEditLink ? docsStudioUrl(options.platform, options.site, options.brick, doc.id) : undefined
}

/**
 * "Report an issue" for a page. Placeholders: `{url}`, `{title}`, `{page}` (the page's address), URL-encoded except
 * `{url}`. GitHub repositories get the GitHub form by default; other hosts need `issueUrl`.
 */
export function docsIssueUrl(repo: { url: string, issueUrl?: string } | undefined, title: string, page: string): string | undefined {
  if (!repo?.url) return undefined
  const url = repo.url.replace(/\/+$/, '')
  const template = repo.issueUrl ?? (/^https:\/\/github\.com\//.test(url) ? '{url}/issues/new?title={title}&body={page}' : undefined)
  const values: Record<string, string> = { url, title: encodeURIComponent(title), page: encodeURIComponent(page) }
  return template?.replace(/\{(url|title|page)\}/g, (_, k: string) => values[k]!)
}

/** Path of a page's Markdown twin (`/en/docs/x` -> `/en/docs/x.md`, `/` -> `/index.md`). */
export function docsMarkdownPath(path: string): string {
  const clean = path.replace(/\/+$/, '')
  return `${clean || '/index'}.md`
}

/** A chat the page menu can open the page in (`markdownActions.openIn`). */
export type DocsAssistant = 'chatgpt' | 'claude'

/** Links that open a chat with a prompt pointing at the page's Markdown. */
export function docsAskLinks(prompt: string): Record<DocsAssistant, string> {
  const q = encodeURIComponent(prompt)
  return { chatgpt: `https://chatgpt.com/?q=${q}`, claude: `https://claude.ai/new?q=${q}` }
}

/**
 * The main-language address of the docs page `ref`, from the brick's route (`/docs/[slug]`). For a page the current
 * language lacks: the reader's bundle does not hold it, so this is how its link still leads to the main-language page,
 * as in Markdown (core's `routeTarget`). Undefined when the route has no `[slug]`. Without the main-language entries
 * this takes `ref` as the main-language slug: right for links by file name while the main file keeps the slug made
 * from it; a main file with its own `slug:` or a typo gives a 404 here, where core would report the link.
 */
export function docsMainPath(route: Partial<Record<string, string>> | undefined, mainLocale: string, ref: string): string | undefined {
  const pattern = route?.[mainLocale]
  return pattern?.includes('[slug]') ? pattern.replace('[slug]', ref) : undefined
}

/**
 * A route link outside Markdown (the start page's links and cards, `nav`, `footer.links`, `banner.href`):
 * `$<brick>.<page>` names a docs page by its file name or slug (`$docs.webhooks`, or `$wissen.kosten` when the docs brick
 * is `wissen`), `$page.<key>` a page of `pages` in ginko.config.ts; an
 * `#anchor` is kept. The same notation as in Markdown, so the link follows the reader's language and survives a
 * changed slug. Undefined when `raw` is no route link or names nothing.
 */
export function docsRouteLink(raw: string, find: { doc: (ref: string) => string | undefined, page: (key: string) => string | undefined }, brick = 'docs'): string | undefined {
  const match = /^\$([^.#]+)\.([^#]+)(#.*)?$/.exec(raw)
  if (!match || (match[1] !== brick && match[1] !== 'page')) return undefined
  const path = match[1] === 'page' ? find.page(match[2]!) : find.doc(match[2]!)
  return path === undefined ? undefined : path + (match[3] ?? '')
}

/**
 * The main-language address for a docs address in another language (`/de/docs/x` gives `/docs/x`), or undefined when
 * `path` is not under a non-main locale prefix and the main docs base. `resolve` turns the stripped path into the
 * main language's real address (the site's i18n strategy decides whether it carries a prefix). A guess: the slug may be German and then
 * 404 again, like `docsMainPath`; the bundle holds no main-language data to check it.
 */
export function docsMainLanguagePath(path: string, locales: readonly string[], mainLocale: string, mainBase: string, resolve: (path: string) => string = (p) => p): string | undefined {
  for (const code of locales) {
    if (code === mainLocale || !path.startsWith(`/${code}/`)) continue
    const rest = path.slice(code.length + 1)
    return rest.startsWith(`${mainBase}/`) ? resolve(rest) : undefined
  }
  return undefined
}
