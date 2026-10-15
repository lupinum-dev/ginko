// Messages and mail in the person's language (E8c): catalogs agree, errors and mail follow userSettings.locale.
import { compileTree } from '@lupinum/ginko-i18n/compile'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { api, internal } from '../convex/_generated/api'
import { CATALOGS, DEFAULT_LOCALE, LOCALES, t } from '../convex/lib/i18n'
import { errorOf, setup } from './setup'

beforeEach(() => {
  vi.stubEnv('GINKO_MAIL', 'outbox')
  vi.stubEnv('SITE_URL', 'https://ginko.test')
})
afterEach(() => {
  vi.unstubAllEnvs()
})

describe('catalogs', () => {
  // Wrong behaviour caught: a key or parameter exists in one language only, so a person gets a missing text or an empty gap.
  it('have the same keys with the same parameters in every language', () => {
    const base = compileTree(CATALOGS[DEFAULT_LOCALE]!).params
    expect(Object.keys(base).length).toBeGreaterThan(100)
    for (const locale of LOCALES) {
      const params = compileTree(CATALOGS[locale]!).params
      expect(Object.keys(params).sort(), locale).toEqual(Object.keys(base).sort())
      for (const [key, names] of Object.entries(base)) expect([...(params[key] ?? [])].sort(), `${locale} ${key}`).toEqual([...names].sort())
    }
  })

  it('give an unknown language the German text', () => {
    expect(t('xx', 'errors.noAccess')).toBe('Kein Zugriff auf diese Seite.')
    expect(t('en', 'errors.noAccess')).toBe('No access to this site.')
  })
})

describe('account.setLocale', () => {
  it('stores a supported language, shows it in settings, and refuses an unknown one', async () => {
    const { as } = await setup()
    expect(await as.cook.query(api.account.settings, {})).toEqual({ remindByMail: true, locale: null, name: null })
    await as.cook.mutation(api.account.setLocale, { locale: 'en' })
    expect(await as.cook.query(api.account.settings, {})).toEqual({ remindByMail: true, locale: 'en', name: null })
    const refused = await errorOf(as.cook.mutation(api.account.setLocale, { locale: 'xx' }))
    expect(refused).toMatchObject({ code: 'INVALID', key: 'errors.languageUnsupported', params: { locale: 'xx' } })
    expect((await as.cook.query(api.account.settings, {})).locale).toBe('en')
  })
})

describe('fail', () => {
  // Wrong behaviour caught: the Studio cannot translate an error because the key or its parameters are missing.
  it('carries the code, the catalog key and the German message, whatever the caller language', async () => {
    const { t: backend } = await setup()
    const person = backend.withIdentity({ subject: 'u-anders', email: 'anders@example.com' })
    await person.mutation(api.account.setLocale, { locale: 'en' })
    const error = await errorOf(person.mutation(api.invites.acceptMine, { invite: 'nicht-vorhanden' }))
    expect(error).toMatchObject({ code: 'NOT_FOUND', key: 'errors.inviteNotFound', message: 'Diese Einladung gibt es nicht (mehr).' })
    expect(t('en', error.key, error.params)).toBe('This invitation does not exist (anymore).')
  })
})

describe('mail', () => {
  // Wrong behaviour caught: the reminder is written for the sender or the site, not for the person who reads it.
  it('sends the reminder in the language of its recipient', async () => {
    const s = await setup()
    await s.t.run(async (ctx) => {
      for (const e of await ctx.db.query('entries').withIndex('by_site_brick_order', (q) => q.eq('site', s.site).eq('brick', 'lunchPlans')).collect()) await ctx.db.delete(e._id)
    })
    await s.as.cook.mutation(api.account.setLocale, { locale: 'en' })
    await s.t.mutation(internal.reminders.sweep, { now: Date.parse('2026-10-11T15:30:00Z') })
    const sent = await s.t.run((ctx) => ctx.db.query('outbox').collect())
    expect(sent.find((m) => m.to === 'koch@example.com')).toMatchObject({ subject: 'Lunch menu for next week is still missing' })
    expect(sent.find((m) => m.to === 'wirtin@example.com')).toMatchObject({ subject: 'Mittagsmenü für nächste Woche fehlt noch' })
  })

  // Wrong behaviour caught: a person who never picked a language gets German mail although their Studio is English;
  // or the language seen once pins the Studio, so another browser can no longer show its own language.
  it('without a choice, mail follows the language the Studio last showed; a choice wins and only a choice is the setting', async () => {
    const s = await setup()
    await s.t.run(async (ctx) => {
      for (const e of await ctx.db.query('entries').withIndex('by_site_brick_order', (q) => q.eq('site', s.site).eq('brick', 'lunchPlans')).collect()) await ctx.db.delete(e._id)
    })
    await s.as.owner.mutation(api.account.sawLocale, { locale: 'en' })
    await s.as.cook.mutation(api.account.sawLocale, { locale: 'en' })
    await s.as.cook.mutation(api.account.setLocale, { locale: 'de' })
    expect((await s.as.owner.query(api.account.settings, {})).locale).toBeNull()
    await s.t.mutation(internal.reminders.sweep, { now: Date.parse('2026-10-11T15:30:00Z') })
    const sent = await s.t.run((ctx) => ctx.db.query('outbox').collect())
    expect(sent.find((m) => m.to === 'wirtin@example.com')).toMatchObject({ subject: 'Lunch menu for next week is still missing' })
    expect(sent.find((m) => m.to === 'koch@example.com')).toMatchObject({ subject: 'Mittagsmenü für nächste Woche fehlt noch' })
  })

  // Wrong behaviour caught: the invitee gets the mail in the language of the site's default, not of the person who invited.
  it('sends the invitation in the language of the inviter', async () => {
    const { t: backend, as } = await setup()
    await as.owner.mutation(api.account.setLocale, { locale: 'en' })
    await as.owner.mutation(api.invites.create, { site: 'restaurant', email: 'neu@example.com', role: 'staff', grants: [] })
    const [mail] = await backend.run((ctx) => ctx.db.query('outbox').withIndex('by_to', (q) => q.eq('to', 'neu@example.com')).collect())
    expect(mail!.subject).toMatch(/^Invitation to /)
    expect(mail!.text).toContain('valid for 7 days')
  })
})
