'use node'
// Backfill of srcset variants for images processed before variants existed (run by hand once per deployment).
import { v } from 'convex/values'
import { internal } from './_generated/api'
import { internalAction } from './_generated/server'
import sharp from 'sharp'
import { makeVariants } from './image'

const BATCH = 20

/** Makes variants for ready images that have none, `BATCH` rows at a time, and reschedules itself until the last page. */
export const backfillVariants = internalAction({
  args: { cursor: v.optional(v.union(v.string(), v.null())) },
  handler: async (ctx, args) => {
    const { todo, next } = await ctx.runQuery(internal.uploads.variantsTodo, { cursor: args.cursor ?? null, numItems: BATCH })
    for (const { upload, processedId } of todo) {
      const stored = await ctx.storage.get(processedId)
      if (!stored) continue
      const bytes = new Uint8Array(await stored.arrayBuffer())
      let made: Awaited<ReturnType<typeof makeVariants>>
      try {
        made = await makeVariants(bytes, (await sharp(bytes).metadata()).width ?? 0)
      } catch {
        continue // unreadable: stays without variants and is skipped again next time
      }
      const variants = await Promise.all(made.map(async (x) => ({ width: x.width, storageId: await ctx.storage.store(new Blob([x.bytes], { type: 'image/webp' })) })))
      const applied = await ctx.runMutation(internal.uploads.setVariants, { upload, processedId, variants })
      if (!applied) await Promise.all(variants.map((x) => ctx.storage.delete(x.storageId)))
    }
    if (next !== null) await ctx.scheduler.runAfter(0, internal.images.backfillVariants, { cursor: next })
    return null
  },
})
