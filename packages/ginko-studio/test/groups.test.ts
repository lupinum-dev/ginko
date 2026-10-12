import { describe, expect, it } from 'vitest'
import { f } from '@lupinum/ginko'
import { groupFields } from '../app/utils/groups.ts'

describe('groupFields', () => {
  const fields = {
    title: f.text('Titel'),
    metaTitle: f.text('SEO-Titel', { group: 'SEO' }),
    body: f.longtext('Text'),
    ogImage: f.image('Bild', { group: { de: 'SEO', en: 'SEO' } }),
    price: f.text('Preis', { group: 'Preis' }),
    metaText: f.text('SEO-Text', { group: 'SEO' }),
  }

  it('puts ungrouped fields first and orders groups by their first field', () => {
    const { ungrouped, groups } = groupFields(fields)
    expect(ungrouped.map(([k]) => k)).toEqual(['title', 'body'])
    expect(groups.map((g) => [g.label, g.fields.map(([k]) => k)])).toEqual([
      ['SEO', ['metaTitle', 'metaText']],
      [{ de: 'SEO', en: 'SEO' }, ['ogImage']],
      ['Preis', ['price']],
    ])
  })

  it('drops a group whose fields were filtered out', () => {
    const { metaTitle: _a, metaText: _b, ...rest } = fields
    expect(groupFields(rest).groups.map((g) => g.label)).toEqual([{ de: 'SEO', en: 'SEO' }, 'Preis'])
    expect(groupFields({}).groups).toEqual([])
  })
})
