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

/** Links that open a chat with a prompt pointing at the page's Markdown. */
export function docsAskLinks(prompt: string): { chatGpt: string, claude: string } {
  const q = encodeURIComponent(prompt)
  return { chatGpt: `https://chatgpt.com/?q=${q}`, claude: `https://claude.ai/new?q=${q}` }
}
