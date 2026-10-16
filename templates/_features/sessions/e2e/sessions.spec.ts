// The sessions feature on the built template (gate 3): the programme in order, the event page's JSON-LD and the
// speaker pages show the same time and room as the programme, sessions of an event that is not on the site stay
// off it, and "now and next" shows only on an event day, then without repeating its sessions further down.
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { expect, open, site, sitePages, test } from '../../../../scripts/templates/e2e/helpers.ts'
import type { Page } from '@playwright/test'

/** The sessions of the current page as shown: id, start (`YYYY-MM-DDTHH:MM`), the time text and the room. */
const shown = (page: Page) => page.locator('[data-session]').evaluateAll((rows) => rows.map((row) => ({
  id: row.getAttribute('data-session')!,
  start: row.querySelector('time')!.getAttribute('datetime')!,
  time: row.querySelector('time')!.textContent!.trim(),
  room: row.querySelector('[data-session-room]')?.textContent?.trim() ?? '',
  status: row.querySelector('[data-session-status]')?.textContent?.trim() ?? '',
})))

const jsonLdNodes = (page: Page) => page.locator('script[type="application/ld+json"]').evaluateAll((scripts) => scripts.flatMap((script) => {
  const data = JSON.parse(script.textContent ?? '{}')
  return Array.isArray(data) ? data : data['@graph'] ?? [data]
}))

/** Main-language files of a content folder of the template: entry id (`<folder>/<name>`) and text. */
const contentOf = (folder: string) => {
  const dir = fileURLToPath(new URL(`../../../${site.name}/content/${folder}/`, import.meta.url))
  return existsSync(dir)
    ? readdirSync(dir).filter((file) => /^[^.]+(\.[^.]+)?\.md$/.test(file) && !/\.[a-z]{2}\.md$/.test(file))
      .map((file) => ({ id: `${folder}/${file.replace(/^\d+\./, '').replace(/\.md$/, '')}`, text: readFileSync(`${dir}${file}`, 'utf8') }))
    : []
}
const draftEvents = new Set(contentOf('events').filter((file) => /^draft:\s*true\s*$/m.test(file.text)).map((file) => file.id))
/** Sessions whose event is a draft: never on the site. */
const hiddenSessions = contentOf('sessions').filter((file) => draftEvents.has(/^event:\s*(\S+)/m.exec(file.text)?.[1] ?? '')).map((file) => file.id)

/** The instant (ISO, UTC) of a date and clock time in the site's time zone. */
function zoned(date: string, clock: string) {
  const guess = Date.parse(`${date}T${clock}:00Z`)
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: site.timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
    .formatToParts(guess).map((part) => [part.type, part.value]))
  const local = Date.parse(`${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:00Z`)
  return new Date(guess - (local - guess)).toISOString()
}

test('the programme lists sessions by date and start time with their state as a word', async ({ page }) => {
  const response = await open(page, '/programme')
  expect(response?.status()).toBe(200)
  const rows = await shown(page)
  expect(rows.length, 'sessions on the programme').toBeGreaterThan(0)
  // Wrong behaviour caught: sessions of a day in file order instead of by start time, or a past day still listed.
  const starts = rows.map((row) => row.start)
  expect(starts).toEqual([...starts].sort())
  expect(starts[0]!.slice(0, 10) >= site.now.slice(0, 10), 'no past day').toBe(true)
  // The state is a word, never only a colour: open shows none, the others one of two words.
  for (const row of rows) expect(['', 'Sold out', 'Cancelled', 'Ausgebucht', 'Abgesagt']).toContain(row.status)
})

test('each event page has its programme in its JSON-LD with the same times, and together they are the programme', async ({ page, request }) => {
  await open(page, '/programme')
  const programme = new Set((await shown(page)).map((row) => row.start))
  // The event pages: the pages of the sitemap whose JSON-LD has an Event with sessions.
  const eventPages: string[] = []
  for (const path of await sitePages()) {
    if ((await (await request.get(path)).text()).includes('"subEvent"')) eventPages.push(path)
  }
  expect(eventPages.length, 'event pages with sessions in their JSON-LD').toBeGreaterThan(0)
  const covered = new Set<string>()
  for (const path of eventPages) {
    await open(page, path)
    const starts = (await shown(page)).map((row) => row.start)
    // Wrong behaviour caught: a second copy of a session's time (JSON-LD built from other data than the page), or a
    // time without the zone offset, which search engines read as UTC.
    const events = (await jsonLdNodes(page)).filter((node) => node['@type'] === 'Event')
    expect(events, `${path}: one Event node`).toHaveLength(1)
    const subStarts = (events[0].subEvent as { startDate: string }[]).map((sub) => sub.startDate)
    for (const start of subStarts) expect.soft(start).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?[+-]\d{2}:\d{2}$/)
    expect.soft(new Set(subStarts.map((start) => start.slice(0, 16))), path).toEqual(new Set(starts))
    for (const start of starts) covered.add(start)
  }
  expect(covered).toEqual(programme)
})

test('sessions of a draft event are on no page', async ({ page }) => {
  // Wrong behaviour caught: a session that references a draft (or hidden) event still on the programme, the home page
  // and in "now and next", although its event is a 404 and out of the sitemap.
  test.skip(hiddenSessions.length === 0, 'the template has no session of a draft event')
  for (const path of ['/programme', '/']) {
    await open(page, path)
    const ids = (await shown(page)).map((row) => row.id)
    for (const id of hiddenSessions) expect.soft(ids, `${path}: ${id}`).not.toContain(id)
    expect.soft(await page.content(), path).not.toContain(hiddenSessions[0]!)
  }
})

test('each speaker page answers and shows their sessions with the programme\'s time and room', async ({ page }) => {
  await open(page, '/programme')
  const rows = await shown(page)
  const speakers = await page.locator('[data-session] a').evaluateAll((links) => [...new Set(links.map((a) => a.getAttribute('href')!))])
  expect(speakers.length, 'speaker links on the programme').toBeGreaterThan(0)
  for (const href of speakers.slice(0, 6)) {
    const response = await open(page, href)
    expect.soft(response?.status(), `${href} status`).toBe(200)
    // Wrong behaviour caught: a speaker page that keeps an old time or room after the session moved.
    for (const talk of await shown(page)) {
      const same = rows.find((row) => row.id === talk.id)
      expect.soft(same, `${href}: ${talk.id} is on the programme`).toBeTruthy()
      expect.soft({ start: talk.start, time: talk.time, room: talk.room }, `${href}: ${talk.id}`).toEqual({ start: same?.start, time: same?.time, room: same?.room })
    }
  }
})

test('now and next stays away on a day without sessions', async ({ page }) => {
  await open(page, '/programme')
  const days = new Set((await shown(page)).map((row) => row.start.slice(0, 10)))
  // The test instant in the site's zone: its date decides whether the home page shows the block.
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: site.timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(site.now))
  await open(page, '/')
  await expect(page.locator('[data-now-next]')).toHaveCount(days.has(today) ? 1 : 0)
})

test('on an event day now and next shows the running and the next sessions, once, without a hydration mismatch', async ({ page }) => {
  await open(page, '/programme')
  const rows = (await shown(page)).filter((row) => row.status !== 'Cancelled' && row.status !== 'Abgesagt')
  // The instant: the second start time of the first day, so one session runs and the day goes on.
  const day = rows[0]!.start.slice(0, 10)
  const starts = [...new Set(rows.filter((row) => row.start.startsWith(day)).map((row) => row.start))]
  test.skip(starts.length < 3, 'the first day has fewer than three start times')
  const [running, upcoming] = [starts[1]!, starts[2]!]
  // The server keeps the test instant; the browser's clock moves the block in after hydration, as for a page that
  // stays open into the event day.
  await page.clock.setSystemTime(new Date(zoned(day, running.slice(11, 16))))
  const errors: string[] = []
  page.on('console', (message) => { if (message.type() === 'error' || /hydration/i.test(message.text())) errors.push(message.text()) })
  await open(page, '/')
  const block = page.locator('[data-now-next]')
  await expect(block).toHaveCount(1)
  for (const row of rows.filter((r) => r.start === running)) await expect(block.locator(`[data-now] [data-session="${row.id}"]`)).toHaveCount(1)
  for (const row of rows.filter((r) => r.start === upcoming)) await expect(block.locator(`[data-next] [data-session="${row.id}"]`)).toHaveCount(1)
  // Wrong behaviour caught: "From the programme" repeating the sessions that "now and next" lists.
  const inBlock = await block.locator('[data-session]').evaluateAll((els) => els.map((el) => el.getAttribute('data-session')!))
  const elsewhere = await page.locator('[data-session]:not([data-now-next] [data-session])').evaluateAll((els) => els.map((el) => el.getAttribute('data-session')!))
  expect(elsewhere.filter((id) => inBlock.includes(id))).toEqual([])
  expect(errors.filter((text) => /hydration|mismatch/i.test(text))).toEqual([])
})
