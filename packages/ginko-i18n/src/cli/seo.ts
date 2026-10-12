import { readFileSync, existsSync } from 'node:fs'
import { resolve, relative } from 'node:path'
import { files, type Manifest } from './data.ts'
import type { Finding } from './commands.ts'

function attrs(tag: string) {
  return Object.fromEntries([...tag.matchAll(/([\w-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g)].map(m => [m[1]!.toLowerCase(), (m[2] ?? m[3] ?? m[4] ?? '').replace(/&amp;/g, '&')]))
}
function path(url: string) {
  if (!url)
    return ''
  try {
    return decodeURIComponent(new URL(url, 'https://placeholder.test').pathname).replace(/\/$/, '') || '/'
  }
  catch { return '' }
}
function absolute(url: string) {
  try {
    return ['https:', 'http:'].includes(new URL(url).protocol)
  }
  catch { return false }
}
export function seo(site: string, manifest: Manifest): Finding[] {
  if (!existsSync(site)) throw new Error(`Site directory missing: ${site}`)
  const findings: Finding[] = []
  const pages = files(site, ['.html']).filter(file => !['200.html', '404.html'].includes(relative(site, file).split(/[\\/]/).at(-1)!)).flatMap((file) => {
    const text = readFileSync(file, 'utf8')
    const metas = [...text.matchAll(/<meta\b[^>]*>/gi)].map(m => attrs(m[0]))
    if (metas.some(a => a.name?.toLowerCase() === 'robots' && a.content?.toLowerCase().split(/[\s,]+/).includes('noindex'))) return []
    const links = [...text.matchAll(/<link\b[^>]*>/gi)].map(m => attrs(m[0]))
    return [{ file, canonical: links.filter(a => a.rel?.toLowerCase() === 'canonical'), alternates: links.filter(a => a.rel?.toLowerCase() === 'alternate' && a.hreflang), lang: attrs(text.match(/<html\b[^>]*>/i)?.[0] ?? '').lang }]
  })
  for (const page of pages) {
    const add = (code: string, message: string) => findings.push({ code, severity: 'error', file: page.file, message })
    const canonical = page.canonical[0]?.href ?? ''
    if (page.canonical.length !== 1 || !absolute(canonical)) add('seo-canonical', 'Expected exactly one absolute canonical URL')
    if (!manifest.locales.some(l => l.language === page.lang)) add('seo-lang', `Unknown html lang: ${page.lang ?? '(missing)'}`)
    if (!canonical || !page.alternates.some(a => path(a.href ?? '') === path(canonical))) add('seo-hreflang-self', 'Alternates do not include this page')
    if (page.alternates.length) {
      if (!page.alternates.some(a => a.hreflang === 'x-default')) add('seo-x-default', 'Missing x-default alternate')
      for (const alternate of page.alternates) {
        const targetPath = path(alternate.href ?? '')
        const target = pages.find(p => path(p.canonical[0]?.href ?? '') === targetPath)
          ?? pages.find(p => [resolve(site, `.${targetPath === '/' ? '' : targetPath}/index.html`), resolve(site, `.${targetPath}.html`)].includes(p.file))
        if (!target?.alternates.some(a => canonical && path(a.href ?? '') === path(canonical))) add('seo-hreflang-reciprocal', `Alternate does not link back: ${alternate.href}`)
      }
    }
  }
  return findings
}
