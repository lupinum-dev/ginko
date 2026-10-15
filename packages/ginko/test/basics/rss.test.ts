import { describe, expect, it } from 'vitest'
import { rssXml } from '@lupinum/ginko/basics'

const feed = {
  title: 'A & B <Blog>', link: 'https://x.test/blog', self: 'https://x.test/blog/rss.xml', description: 'd', language: 'de',
  items: [
    { title: 'Q&A "live"', link: 'https://x.test/blog/a?x=1&y=2', description: '</description><evil/>', date: '2026-10-10', authors: ['Ann <ann@x.test>'] },
    { title: 'Newer', link: 'https://x.test/blog/b', date: '2026-10-11', authors: [] },
  ],
}

describe('rssXml', () => {
  const xml = rssXml(feed)

  it('escapes text so no content can break out of its element', () => {
    expect(xml).toContain('<title>A &amp; B &lt;Blog&gt;</title>')
    expect(xml).toContain('<link>https://x.test/blog/a?x=1&amp;y=2</link>')
    expect(xml).toContain('<description>&lt;/description&gt;&lt;evil/&gt;</description>')
    expect(xml).not.toContain('<evil/>')
  })

  it('writes RFC 822 dates and the newest day as lastBuildDate', () => {
    expect(xml).toContain('<pubDate>Sat, 10 Oct 2026 00:00:00 GMT</pubDate>')
    expect(xml).toContain('<lastBuildDate>Sun, 11 Oct 2026 00:00:00 GMT</lastBuildDate>')
  })

  it('leaves out description and creator when an item has none', () => {
    const second = xml.split('<item>')[2]!
    expect(second).not.toContain('<description>')
    expect(second).not.toContain('dc:creator')
  })
})
