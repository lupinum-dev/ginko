// The publish panel asks about the entry as typed, also before its first save. Texts come from the real
// Studio catalog (German) through the `#imports` shim.
import { collection, f } from '@lupinum/ginko'
import { describe, expect, it } from 'vitest'
import { useI18n } from '#imports'
import { publishQuestion } from '../app/utils/content.ts'

const blog = collection({ label: 'Blog', drafts: true, max: 50, order: 'manual', fields: { title: f.text('Titel'), body: f.longtext('Text', { optional: true }) } })

describe('publishQuestion', () => {
  // Wrong behaviour caught: a new draft with a typed title is asked about as "Neuer Eintrag", an empty one as "Blog".
  it.each([
    [{ title: { de: 'Herbstfest' } }, 'Wann soll „Herbstfest“ online gehen?'],
    [{}, 'Wann soll der Eintrag online gehen?'],
  ])('a never saved draft %j', (data, question) => {
    expect(publishQuestion(blog, data, 'de', useI18n().t)).toBe(question)
  })
})
