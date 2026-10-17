import type { MarkdownTree, MarkdownValue } from '@lupinum/ginko'
import { releaseAnchor, rssXml } from '@lupinum/ginko/basics'
import { defineEventHandler, getRequestURL, useRuntimeConfig } from 'nuxt/server'
import site from '../../ginko.config'
import { releaseSummary } from '~~/app/utils/changelog'

// The changelog feed of each language (RSS 2.0) at <changelog page>/rss.xml, for example /changelog/rss.xml.
// One item per release, newest first: the version as the title, the summary (the text before `<!-- more -->`) as the
// description, the release's date, and a link to its section of the changelog page.
export default defineEventHandler(async (event) => {
  const path = getRequestURL(event).pathname
  if (!path.endsWith('/rss.xml')) return
  const page = path.slice(0, -'/rss.xml'.length) || '/'
  // Only the changelog page's address comes from ginko.config.ts; name, address and languages come from the runtime
  // config, like the pages' canonical links, so the feed and the pages always name the same site address.
  const ginko = useRuntimeConfig().public.ginko
  const changelog: Partial<Record<string, string>> = site.pages.changelog
  const locale = ginko.locales.find((code) => changelog[code] === page)
  if (!locale) return
  const releases = await getGinkoItems(event, 'changelog', locale)
  const origin = ginko.url.replace(/\/$/, '')
  const { t, language } = getI18n({ context: { locale } }, 'changelog')
  // A text is its tree on the server; a reference (a long text of the platform) is loaded from the site.
  const summaryOf = async (body: MarkdownValue | undefined) => {
    if (!body) return ''
    const tree = 'nodes' in body ? body : await $fetch<MarkdownTree>(body.ref)
    return releaseSummary(tree)
  }
  const items = await Promise.all(releases.map(async (release) => {
    const version = String(release.data.version)
    const summary = await summaryOf(release.data.body as MarkdownValue | undefined)
    return {
      title: t('version', { version }),
      link: `${origin}${page}#${releaseAnchor(version)}`,
      description: summary || undefined,
      date: String(release.data.date),
      authors: [],
    }
  }))
  event.res.headers.set('content-type', 'application/rss+xml; charset=utf-8')
  return rssXml({
    title: `${ginko.name}: ${t('title')}`,
    link: `${origin}${page}`,
    self: `${origin}${path}`,
    description: t('lead', { name: ginko.name }),
    language,
    items,
  })
})
