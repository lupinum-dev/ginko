import type { MarkdownValue } from '@lupinum/ginko'
import { releaseAnchor } from '@lupinum/ginko/basics'

/** A release as the changelog shows it. */
export interface Release {
  id: string
  version: string
  /** `YYYY-MM-DD`. */
  date: string
  /** The id of its section on the changelog page (`v4-6-0`). */
  anchor: string
  body: MarkdownValue
}

/** The releases of the `changelog` brick (basics `changelog()`) in the current language, newest first. */
export function useReleases() {
  const changelog = useGinko('changelog')
  return computed<Release[]>(() => changelog.value.items.map((entry) => ({
    id: entry.id,
    version: entry.data.version,
    date: entry.data.date,
    anchor: releaseAnchor(entry.data.version),
    body: entry.data.body,
  })))
}

/** A release with its summary: the text before the `<!-- more -->` line of its body ('' without that line). */
export interface ReleaseSummary extends Omit<Release, 'body'> {
  summary: string
  /** Its section on the changelog page. */
  to: string
}

/**
 * The newest releases with their summaries, for a section of another page (the home page). The texts are read once
 * on the server; the page carries only the short summaries.
 */
export async function useLatestReleases(count: number) {
  const releases = useReleases()
  const locale = useGinkoLocale()
  const path = useGinkoPath()
  const { data } = await useAsyncData(() => `changelog-latest-${locale.value}-${count}`, () => Promise.all(releases.value.slice(0, count).map(async ({ body, ...release }) => {
    const tree = await fetchGinkoMarkdown(body)
    return { ...release, summary: releaseSummary(tree), to: `${path('changelog')}#${release.anchor}` }
  })))
  return computed<ReleaseSummary[]>(() => data.value ?? [])
}

/** The path of the changelog feed of the current language: `<changelog page>/rss.xml`. */
export function useChangelogFeedPath() {
  const path = useGinkoPath()
  return computed(() => `${path('changelog')}/rss.xml`)
}
