// @vitest-environment happy-dom
// "Why not on the website?": a draft says so in the reader's language and offers Publish…. The translator is
// ginko-i18n's real one with the Studio and server catalogs; only the Convex query is replaced.
import { flushPromises, mount } from '@vue/test-utils'
import { computed, ref } from 'vue'
import { describe, expect, test, vi } from 'vitest'
import WhyNotPublic from '../app/components/WhyNotPublic.vue'

const mocks = vi.hoisted(() => ({
  language: { value: 'en' as 'en' | 'de' },
  reasons: [{
    code: 'draft', blocking: true, action: 'publish',
    msg: { key: 'publicness.draft' },
    // Stored with the row; the reader sees the catalog text, so this one must never show.
    sentence: 'stored sentence',
  }],
}))
vi.mock('#imports', async (original) => {
  const { createFormatters, createTranslator } = await import('@lupinum/ginko-i18n/core')
  const { compileCatalogs } = await import('@lupinum/ginko-i18n/compile')
  const catalogs = compileCatalogs({
    de: { ...(await import('../i18n/de.json')).default, server: (await import('../../ginko-server/i18n/de.json')).default },
    en: { ...(await import('../i18n/en.json')).default, server: (await import('../../ginko-server/i18n/en.json')).default },
  })
  return {
    ...(await original<Record<string, unknown>>()),
    useI18n: () => {
      const language = mocks.language.value
      return {
        locale: ref(language),
        t: createTranslator({ messages: catalogs[language], fallback: catalogs.de, language, timeZone: 'Europe/Vienna' }).t,
        format: createFormatters(language, { timeZone: 'Europe/Vienna' }),
      }
    },
    useConvexQuery: () => ({ data: computed(() => ({ locale: 'de', public: false, reasons: mocks.reasons })), error: ref(undefined) }),
  }
})

const mountReasons = () => mount(WhyNotPublic, { props: { site: 's', entry: 'e1', locale: 'de', timeZone: 'Europe/Vienna', main: 'de' } })

describe('WhyNotPublic', () => {
  test.each([
    ['en', 'The entry is a draft. Drafts are not on the website.', 'Publish…'],
    ['de', 'Der Eintrag ist ein Entwurf. Entwürfe sind nicht auf der Website.', 'Veröffentlichen …'],
  ] as const)('a draft in %s: the sentence in the UI language and the publish action', async (language, sentence, button) => {
    mocks.language.value = language
    const wrapper = mountReasons()
    await flushPromises()
    expect(wrapper.get('li p').text()).toBe(sentence)
    const publish = wrapper.get('button')
    expect(publish.text()).toBe(button)
    await publish.trigger('click')
    expect(wrapper.emitted('publish')).toHaveLength(1)
  })
})
