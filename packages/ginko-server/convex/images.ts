'use node'
// srcset variants for images processed before variants existed: a migration step after deploys, and the follow-up of
// an import whose images came without variants (seed.ts).
import { v } from 'convex/values'
import { internal } from './_generated/api'
import { internalAction, type ActionCtx } from './_generated/server'
import sharp from 'sharp'
import { makeVariants } from './image'
import { stepArgs } from './lib/migrations'

const BATCH = 20

/** Makes variants for the ready images without any in one page of `BATCH` uploads; returns the next page's cursor or null. */
async function variantsPage(ctx: ActionCtx, cursor: string | null): Promise<string | null> {
  const { todo, next } = await ctx.runQuery(internal.uploads.variantsTodo, { cursor, numItems: BATCH })
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
  return next
}

/** After an import: makes the missing variants page by page and reschedules itself until the last page. */
export const backfillVariants = internalAction({
  args: { cursor: v.optional(v.union(v.string(), v.null())) },
  handler: async (ctx, args): Promise<null> => {
    const next = await variantsPage(ctx, args.cursor ?? null)
    if (next !== null) await ctx.scheduler.runAfter(0, internal.images.backfillVariants, { cursor: next })
    return null
  },
})

/**
 * The same as a migration step (lib/migrations.ts). A crash between its storage writes and `advance` repeats the page,
 * which is safe: it only touches images without variants, and `setVariants` refuses a file that changed meanwhile.
 */
export const variantsMigration = internalAction({
  args: stepArgs,
  handler: async (ctx, args): Promise<null> => {
    const next = await variantsPage(ctx, args.cursor)
    await ctx.runMutation(internal.migrations.advance, { run: args.run, next })
    return null
  },
})
