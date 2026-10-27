// The stable file address (GET /file/<site>/<upload>/<storage>) and the bundle's `files=stable` opt-in.
import { describe, expect, it } from 'vitest'
import { internal } from '../convex/_generated/api'
import type { Id } from '../convex/_generated/dataModel'
import { setup } from './setup'

type Setup = Awaited<ReturnType<typeof setup>>

/** One upload of `site` with an original, a processed copy and one variant, each stored for real. */
async function image(s: Setup, over: { site?: Id<'sites'>; status?: 'ready' | 'processing'; processed?: boolean } = {}) {
  return s.t.run(async (ctx) => {
    const original = await ctx.storage.store(new Blob(['orig'], { type: 'image/jpeg' }))
    const processed = await ctx.storage.store(new Blob(['webp'], { type: 'image/webp' }))
    const variant = await ctx.storage.store(new Blob(['small'], { type: 'image/webp' }))
    const stray = await ctx.storage.store(new Blob(['other'], { type: 'image/webp' }))
    const upload = await ctx.db.insert('uploads', {
      site: over.site ?? s.site, uploader: 'u-wirtin', storageId: original, ...(over.processed === false ? {} : { processedId: processed }),
      variants: [{ width: 400, storageId: variant }], name: 'bild.jpg', size: 4, mime: 'image/jpeg', width: 800, height: 600,
      status: over.status ?? 'ready', attempts: 0,
    })
    return { upload, original, processed, variant, stray }
  })
}

describe('internal.bundle.fileUrl', () => {
  // Wrong behaviour caught: the route serves a file to the wrong site, a file of a half-processed upload, or any storage id.
  it('answers a storage URL only for a ready upload of that site and a storage id the upload owns', async () => {
    const s = await setup()
    const f = await image(s)
    const ask = (slug: string, upload: string, storage: string) => s.t.query(internal.bundle.fileUrl, { slug, upload, storage })
    expect(await ask('restaurant', f.upload, f.processed)).toMatch(/^https?:\/\//)
    expect(await ask('restaurant', f.upload, f.variant)).toMatch(/^https?:\/\//)
    expect(await ask('restaurant', f.upload, f.original)).toBeNull() // the processed copy replaces the original
    expect(await ask('restaurant', f.upload, f.stray)).toBeNull()
    expect(await ask('andere', f.upload, f.processed)).toBeNull()
    expect(await ask('restaurant', 'not-an-id', f.processed)).toBeNull()

    const bare = await image(s, { processed: false })
    expect(await ask('restaurant', bare.upload, bare.original)).toMatch(/^https?:\/\//)
    const processing = await image(s, { status: 'processing' })
    expect(await ask('restaurant', processing.upload, processing.processed)).toBeNull()
  })

  it('GET /file answers 302 with a short cache for a valid address and 404 otherwise', async () => {
    const s = await setup()
    const f = await image(s)
    const ok = await s.t.fetch(`/file/restaurant/${f.upload}/${f.processed}`, { redirect: 'manual' })
    expect(ok.status).toBe(302)
    expect(ok.headers.get('cache-control')).toBe('public, max-age=3600')
    expect(ok.headers.get('location')).toBeTruthy()
    expect((await s.t.fetch(`/file/andere/${f.upload}/${f.processed}`, { redirect: 'manual' })).status).toBe(404)
    expect((await s.t.fetch(`/file/restaurant/${f.upload}/${f.stray}`, { redirect: 'manual' })).status).toBe(404)
  })
})

describe('bundle files=stable', () => {
  // Wrong behaviour caught: a public page keeps a storage host in its HTML, or an old site version loses its live URLs.
  it('uses /__ginko/file/<upload>/<storage> for the file and its variants without a storage host; without it the URLs are unchanged', async () => {
    const s = await setup()
    const f = await image(s)
    await s.t.run(async (ctx) => {
      const entry = (await ctx.db.get(s.entries.weinabend! as Id<'entries'>))!
      await ctx.db.patch(entry._id, { data: { ...entry.data, image: { file: f.upload, alt: { de: 'Wein' } } } })
    })
    const image_of = async (query: string) => {
      const bundle = (await (await s.t.fetch(`/bundle/restaurant?format=3&locale=de${query}`)).json()) as { bricks: Record<string, { items?: { id: string; data: { image?: { url: string; variants?: { url: string }[] } } }[] }> }
      return Object.values(bundle.bricks).flatMap((brick) => brick.items ?? []).find((item) => item.id === s.entries.weinabend)!.data.image!
    }
    const stable = await image_of('&files=stable')
    expect(stable.url).toBe(`/__ginko/file/${f.upload}/${f.processed}`)
    expect(stable.variants![0]!.url).toBe(`/__ginko/file/${f.upload}/${f.variant}`)
    expect(JSON.stringify(stable)).not.toContain('convex')
    const live = await image_of('')
    expect(live.url).toMatch(/^https?:\/\/.+\/api\/storage\//)
    expect(live.variants![0]!.url).toMatch(/\/api\/storage\//)
  })
})
