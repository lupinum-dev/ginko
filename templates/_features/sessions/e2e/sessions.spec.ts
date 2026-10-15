// The sessions feature on the built template (gate 3): the programme in order, its JSON-LD and the speaker pages show
// the same time and room as the programme, and "now and next" stays away on a day without sessions.
import { expect, open, site, test } from '../../../../scripts/templates/e2e/helpers.ts'
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

test('the programme lists sessions by date and start time, and its JSON-LD has the same times', async ({ page }) => {
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

  // Wrong behaviour caught: a second copy of a session's time (JSON-LD built from other data than the page), or a
  // time without the zone offset, which search engines read as UTC.
  const event = (await jsonLdNodes(page)).find((node) => node['@type'] === 'Event' && node.subEvent)
  expect(event, 'Event JSON-LD with subEvent').toBeTruthy()
  const subStarts = (event.subEvent as { startDate: string }[]).map((sub) => sub.startDate)
  for (const start of subStarts) expect(start).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?[+-]\d{2}:\d{2}$/)
  expect(new Set(subStarts.map((start) => start.slice(0, 16)))).toEqual(new Set(starts))
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

test('now and next shows only on a day with sessions', async ({ page }) => {
  await open(page, '/programme')
  const days = new Set((await shown(page)).map((row) => row.start.slice(0, 10)))
  // The test instant in the site's zone: its date decides whether the home page shows the block.
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: site.timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(site.now))
  await open(page, '/')
  await expect(page.locator('[data-now-next]')).toHaveCount(days.has(today) ? 1 : 0)
})
