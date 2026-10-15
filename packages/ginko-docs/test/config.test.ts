// The blog and changelog bricks come from @lupinum/ginko/basics. A docs site stores their schema on the platform, so a
// change in basics (a label, a field, an option, the key order) must not reach it unnoticed: the three bricks of the
// docs site serialize to the bytes they had before basics existed (0.4.0).
import { createHash } from 'node:crypto'
import { expect, it } from 'vitest'
import { serializeSchema } from '@lupinum/ginko/internal'
import docsSite from '../../../sites/docs/ginko.config.ts'

it('keeps the stored schema of the blog and changelog bricks byte for byte', () => {
  const { bricks } = serializeSchema(docsSite)
  const json = JSON.stringify([bricks.posts, bricks.authors, bricks.changelog])
  expect(createHash('sha256').update(json).digest('hex')).toBe('39c88347dc13394a0320caf8394bd54a9b3b66e717155e3e5503ce6109443e7a')
})
