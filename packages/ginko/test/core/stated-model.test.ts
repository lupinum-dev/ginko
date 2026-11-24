// The stored model states what Ginko once concluded from shape, order or name (design V2, section 3.2). Each test names
// the wrong behaviour it catches: the behaviour coming back from the shape instead of its key.
import { describe, expect, it } from 'vitest'
import restaurant from '../../../../sites/restaurant/ginko.config.ts'
import { checkSchema, diffSchema, serializeSchema, type Schema } from '../../src/core/index.ts'

const stored = (): Schema => structuredClone(serializeSchema(restaurant))

describe('format: the form of the stored model', () => {
  // Wrong: a platform takes a schema of another form and reads its keys as if they meant what they mean in its own,
  // or answers with a wall of problems that are not the real one.
  it.each([
    [undefined, 'The schema has no format number, so it was written by a Ginko older than this one. Update @lupinum/ginko in the site to the version of the platform (format 2) and release again.'],
    [1, 'The schema has format 1, and this Ginko reads format 2 only. Use the same version of Ginko in the site and on the platform.'],
    [3, 'The schema has format 3, and this Ginko reads format 2 only. Use the same version of Ginko in the site and on the platform.'],
  ])('refuses format %j with one sentence', (format, sentence) => {
    const schema = stored() as unknown as Record<string, unknown>
    if (format === undefined) delete schema.format
    else schema.format = format
    expect(checkSchema(schema)).toEqual([sentence])
  })

  // Wrong: a release moves a stored model of the old form to the new one without the platform's upgrade, so its
  // stored content is read with the rules of a form it was never written in.
  it('is never changed by a release', () => {
    const old = stored() as unknown as Record<string, unknown>
    delete old.format
    expect(diffSchema(old as unknown as Schema, stored()).rejected.map((r) => r.path)).toEqual(['format'])
  })
})
