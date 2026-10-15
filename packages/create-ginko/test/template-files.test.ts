import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { manifestOf, pruneLocales, sampleDates, shiftDates } from '../template-files.mjs'

const work = mkdtempSync(join(tmpdir(), 'create-ginko-files-'))
afterAll(() => rmSync(work, { recursive: true, force: true }))
let n = 0
/** A template folder with the given files. */
function folder(files: Record<string, string>) {
  const dir = join(work, String(n++))
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, path)), { recursive: true })
    writeFileSync(join(dir, path), text)
  }
  return dir
}
const tree = (dir: string) => readdirSync(dir, { recursive: true }).map(String).filter((p) => p.includes('.')).sort()
const read = (dir: string, path: string) => readFileSync(join(dir, path), 'utf8')

// A three-language template: English main, German and French translations, one data file without translations.
const trilingual = {
  'content/home.md': '---\ntitle: Home\n---\n',
  'content/home.de.md': '---\ntitle: Start\n---\n',
  'content/home.fr.md': '---\ntitle: Accueil\n---\n',
  'content/events/1.fair.md': '---\ntitle: Fair\n---\n',
  'content/events/1.fair.de.md': '---\ntitle: Messe\n---\n',
  'content/authors/ada.yml': 'name: Ada\n',
  'i18n/en.json': '{}', 'i18n/de.json': '{}', 'i18n/fr.json': '{}',
  'app/routes.ts': "export const locales = ['en', 'de', 'fr'] as const\nexport const slugs = {\n  events: {\n    en: 'events',\n    de: 'veranstaltungen',\n    fr: 'evenements',\n  },\n  about: { en: 'about', de: 'ueber-uns', fr: 'a-propos' },\n}\n",
  'ginko.config.ts': "export default defineSite({\n  site: 'x',\n  locales,\n  languages: { en: 'en-GB', de: 'de-AT', fr: 'fr-FR' },\n})\n",
}

describe('pruneLocales', () => {
  // Wrong behaviour caught: a dropped language's files stay (the build fails: "Language fr is not in the site's
  // locales"), the old main text stays the main file after a swap, or `languages` keeps a dropped locale (checkSite).
  it.each([
    {
      chosen: ['en'],
      files: ['app/routes.ts', 'content/authors/ada.yml', 'content/events/1.fair.md', 'content/home.md', 'ginko.config.ts', 'i18n/en.json'],
      main: { 'content/home.md': 'Home', 'content/events/1.fair.md': 'Fair' },
      routes: "export const locales = ['en'] as const\nexport const slugs = {\n  events: {\n    en: 'events',\n  },\n  about: { en: 'about' },\n}\n",
      languages: "languages: { en: 'en-GB' }",
    },
    {
      chosen: ['de', 'en'],
      files: ['app/routes.ts', 'content/authors/ada.yml', 'content/events/1.fair.en.md', 'content/events/1.fair.md', 'content/home.en.md', 'content/home.md', 'ginko.config.ts', 'i18n/de.json', 'i18n/en.json'],
      main: { 'content/home.md': 'Start', 'content/home.en.md': 'Home', 'content/events/1.fair.md': 'Messe', 'content/events/1.fair.en.md': 'Fair' },
      routes: "export const locales = ['de', 'en'] as const\nexport const slugs = {\n  events: {\n    en: 'events',\n    de: 'veranstaltungen',\n  },\n  about: { en: 'about', de: 'ueber-uns' },\n}\n",
      languages: "languages: { en: 'en-GB', de: 'de-AT' }",
    },
    {
      // French main without English: a file with no French translation keeps its English text as the main file.
      chosen: ['fr'],
      files: ['app/routes.ts', 'content/authors/ada.yml', 'content/events/1.fair.md', 'content/home.md', 'ginko.config.ts', 'i18n/fr.json'],
      main: { 'content/home.md': 'Accueil', 'content/events/1.fair.md': 'Fair' },
      routes: "export const locales = ['fr'] as const\nexport const slugs = {\n  events: {\n    fr: 'evenements',\n  },\n  about: { fr: 'a-propos' },\n}\n",
      languages: "languages: { fr: 'fr-FR' }",
    },
  ])('--locales $chosen', ({ chosen, files, main, routes, languages }) => {
    const dir = folder(trilingual)
    pruneLocales(dir, ['en', 'de', 'fr'], chosen)
    expect(tree(dir)).toEqual(files)
    for (const [path, title] of Object.entries(main)) expect(read(dir, path), path).toContain(`title: ${title}`)
    expect(read(dir, 'app/routes.ts')).toBe(routes)
    expect(read(dir, 'ginko.config.ts')).toContain(languages)
  })

  // Wrong behaviour caught: after a main-language swap the new main file lacks the language-independent fields
  // (the build fails: "Kind is missing", "set in the main-language file only"), or the old main page moves to the
  // translation's address.
  it('moves the fields only the main file has to the new main file, and keeps the old address', () => {
    const dir = folder({
      'app/routes.ts': "export const locales = ['en', 'de'] as const\n",
      'content/legal/1.privacy.md': '---\ntitle: Privacy\nlegalType: privacy\nupdatedAt: 2026-10-15\n---\n\nText\n',
      'content/legal/1.privacy.de.md': '---\ntitle: Datenschutz\nslug: datenschutz\n---\n\nText\n',
    })
    pruneLocales(dir, ['en', 'de'], ['de', 'en'])
    expect(read(dir, 'content/legal/1.privacy.md')).toBe('---\ntitle: Datenschutz\nslug: datenschutz\nlegalType: privacy\nupdatedAt: 2026-10-15\n---\n\nText\n')
    expect(read(dir, 'content/legal/1.privacy.en.md')).toBe('---\ntitle: Privacy\nslug: privacy\n---\n\nText\n')
    // German only: the English file goes, its date stays with the German text.
    const only = folder({ 'app/routes.ts': "export const locales = ['en', 'de'] as const\n", 'content/notices/1.a.md': '---\ntext: Hi\nuntil: 2027-01-29\n---\n', 'content/notices/1.a.de.md': '---\ntext: Hallo\n---\n' })
    pruneLocales(only, ['en', 'de'], ['de'])
    expect(tree(join(only, 'content'))).toEqual(['notices/1.a.md'])
    expect(read(only, 'content/notices/1.a.md')).toBe('---\ntext: Hallo\nuntil: 2027-01-29\n---\n')
  })

  it('without app/routes.ts, rewrites the locales list in ginko.config.ts', () => {
    const dir = folder({ 'ginko.config.ts': "export default defineSite({\n  locales: ['en', 'de'],\n  languages: { de: 'de-AT', en: 'en-GB' },\n})\n" })
    pruneLocales(dir, ['en', 'de'], ['en'])
    expect(read(dir, 'ginko.config.ts')).toBe("export default defineSite({\n  locales: ['en'],\n  languages: { en: 'en-GB' },\n})\n")
  })

  // Wrong behaviour caught: dropping the site language `de` also strips the German Studio label of a field, which is
  // not a site locale map.
  it('prunes only the locale maps of ginko.config.ts, not a field label keyed by language', () => {
    const dir = folder({ 'ginko.config.ts': "export default defineSite({\n  locales: ['en', 'de'],\n  languages: { en: 'en-GB', de: 'de-AT' },\n  pages: { home: { en: '/', de: '/de' } },\n  bricks: { posts: collection({ label: { de: 'Beiträge', en: 'Posts' }, route: { en: '/posts/[slug]', de: '/de/beitraege/[slug]' } }) },\n})\n" })
    pruneLocales(dir, ['en', 'de'], ['en'])
    expect(read(dir, 'ginko.config.ts')).toBe("export default defineSite({\n  locales: ['en'],\n  languages: { en: 'en-GB' },\n  pages: { home: { en: '/' } },\n  bricks: { posts: collection({ label: { de: 'Beiträge', en: 'Posts' }, route: { en: '/posts/[slug]' } }) },\n})\n")
  })

  it('refuses a locale the template does not have and changes nothing', () => {
    const dir = folder(trilingual)
    expect(() => pruneLocales(dir, ['en', 'de', 'fr'], ['en', 'it'])).toThrow('Unknown locale "it". This template has: en, de, fr.')
    expect(tree(dir)).toEqual(Object.keys(trilingual).sort())
  })
})

describe('shiftDates', () => {
  const site = {
    locales: ['en'],
    bricks: {
      events: { visible: { mode: 'until', field: 'when' }, fields: { title: { type: 'text' }, when: { type: 'daterange' }, day: { type: 'date' } } },
      posts: { fields: { date: { type: 'date' } } },
      notices: { visible: { mode: 'always' }, fields: { until: { type: 'date' } } },
      lunch: { status: { next: 'week' }, fields: { week: { type: 'date' } } },
      sessions: { fields: { date: { type: 'date' }, from: { type: 'time' } } },
    },
  }

  it('manifestOf picks the date fields of bricks that expire, show a next date, and sessions', () => {
    // Wrong behaviour caught: posts (a publication date) or a brick shown always would move too.
    expect(manifestOf(site)).toEqual({ locales: ['en'], shift: { events: ['when', 'day'], lunch: ['week'], sessions: ['date'] } })
  })

  it('moves the frontmatter dates of those fields, in every language, and leaves body text and other keys alone', () => {
    const dir = folder({
      'content/events/1.fair.md': '---\ntitle: Fair 2027-01-09\nwhen:\n  from: 2027-01-09\n  to: 2027-01-10\nday: 2027-01-09\n---\n\nCome on 2027-01-09.\n',
      'content/events/1.fair.de.md': '---\nwhen: { from: 2027-01-09, to: 2027-01-10 }\n---\n',
      'content/sessions.yml': 'date: 2027-02-01\nfrom: 09:00\n',
      'content/posts/1.a.md': '---\ndate: 2027-01-09\n---\n',
    })
    const { shift } = manifestOf(site)
    expect(shiftDates(dir, shift, 14).sort()).toEqual(['content/events/1.fair.de.md', 'content/events/1.fair.md', 'content/sessions.yml'])
    expect(read(dir, 'content/events/1.fair.md')).toBe('---\ntitle: Fair 2027-01-09\nwhen:\n  from: 2027-01-23\n  to: 2027-01-24\nday: 2027-01-23\n---\n\nCome on 2027-01-09.\n')
    expect(read(dir, 'content/events/1.fair.de.md')).toBe('---\nwhen: { from: 2027-01-23, to: 2027-01-24 }\n---\n')
    expect(read(dir, 'content/sessions.yml')).toBe('date: 2027-02-15\nfrom: 09:00\n')
    expect(read(dir, 'content/posts/1.a.md')).toBe('---\ndate: 2027-01-09\n---\n')
    expect(sampleDates(dir, shift).at(-1)).toBe('2027-02-15')
    expect(existsSync(join(dir, 'content/lunch.md'))).toBe(false)
  })
})
