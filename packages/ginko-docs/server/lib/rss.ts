// An RSS 2.0 document as a pure function, so it is unit tested without Nitro.

export interface FeedItem {
  title: string
  /** Absolute. */
  link: string
  description?: string
  /** `YYYY-MM-DD`. */
  date: string
  authors: string[]
}

export interface Feed {
  title: string
  /** Absolute address of the page the feed belongs to. */
  link: string
  /** Absolute address of the feed itself. */
  self: string
  description: string
  language: string
  items: FeedItem[]
}

const escapeXml = (value: string) => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;')
/** RFC 822 date (what RSS 2.0 asks for) for a day; the day counts as midnight UTC. */
const rfc822 = (day: string) => new Date(`${day}T00:00:00Z`).toUTCString()
const tag = (name: string, value: string) => `<${name}>${escapeXml(value)}</${name}>`

/** Title and description only, as plain text: the feed links to the page for the full post. */
export function rssXml(feed: Feed): string {
  const items = feed.items.map((item) => [
    '    <item>',
    `      ${tag('title', item.title)}`,
    `      ${tag('link', item.link)}`,
    `      <guid isPermaLink="true">${escapeXml(item.link)}</guid>`,
    `      ${tag('pubDate', rfc822(item.date))}`,
    ...(item.description ? [`      ${tag('description', item.description)}`] : []),
    ...item.authors.map((a) => `      ${tag('dc:creator', a)}`),
    '    </item>',
  ].join('\n'))
  const newest = feed.items.map((i) => i.date).sort().at(-1)
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:dc="http://purl.org/dc/elements/1.1/">',
    '  <channel>',
    `    ${tag('title', feed.title)}`,
    `    ${tag('link', feed.link)}`,
    `    ${tag('description', feed.description)}`,
    `    ${tag('language', feed.language)}`,
    ...(newest ? [`    ${tag('lastBuildDate', rfc822(newest))}`] : []),
    `    <atom:link href="${escapeXml(feed.self)}" rel="self" type="application/rss+xml"/>`,
    ...items,
    '  </channel>',
    '</rss>',
    '',
  ].join('\n')
}
