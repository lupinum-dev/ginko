// Uploads (SPEC 4.3): tickets and the upload route, the content check, processing state, reads and the daily sweep.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { api, internal } from '../convex/_generated/api'
import type { Id } from '../convex/_generated/dataModel'
import { errorOf, postUpload, revokeSession, setup, upload } from './setup'
import { kindOf } from '../convex/lib/files'
import { people } from './setup'
import { tick } from './clock'

const MB = 1024 * 1024

afterEach(() => {
  vi.useRealTimers()
})

type Harness = Awaited<ReturnType<typeof setup>>['t']
async function storedFiles(t: Harness) {
  return t.run((ctx) => ctx.db.system.query('_storage').collect())
}

async function storeFile(t: Harness, text: string): Promise<Id<'_storage'>> {
  return t.run((ctx) => ctx.storage.store(new Blob([text], { type: 'image/webp' })))
}

/** Bytes that start like a JPEG; the route checks only the signature. */
function jpeg(size: number) {
  const bytes = new Uint8Array(size)
  bytes.set([0xff, 0xd8, 0xff, 0xe0])
  return bytes
}

describe('uploads.prepare and POST /upload', () => {
  it('gives tickets to members only, and stores the file for the ticket\'s member and site', async () => {
    const s = await setup()
    expect((await errorOf(s.as.stranger.mutation(api.uploads.prepare, { site: 'restaurant' }))).code).toBe('FORBIDDEN')
    const id = await upload(s, { person: 'cook', ready: false })
    expect(await s.t.run((ctx) => ctx.db.get(id))).toMatchObject({ site: s.site, uploader: people.cook, status: 'processing', size: 14 })
  })

  // Astra phase 8: a stored file must belong to someone from the start, so nobody can claim it later.
  // The ticket is that handover: used once, then gone.
  // Wrong behaviour caught: the Studio's uploads are blocked by CORS, or another origin may upload with a stolen ticket.
  it('allows the browser call only from the platform UI (SITE_URL)', async () => {
    vi.stubEnv('SITE_URL', 'https://platform.test/')
    const s = await setup()
    const preflight = (origin: string) => s.t.fetch('/upload', { method: 'OPTIONS', headers: { Origin: origin } })
    expect((await preflight('https://platform.test')).headers.get('access-control-allow-origin')).toBe('https://platform.test')
    expect((await preflight('https://evil.test')).headers.get('access-control-allow-origin')).toBeNull()
    vi.unstubAllEnvs()
  })

  // Wrong behaviour caught: a script or a stolen session fills the site's storage through unlimited tickets.
  it('refuses the 201st ticket of a person in an hour; another site or person still gets one', async () => {
    const s = await setup()
    await s.t.run((ctx) => ctx.db.insert('memberships', { site: s.other, user: people.owner, role: 'owner', grants: [] }))
    const prepare = (who: 'owner' | 'cook', site = 'restaurant') => s.as[who].mutation(api.uploads.prepare, { site })
    for (let i = 0; i < 200; i++) await prepare('owner')
    expect(await errorOf(prepare('owner'))).toMatchObject({ code: 'RATE_LIMITED', message: 'Du hast in kurzer Zeit sehr viele Dateien hochgeladen. Versuche es später noch einmal.' })
    expect(await prepare('owner', 'andere')).toMatchObject({ ticket: expect.any(String) })
    expect(await prepare('cook')).toMatchObject({ ticket: expect.any(String) })
  })

  it('uses a ticket once', async () => {
    const s = await setup()
    const { ticket } = await s.as.owner.mutation(api.uploads.prepare, { site: 'restaurant' })
    expect((await postUpload(s, { ticket })).status).toBe(200)
    const again = await postUpload(s, { ticket })
    expect(again.status).toBe(403)
    expect(await storedFiles(s.t)).toHaveLength(1)
  })

  it('refuses an expired ticket and a ticket of a member removed since, and stores nothing', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-10-08T10:00:00Z'))
    const s = await setup()
    const late = (await s.as.owner.mutation(api.uploads.prepare, { site: 'restaurant' })).ticket
    const cooks = (await s.as.cook.mutation(api.uploads.prepare, { site: 'restaurant' })).ticket
    await s.t.run(async (ctx) => {
      const m = await ctx.db.query('memberships').withIndex('by_user_site', (q) => q.eq('user', people.cook).eq('site', s.site)).unique()
      await ctx.db.delete(m!._id)
    })
    expect((await postUpload(s, { ticket: cooks })).status).toBe(403)
    vi.setSystemTime(new Date('2026-10-08T10:11:00Z'))
    expect((await postUpload(s, { ticket: late })).status).toBe(403)
    expect(await storedFiles(s.t)).toHaveLength(0)
  })

  it.each([
    ['an unsupported type', 'application/zip', 'PK\u0003\u0004 kein Bild', 415, 'errors.uploadWrongType'],
    ['text sent as PNG', 'image/png', 'Dies ist Text, kein PNG.', 415, 'errors.uploadWrongContent'],
    ['an empty file', 'image/jpeg', '', 415, 'errors.uploadEmpty'],
    ['an iPhone photo in HEIC (sharp here cannot read it)', 'image/heic', '\u0000\u0000\u0000\u0018ftypheic', 415, 'errors.uploadHeicUnreadable'],
    ['an image over 20 MB', 'image/jpeg', jpeg(20 * MB + 1), 413, 'errors.uploadTooLarge'],
  ])('refuses %s and stores nothing; the reason is a catalog key the Studio translates', async (_name, type, content, status, key) => {
    const s = await setup()
    const response = await postUpload(s, { type, content })
    expect([response.status, ((await response.json()) as { key: string }).key]).toEqual([status, key])
    expect(await storedFiles(s.t)).toHaveLength(0)
  })

  // Wrong behaviour caught: a JPEG saved as .png (downloaded or forwarded photos) was refused as "wrong content".
  it('stores a photo as the type its bytes prove, whatever its name or declared type says', async () => {
    const s = await setup()
    const id = await upload(s, { type: 'image/png', content: jpeg(16), name: 'foto.png', ready: false })
    expect((await s.t.run((ctx) => ctx.db.get(id)))!.mime).toBe('image/jpeg')
  })

  it('deletes the stored file when register refuses it (blank file name)', async () => {
    const s = await setup()
    const response = await postUpload(s, { name: '   ' })
    expect([response.status, ((await response.json()) as { code: string }).code]).toEqual([400, 'INVALID'])
    expect(await storedFiles(s.t)).toHaveLength(0)
  })

  it.each([
    ['a path', '../../etc/passwd', 'passwd'],
    ['a Windows path', 'C:\\Users\\Koch\\foto.pdf', 'foto.pdf'],
    ['a NUL and a line feed', 'a\u0000b\nc.pdf', 'abc.pdf'],
    ['a bidi override', 'a\u202egnp.pdf', 'agnp.pdf'],
    ['decomposed letters', 'A\u0308rger.pdf', '\u00c4rger.pdf'],
    ['only dots', '..', 'datei'],
    ['only a separator', 'ordner/', 'datei'],
    ['only a control character', '\u0000', 'datei'],
    ['150 characters', `${'x'.repeat(146)}.pdf`, `${'x'.repeat(116)}.pdf`],
    ['250 characters', `${'x'.repeat(246)}.pdf`, `${'x'.repeat(116)}.pdf`],
  ])('stores the name of %s cleaned (F15)', async (_case, given, stored) => {
    const s = await setup()
    const id = await upload(s, { name: given })
    expect((await s.t.run((ctx) => ctx.db.get(id)))!.name).toBe(stored)
  })

  it('a revoked session gets no ticket', async () => {
    const s = await setup()
    await revokeSession(s.t, 'owner')
    await expect(s.as.owner.mutation(api.uploads.prepare, { site: 'restaurant' })).rejects.toThrow()
  })
})

describe('content check (lib/files)', () => {
  it.each([
    ['image/png', 'Dies ist Text, kein PNG.', false],
    ['application/pdf', '%PDF-1.7 echt', true],
    ['application/pdf', '<html>kein pdf', false],
    ['image/jpeg', '\u00ff\u00d8\u00ffJFIF', true],
  ])('%s with %j passes: %s', (mime, text, ok) => {
    const bytes = Uint8Array.from([...text].map((c) => c.charCodeAt(0)))
    expect(kindOf(mime)!.signature(bytes)).toBe(ok)
  })
})

describe('uploads.markReady and markFailed', () => {
  const registerImage = (s: Awaited<ReturnType<typeof setup>>) => upload(s, { type: 'image/jpeg', content: jpeg(16), name: 'speise.jpg', ready: false })

  it('markReady is a no-op on a retry and keeps the first processed file', async () => {
    const s = await setup()
    const id = await registerImage(s)
    const first = await storeFile(s.t, 'webp one')
    const second = await storeFile(s.t, 'webp two')
    const args = { upload: id, size: 8, width: 2400, height: 1800 }
    expect(await s.t.mutation(internal.uploads.markReady, { ...args, processedId: first })).toBe(true)
    expect(await s.t.mutation(internal.uploads.markReady, { ...args, processedId: second })).toBe(false)
    expect(await s.t.run((ctx) => ctx.db.get(id))).toMatchObject({ status: 'ready', processedId: first, width: 2400, height: 1800 })
  })

  // Wrong behaviour caught: an imported picture that an entry already names became ready without a new contentRev, so a
  // site's cache kept serving the entry with the picture broken until some unrelated save.
  it('markReady of a file an entry uses raises contentRev, so the site fetches it', async () => {
    const s = await setup()
    const id = await registerImage(s)
    await s.t.run((ctx) => ctx.db.insert('fileRefs', { site: s.site, file: id, holder: 'entry', holderId: Object.values(s.entries)[0]!, uses: [{ path: 'photo', missingAlt: false }], missingAlt: false }))
    await s.t.mutation(internal.uploads.markReady, { upload: id, processedId: await storeFile(s.t, 'webp'), size: 8, width: 2, height: 1 })
    await s.t.mutation(internal.uploads.applyRevBumps, { site: s.site })
    expect((await s.t.run((ctx) => ctx.db.get(s.site)))!.contentRev).toBe(2)
  })

  // Wrong behaviour caught: every finished upload of an import patched the site document, so ~200 at once hit write conflicts and got stuck.
  it('ten finished uploads used by entries raise contentRev once and leave no queued bumps', async () => {
    const s = await setup()
    const before = (await s.t.run((ctx) => ctx.db.get(s.site)))!.contentRev
    for (let i = 0; i < 10; i++) {
      const id = await registerImage(s)
      await s.t.run((ctx) => ctx.db.insert('fileRefs', { site: s.site, file: id, holder: 'entry', holderId: Object.values(s.entries)[0]!, uses: [{ path: 'photo', missingAlt: false }], missingAlt: false }))
      await s.t.mutation(internal.uploads.markReady, { upload: id, processedId: await storeFile(s.t, `webp ${i}`), size: 8, width: 2, height: 1 })
    }
    expect((await s.t.run((ctx) => ctx.db.query('revBumps').collect())).length).toBe(10)
    expect((await s.t.run((ctx) => ctx.db.get(s.site)))!.contentRev).toBe(before)
    await s.t.mutation(internal.uploads.applyRevBumps, { site: s.site })
    await s.t.mutation(internal.uploads.applyRevBumps, { site: s.site })
    expect((await s.t.run((ctx) => ctx.db.get(s.site)))!.contentRev).toBe(before + 1)
    expect(await s.t.run((ctx) => ctx.db.query('revBumps').collect())).toEqual([])
  })

  it('marks an upload failed after the third failed attempt, not before', async () => {
    const s = await setup()
    const id = await registerImage(s)
    const fail = { upload: id, key: 'errors.uploadRetrying', permanent: false }
    await s.t.mutation(internal.uploads.markFailed, fail)
    await s.t.mutation(internal.uploads.markFailed, fail)
    expect(await s.t.run((ctx) => ctx.db.get(id))).toMatchObject({ status: 'processing', attempts: 2 })
    await s.t.mutation(internal.uploads.markFailed, fail)
    expect(await s.t.run((ctx) => ctx.db.get(id))).toMatchObject({ status: 'failed', attempts: 3 })
  })
})

describe('uploads.requeueStale', () => {
  // Wrong behaviour caught: a run that ended without marking its row (a lost write, a crash, a timeout) left the upload
  // `processing` with no run planned, so the picture stayed broken until the sweep deleted it (vulkanrot import).
  it('queues a processing upload again whose run is long overdue, but not one whose run is still due', async () => {
    const s = await setup()
    const insert = async (name: string) => {
      const storageId = await storeFile(s.t, '%PDF-1.7 echt')
      return s.t.run((ctx) => ctx.db.insert('uploads', { site: s.site, uploader: people.cook, storageId, name, size: 13, mime: 'application/pdf', status: 'processing', attempts: 0 }))
    }
    const lost = await insert('alt.pdf')
    tick(10 * 60 * 1000)
    const fresh = await insert('neu.pdf')
    tick(6 * 60 * 1000)
    expect(await s.t.mutation(internal.uploads.requeueStale, {})).toBe(1)
    const planned = await s.t.run((ctx) => ctx.db.system.query('_scheduled_functions').collect())
    expect(planned.filter((f) => f.name.startsWith('uploadsNode') && f.state.kind === 'pending').map((f) => f.args[0].upload)).toEqual([lost])
    await s.t.action(internal.uploadsNode.run, { upload: lost })
    const rows = await s.t.run(async (ctx) => [await ctx.db.get(lost), await ctx.db.get(fresh)])
    expect(rows.map((r) => [r!.name, r!.status, r!.attempts])).toEqual([['alt.pdf', 'ready', 1], ['neu.pdf', 'processing', 0]])
  })
})

describe('uploads.sweep', () => {
  it('deletes a storage file without an upload row after 24 h, but not a younger one', async () => {
    // The clock is set before setup: convex-test never gives a table a creation time earlier than the last one.
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-10-01T00:00:00Z'))
    const { t } = await setup()
    await storeFile(t, 'verwaist')
    vi.setSystemTime(new Date('2026-10-02T12:00:00Z'))
    const young = await storeFile(t, 'frisch')
    vi.setSystemTime(new Date('2026-10-02T13:00:00Z'))
    // Each phase once; with fewer than 200 rows no phase needs a second batch.
    for (const phase of ['storage', 'processing', 'failed', 'ready'] as const) await t.mutation(internal.uploads.sweep, { phase })
    expect((await storedFiles(t)).map((file) => file._id)).toEqual([young])
  })

  it('deletes an orphan storage file of any age older than 24 h, not only the ones of the last days', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-10-01T00:00:00Z'))
    const { t } = await setup()
    await storeFile(t, 'vier Tage alt')
    vi.setSystemTime(new Date('2026-10-05T00:00:00Z'))
    for (const phase of ['storage', 'processing', 'failed', 'ready'] as const) await t.mutation(internal.uploads.sweep, { phase })
    expect(await storedFiles(t)).toHaveLength(0)
  })

  it('deletes a ready upload without a file reference after 7 days, but keeps a referenced one', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-10-01T00:00:00Z'))
    const s = await setup()
    const { t, site } = s
    const unused = await upload(s, { content: '%PDF-1.4 a', name: 'a.pdf' })
    const used = await upload(s, { content: '%PDF-1.4 b', name: 'b.pdf' })
    await t.run((ctx) => ctx.db.insert('fileRefs', { site, file: used, holder: 'entry', holderId: 'eintrag-1' }))

    vi.setSystemTime(new Date('2026-10-08T01:00:00Z'))
    // Each phase once; with fewer than 200 rows no phase needs a second batch.
    for (const phase of ['storage', 'processing', 'failed', 'ready'] as const) await t.mutation(internal.uploads.sweep, { phase })
    expect(await t.run((ctx) => ctx.db.get(unused))).toBeNull()
    expect(await t.run((ctx) => ctx.db.get(used))).not.toBeNull()
    expect(await storedFiles(t)).toHaveLength(1)
  })
})

describe('uploads.sweep with stale processing rows', () => {
  it('keeps a referenced processing upload (and marks it failed), purges an unreferenced one with its refs', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-10-01T00:00:00Z'))
    const s = await setup()
    const { t, site } = s
    const unused = await upload(s, { person: 'cook', ready: false })
    const used = await upload(s, { person: 'cook', ready: false })
    await t.run((ctx) => ctx.db.insert('fileRefs', { site, file: used, holder: 'entry', holderId: 'eintrag-1' }))

    vi.setSystemTime(new Date('2026-10-02T01:00:00Z'))
    for (const phase of ['processing', 'failed'] as const) await t.mutation(internal.uploads.sweep, { phase })
    expect(await t.run((ctx) => ctx.db.get(unused))).toBeNull()
    expect(await t.run((ctx) => ctx.db.get(used))).toMatchObject({ status: 'failed', error: 'errors.uploadRetrying' })
    expect(await t.run((ctx) => ctx.db.query('fileRefs').collect())).toHaveLength(1)
    expect(await storedFiles(t)).toHaveLength(1)
  })
})

describe('uploads.get', () => {
  it('refuses the status and URL of an upload to a member of another site', async () => {
    const s = await setup()
    const id = await upload(s, { content: '%PDF-1.4 c', name: 'c.pdf' })
    const error = await errorOf(s.as.stranger.query(api.uploads.get, { site: 'restaurant', upload: id }))
    expect(error.code).toBe('FORBIDDEN')
  })
})

describe('uploads.urls', () => {
  it('returns the URL of a ready upload of the site, and null for an upload of another site, a processing one and an unknown id', async () => {
    const s = await setup()
    const { as } = s
    const own = await upload(s, { name: 'karte.pdf', content: '%PDF-1.4 karte' })
    const foreign = await upload(s, { person: 'stranger', site: 'andere', name: 'fremd.pdf', content: '%PDF-1.4 karte' })
    const processing = await upload(s, { type: 'image/jpeg', content: jpeg(16), name: 'foto.jpg', ready: false })
    const unknown = 'kein-upload'
    const found = await as.owner.query(api.uploads.urls, { site: 'restaurant', ids: [own, foreign, processing, unknown] })
    expect(found[own]).toMatchObject({ name: 'karte.pdf', size: 14, width: null, height: null, url: expect.any(String) })
    expect(found[foreign]).toBeNull()
    expect(found[processing]).toBeNull()
    expect(found[unknown]).toBeNull()
  })

  it('refuses the URLs to a member of another site', async () => {
    const s = await setup()
    const own = await upload(s, { content: '%PDF-1.4 d', name: 'd.pdf' })
    const error = await errorOf(s.as.stranger.query(api.uploads.urls, { site: 'restaurant', ids: [own] }))
    expect(error.code).toBe('FORBIDDEN')
  })
})

describe('uploads.retry and retryOne', () => {
  const pendingRuns = async (t: Harness, id: Id<'uploads'>) =>
    (await t.run((ctx) => ctx.db.system.query('_scheduled_functions').collect()))
      .filter((f) => f.name === 'uploadsNode:run' && f.state.kind === 'pending' && JSON.stringify(f.args).includes(id)).length

  // Wrong behaviour caught: a failed upload stays failed after the operator "repaired" it (no new run), or the repair touches files that are fine.
  it('re-queues a failed upload (dryRun false) and leaves a ready one alone; a dry run changes nothing', async () => {
    const s = await setup()
    const failed = await upload(s, { type: 'image/jpeg', content: jpeg(16), name: 'kaputt.jpg', ready: false })
    await s.t.mutation(internal.uploads.markFailed, { upload: failed, key: 'errors.uploadRetrying', permanent: true })
    const ready = await upload(s, { name: 'gut.pdf' })
    const before = await pendingRuns(s.t, failed)

    expect(await s.t.mutation(internal.uploads.retry, { site: 'restaurant' })).toMatchObject({ count: 1, ids: [failed] })
    expect(await s.t.run((ctx) => ctx.db.get(failed))).toMatchObject({ status: 'failed', attempts: 1 })
    expect(await pendingRuns(s.t, failed)).toBe(before)

    expect(await s.t.mutation(internal.uploads.retry, { site: 'restaurant', dryRun: false })).toMatchObject({ count: 1, ids: [failed] })
    const row = await s.t.run((ctx) => ctx.db.get(failed))
    expect(row).toMatchObject({ status: 'processing', attempts: 0 })
    expect(row!.error).toBeUndefined()
    expect(await pendingRuns(s.t, failed)).toBe(before + 1)
    expect(await s.t.run((ctx) => ctx.db.get(ready))).toMatchObject({ status: 'ready' })
  })

  // Wrong behaviour caught: a member of another site re-queues, or even learns of, an upload that is not theirs.
  it('retryOne of another site\'s upload is NOT_FOUND, and the owner can re-queue their own', async () => {
    const s = await setup()
    const failed = await upload(s, { type: 'image/jpeg', content: jpeg(16), name: 'kaputt.jpg', ready: false })
    await s.t.mutation(internal.uploads.markFailed, { upload: failed, key: 'errors.uploadRetrying', permanent: true })
    // The stranger owns the site "andere".
    expect((await errorOf(s.as.stranger.mutation(api.uploads.retryOne, { site: 'andere', upload: failed }))).code).toBe('NOT_FOUND')
    expect(await s.t.run((ctx) => ctx.db.get(failed))).toMatchObject({ status: 'failed' })
    expect(await s.as.owner.mutation(api.uploads.retryOne, { site: 'restaurant', upload: failed })).toEqual({ queued: true })
    expect(await s.t.run((ctx) => ctx.db.get(failed))).toMatchObject({ status: 'processing', attempts: 0 })
  })
})
