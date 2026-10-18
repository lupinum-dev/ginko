// The blog and changelog bricks come from @lupinum/ginko/basics. A docs site stores their schema on the platform, so a
// change in basics (a label, a field, an option, the key order) must not reach it unnoticed: the three bricks of the
// docs site serialize to the bytes they had before basics existed (0.4.0), plus the one reviewed change: `drafts: true`
// on the changelog (an allowed release diff).
import { createHash } from 'node:crypto'
import { expect, it } from 'vitest'
import { serializeSchema } from '@lupinum/ginko/internal'
import docsSite from '../../../sites/docs/ginko.config.ts'
import { changelogPages, homePages } from '../src/config.ts'

it('keeps the stored schema of the blog and changelog bricks byte for byte', () => {
  const { bricks } = serializeSchema(docsSite)
  const json = JSON.stringify([bricks.posts, bricks.authors, bricks.changelog])
  expect(createHash('sha256').update(json).digest('hex')).toBe('c63de4848d8b29d3c3ed9cc64ef9bce93fdf0b31c3dd77ee1e2b9c8e109ab3e3')
})

// Wrong behaviour caught: the start page of another locale at `/de/`, an address ginko-i18n redirects, so `$page.home`,
// the sitemap and hreflang pointed at a redirect.
it('gives each locale its start page at its canonical address', () => {
  expect(homePages({ locales: ['en', 'de'] })).toEqual({ en: '/', de: '/de' })
  expect(changelogPages({ locales: ['de', 'en'] })).toEqual({ de: '/changelog', en: '/en/changelog' })
})
