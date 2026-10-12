'use node'
// Check and processing of uploads (SPEC 4.3 point 2). Node runtime because sharp is native.
// Scheduled by uploads.register and by uploads.markFailed (retries); safe to run twice.
// The first bytes must match the declared type; a PDF is then ready as is, an image is processed.
import { v } from 'convex/values'
import { createHash } from 'node:crypto'
import { internal } from './_generated/api'
import { internalAction } from './_generated/server'
import { processImage, UnreadableImageError } from './image'
import { kindOf, WRONG_CONTENT } from './lib/files'


export const run = internalAction({
  args: { upload: v.id('uploads') },
  handler: async (ctx, { upload }) => {
    const row = await ctx.runQuery(internal.uploads.load, { upload })
    if (!row || row.status !== 'processing') return null

    const original = await ctx.storage.get(row.storageId)
    if (!original) {
      await ctx.runMutation(internal.uploads.markFailed, { upload, key: 'errors.uploadMissing', permanent: true })
      return null
    }

    const bytes = new Uint8Array(await original.arrayBuffer())
    if (!kindOf(row.mime)?.signature(bytes)) {
      await ctx.runMutation(internal.uploads.markFailed, { upload, key: WRONG_CONTENT.key, permanent: true })
      return null
    }
    // The hash of the original bytes finds the same file uploaded twice (library view "Doppelt").
    const sha256 = createHash('sha256').update(bytes).digest('hex')
    if (row.mime === 'application/pdf') {
      await ctx.runMutation(internal.uploads.markFileReady, { upload, sha256 })
      return null
    }

    let result: Awaited<ReturnType<typeof processImage>>
    try {
      result = await processImage(bytes)
    } catch (error) {
      const permanent = error instanceof UnreadableImageError
      const key = !permanent ? 'errors.uploadRetrying' : row.mime === 'image/heic' ? 'errors.uploadHeicUnreadable' : 'errors.uploadNotAnImage'
      await ctx.runMutation(internal.uploads.markFailed, { upload, key, permanent })
      return null
    }

    const processedId = await ctx.storage.store(new Blob([result.bytes], { type: 'image/webp' }))
    const variants = await Promise.all(result.variants.map(async (variant) => ({
      width: variant.width,
      storageId: await ctx.storage.store(new Blob([variant.bytes], { type: 'image/webp' })),
    })))
    const applied = await ctx.runMutation(internal.uploads.markReady, {
      upload,
      processedId,
      size: result.bytes.byteLength,
      width: result.width,
      height: result.height,
      variants,
      sha256,
    })
    // Another run finished first (or the row is gone): the new copies would be unreferenced.
    if (!applied) await Promise.all([processedId, ...variants.map((x) => x.storageId)].map((id) => ctx.storage.delete(id)))
    return null
  },
})
