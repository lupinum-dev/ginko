// The weekly reminder (SPEC 10): who is mailed, when, and never twice.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { api, internal } from '../convex/_generated/api'
import { setup } from './setup'

const SUNDAY_17_VIENNA = Date.parse('2026-10-11T15:30:00Z')
const SATURDAY_17_VIENNA = Date.parse('2026-10-10T15:30:00Z')
const SUNDAY_18_VIENNA = Date.parse('2026-10-11T16:00:00Z')

beforeEach(() => {
  vi.stubEnv('GINKO_MAIL', 'outbox')
  vi.stubEnv('SITE_URL', 'https://ginko.test')
})
afterEach(() => {
  vi.unstubAllEnvs()
})

type Backend = Awaited<ReturnType<typeof setup>>

async function mails(t: Backend['t']) {
  return (await t.run((ctx) => ctx.db.query('outbox').collect())).filter((m) => m.subject.startsWith('Mittagsmenü'))
}

/** The restaurant corpus without its planned lunch week, so the lunch brick alone decides. */
async function setupUnplanned() {
  const s = await setup()
  await s.t.run(async (ctx) => {
    for (const e of await ctx.db.query('entries').withIndex('by_site_brick_order', (q) => q.eq('site', s.site).eq('brick', 'lunchPlans')).collect()) await ctx.db.delete(e._id)
  })
  return s
}

/** Sets `status` on a brick of the stored schema. */
async function setStatus({ t, site }: Backend, brick: string, status: unknown) {
  await t.run(async (ctx) => {
    const row = (await ctx.db.get(site))!
    const schema = structuredClone(row.schema) as { bricks: Record<string, Record<string, unknown>> }
    schema.bricks[brick]!.status = status
    await ctx.db.patch(site, { schema })
  })
}

/** A staff member without the lunch task: signed in, member, but cannot fix it. */
async function addStaffWithoutTask({ t, site }: Backend) {
  await t.run((ctx) => ctx.db.insert('memberships', { site, user: 'u-neu', email: 'neu@example.com', role: 'staff', grants: ['menu.price'] }))
}

describe('reminders.sweep', () => {
  // Wrong behaviour caught: the reminder goes to staff who cannot fix it, misses the owner, or reads differently from the Studio.
  it('mails the cook with the lunch task and the owner on Sunday 17:xx Vienna, not staff without the task', async () => {
    const s = await setupUnplanned()
    await addStaffWithoutTask(s)
    expect(await s.t.mutation(internal.reminders.sweep, { now: SUNDAY_17_VIENNA })).toEqual({ sent: 2 })
    const sent = await mails(s.t)
    expect(sent.map((m) => m.to).sort()).toEqual(['koch@example.com', 'wirtin@example.com'])
    expect(sent[0]).toMatchObject({
      subject: 'Mittagsmenü für nächste Woche fehlt noch',
      text: expect.stringContaining('https://ginko.test/s/restaurant'),
    })
    expect(sent[0]!.text).toContain('Erinnerungen per E-Mail')
  })

  // Wrong behaviour caught: "Meine Seiten" offered the reminder mail to everyone, also where it can never mail them.
  it('sites.mine says to whom a site can send the reminder', async () => {
    const s = await setup()
    await addStaffWithoutTask(s)
    const weekly = async (as: { query: typeof s.as.owner.query }) => (await as.query(api.sites.mine, {})).map((x) => [x.slug, x.weekly])
    expect(await weekly(s.as.owner)).toEqual([['restaurant', true]])
    expect(await weekly(s.as.cook)).toEqual([['restaurant', true]])
    expect(await weekly(s.t.withIdentity({ subject: 'u-neu', email: 'neu@example.com' }))).toEqual([['restaurant', false]])
    // A site without a weekly task mails nobody.
    await s.t.run(async (ctx) => {
      const site = (await ctx.db.get(s.site))!
      const { lunch: _lunch, ...bricks } = (site.schema as { bricks: Record<string, unknown> }).bricks
      await ctx.db.patch(s.site, { schema: { ...(site.schema as object), bricks } })
    })
    expect(await weekly(s.as.owner)).toEqual([['restaurant', false]])
    // A status line can be mailed too: to the owner, not to the cook without a notices task.
    await setStatus(s, 'notices', { count: true })
    expect(await weekly(s.as.owner)).toEqual([['restaurant', true]])
    expect(await weekly(s.as.cook)).toEqual([['restaurant', false]])
  })

  // Wrong behaviour caught: a due status line (a notice ends in the coming week) stays on the Today page only, or the
  // mail words it differently, or it reaches staff without a task on that area.
  it('mails a due status line in the words of the Today page, to those who can fix it', async () => {
    const s = await setup()
    await setStatus(s, 'notices', { count: true })
    // The corpus notice "Weinabend" shows until 2026-10-16, inside the week from Monday 2026-10-12.
    expect(await s.t.mutation(internal.reminders.sweep, { now: SUNDAY_17_VIENNA })).toEqual({ sent: 1 })
    const sent = await s.t.run((ctx) => ctx.db.query('outbox').collect())
    expect(sent.map((m) => [m.to, m.subject])).toEqual([['wirtin@example.com', 'Hinweise: 1 endet in den nächsten 7 Tagen']])
    expect(sent[0]!.text).toContain('1 endet in den nächsten 7 Tagen')
    expect(sent[0]!.text).toContain('https://ginko.test/s/restaurant')
    expect(await s.t.mutation(internal.reminders.sweep, { now: SUNDAY_17_VIENNA + 20 * 60 * 1000 })).toEqual({ sent: 0 })
  })

  // Wrong behaviour caught: a created but unreleased site had no `week` in its schema, so the hourly sweep threw for all sites.
  it('still mails when another site is created but not released yet', async () => {
    const s = await setupUnplanned()
    await s.t.mutation(internal.sites.bootstrap, { slug: 'neue-seite', name: 'Neue Seite', url: 'https://neu.example' })
    expect(await s.t.mutation(internal.reminders.sweep, { now: SUNDAY_17_VIENNA })).toEqual({ sent: 2 })
  })

  // Wrong behaviour caught: the person switches the mail off and still gets it, or the switch hides the mail for everyone.
  it('skips a person who switched reminders off', async () => {
    const s = await setupUnplanned()
    expect(await s.as.cook.query(api.account.settings, {})).toEqual({ remindByMail: true, locale: null, name: null })
    await s.as.cook.mutation(api.account.setRemindByMail, { on: false })
    expect(await s.as.cook.query(api.account.settings, {})).toEqual({ remindByMail: false, locale: null, name: null })
    await s.t.mutation(internal.reminders.sweep, { now: SUNDAY_17_VIENNA })
    expect((await mails(s.t)).map((m) => m.to)).toEqual(['wirtin@example.com'])
  })

  // Wrong behaviour caught: the hourly cron sends at the wrong day or hour, or when nothing is missing.
  it.each([
    ['Saturday 17:30', SATURDAY_17_VIENNA],
    ['Sunday 18:00', SUNDAY_18_VIENNA],
    ['Sunday 16:59', Date.parse('2026-10-11T14:59:00Z')],
  ])('sends nothing on %s', async (_name, now) => {
    const s = await setupUnplanned()
    expect(await s.t.mutation(internal.reminders.sweep, { now })).toEqual({ sent: 0 })
    expect(await mails(s.t)).toEqual([])
  })

  // Wrong behaviour caught: next week is already entered and the owner is nagged anyway.
  it('sends nothing when next week is entered', async () => {
    const s = await setupUnplanned()
    await s.t.run(async (ctx) => {
      const lunch = (await ctx.db.query('entries').withIndex('by_site_brick_order', (q) => q.eq('site', s.site).eq('brick', 'lunch')).first())!
      await ctx.db.patch(lunch._id, { data: { ...lunch.data, weekOf: '2026-10-12' } })
    })
    expect(await s.t.mutation(internal.reminders.sweep, { now: SUNDAY_17_VIENNA })).toEqual({ sent: 0 })
  })

  // Wrong behaviour caught: the cook planned next week in lunchPlans (the corpus plans 2026-10-12) and still gets the mail.
  it('sends nothing when next week is planned in lunchPlans', async () => {
    const s = await setup()
    expect(await s.t.run((ctx) => ctx.db.query('entries').withIndex('by_site_brick_order', (q) => q.eq('site', s.site).eq('brick', 'lunchPlans')).collect())).toHaveLength(1)
    expect(await s.t.mutation(internal.reminders.sweep, { now: SUNDAY_17_VIENNA })).toEqual({ sent: 0 })
  })

  // Wrong behaviour caught: the hourly sweep mails everyone again each run.
  it('sends once per person and week, however often it runs', async () => {
    const s = await setupUnplanned()
    expect(await s.t.mutation(internal.reminders.sweep, { now: SUNDAY_17_VIENNA })).toEqual({ sent: 2 })
    expect(await s.t.mutation(internal.reminders.sweep, { now: SUNDAY_17_VIENNA + 20 * 60 * 1000 })).toEqual({ sent: 0 })
    expect(await mails(s.t)).toHaveLength(2)
  })

  // Wrong behaviour caught: a Sunday-first site (en-US) is still reminded on Sunday, when its week has already begun.
  it('fires on the day before the week starts: Saturday for a Sunday-first site', async () => {
    const s = await setupUnplanned()
    await s.t.run(async (ctx) => {
      const site = (await ctx.db.get(s.site))!
      await ctx.db.patch(s.site, { schema: { ...(site.schema as object), week: { firstDay: 7, weekend: [6, 7] } } })
    })
    expect(await s.t.mutation(internal.reminders.sweep, { now: SUNDAY_17_VIENNA })).toEqual({ sent: 0 })
    expect(await s.t.mutation(internal.reminders.sweep, { now: SATURDAY_17_VIENNA })).toEqual({ sent: 2 })
  })

  // Wrong behaviour caught: every site follows Vienna, so a site in another zone is reminded at the wrong hour.
  it('follows the time zone of the site', async () => {
    const s = await setupUnplanned()
    await s.t.run(async (ctx) => {
      const site = (await ctx.db.get(s.site))!
      await ctx.db.patch(s.site, { schema: { ...(site.schema as object), timeZone: 'America/Los_Angeles' } })
    })
    // Sunday 17:30 in Vienna is Sunday 08:30 in Los Angeles.
    expect(await s.t.mutation(internal.reminders.sweep, { now: SUNDAY_17_VIENNA })).toEqual({ sent: 0 })
    // Sunday 17:30 in Los Angeles is Monday 02:30 in Vienna.
    expect(await s.t.mutation(internal.reminders.sweep, { now: Date.parse('2026-10-12T00:30:00Z') })).toEqual({ sent: 2 })
  })
})
