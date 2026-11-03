import { describe, expect, it } from 'vitest'
import restaurant from '../../../../sites/restaurant/ginko.config.ts'
import { checkSchema, diffSchema, frameFit, resolveEntry, serializeSchema, type Schema } from '../../src/core/index.ts'

// Image frames (`f.image(…, { aspect })`): the release must accept them on configs that had none, the bundle must carry
// them to `<GinkoImage>`, and a typo must fail the check instead of leaving every photo uncropped.

const base = (): Schema => structuredClone(serializeSchema(restaurant))
const eventImage = (s: Schema) => s.bricks.events!.fields.image as unknown as Record<string, unknown>

describe('aspect in the schema check', () => {
  it.each([
    ['one ratio', '3:4'],
    ['a decimal ratio', '1.91:1'],
    ['named frames', { card: '3:2', header: '21:9', share: '1.91:1' }],
  ])('accepts %s', (_name, aspect) => {
    const s = base()
    eventImage(s).aspect = aspect
    expect(checkSchema(s)).toEqual([])
  })

  it.each([
    ['a slash instead of a colon', '3/2', 'events.image.aspect: “3/2” is no frame'],
    ['a zero side', '0:1', 'events.image.aspect: “0:1” is no frame'],
    ['a shape past 10:1', '21:1', 'events.image.aspect: “21:1” is no frame'],
    ['no frames at all', {}, 'events.image.aspect: 1 to 8 frames.'],
    ['a bad ratio among named frames', { card: '3x2' }, 'events.image.aspect.card: “3x2” is no frame'],
    ['the reserved name original', { original: '1:1' }, 'events.image.aspect: “original” is no frame name'],
    ['a list instead of names', ['3:2'], 'events.image.aspect: write one ratio'],
  ])('rejects %s', (_name, aspect, problem) => {
    const s = base()
    eventImage(s).aspect = aspect
    expect(checkSchema(s).join('\n')).toContain(problem)
  })

  it('rejects aspect on a field that is no image', () => {
    const s = base()
    ;(s.bricks.seo!.fields.title as unknown as Record<string, unknown>).aspect = '3:2'
    expect(checkSchema(s)).toContain('seo.title.aspect: only image fields have a frame.')
  })
})

describe('aspect in the release diff', () => {
  // An old production schema has no aspect; a frame comes, changes or goes without touching a stored value.
  it.each([
    ['added to a field that had none', undefined, '3:2'],
    ['changed', '3:2', { card: '3:2', header: '21:9' }],
    ['removed', '3:2', undefined],
  ])('allows a frame %s', (_name, before, after) => {
    const prod = base()
    if (before !== undefined) eventImage(prod).aspect = before
    const next = structuredClone(prod)
    if (after === undefined) delete eventImage(next).aspect
    else eventImage(next).aspect = after
    const { rejected, changes } = diffSchema(prod, next)
    expect(rejected).toEqual([])
    expect(changes.map((c) => c.kind)).toContain('aspect')
  })
})

describe('aspect in the bundle', () => {
  const resolved = (aspect?: unknown) => {
    const s = base()
    if (aspect !== undefined) eventImage(s).aspect = aspect
    return resolveEntry(s, 'events', {
      id: 'e1', data: { title: { de: 'Fest' }, when: { from: '2026-11-01', to: '2026-11-02' }, description: { de: 'x' }, image: { file: 'f1', alt: { de: 'Foto' } } },
    }, { locale: 'de', files: () => ({ url: 'https://x/f1.jpg', name: 'f1.jpg', size: 1, width: 1600, height: 1200, focus: { x: 0.2, y: 0.3 } }) }).data.image
  }

  it('carries the field’s frames next to the focus point, so the site crops as the Studio shows', () => {
    expect(resolved({ card: '3:2', header: '21:9' })).toEqual({
      url: 'https://x/f1.jpg', alt: 'Foto', width: 1600, height: 1200, focus: { x: 0.2, y: 0.3 }, aspect: { card: '3:2', header: '21:9' },
    })
  })

  it('leaves aspect out for a field without frames (an older config)', () => {
    expect(resolved()).not.toHaveProperty('aspect')
  })
})

describe('frameFit: what the Studio warns about', () => {
  it.each([
    ['a large landscape photo in a 3:2 frame', 3000, 2000, 1.5, { width: 3000, height: 2000, kept: 1, turned: false, small: false }],
    ['a landscape photo in an upright 3:4 frame', 1600, 1200, 0.75, { width: 900, height: 1200, kept: 0.5625, turned: true, small: false }],
    ['a small photo in a wide frame', 1000, 800, 21 / 9, { width: 1000, height: 429, kept: 0.5357142857142857, turned: false, small: true }],
    ['a square frame turns no photo', 1200, 1600, 1, { width: 1200, height: 1200, kept: 0.75, turned: false, small: false }],
  ])('%s', (_name, width, height, ratio, fit) => {
    expect(frameFit(width, height, ratio)).toEqual(fit)
  })

  it('says nothing while the size is unknown', () => {
    expect(frameFit(0, 0, 1.5)).toBeUndefined()
  })
})
