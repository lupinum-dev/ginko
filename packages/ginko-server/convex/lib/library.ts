// Shared by uploads (sweep), files (library) and retention: removing stored files and upload rows.
import type { Doc, Id } from '../_generated/dataModel'
import type { MutationCtx } from '../_generated/server'

/** Deletes a stored file if it still exists; a file can be named twice (PDF: original is processed). */
export async function deleteStorage(ctx: MutationCtx, storageId: Id<'_storage'> | undefined) {
  if (storageId && await ctx.db.system.get(storageId)) await ctx.storage.delete(storageId)
}

/** Deletes the files of one entry of `previous`. */
export async function deletePrevious(ctx: MutationCtx, old: NonNullable<Doc<'uploads'>['previous']>[number]) {
  await deleteStorage(ctx, old.storageId)
  await deleteStorage(ctx, old.processedId)
  for (const variant of old.variants ?? []) await deleteStorage(ctx, variant.storageId)
}

/** Removes an upload row with its stored files and the files of earlier versions. */
export async function purgeUpload(ctx: MutationCtx, row: Doc<'uploads'>) {
  await deleteStorage(ctx, row.storageId)
  await deleteStorage(ctx, row.processedId)
  for (const variant of row.variants ?? []) await deleteStorage(ctx, variant.storageId)
  for (const old of row.previous ?? []) await deletePrevious(ctx, old)
  for (const ref of await ctx.db.query('fileRefs').withIndex('by_file', (q) => q.eq('file', row._id)).collect()) await ctx.db.delete(ref._id)
  await ctx.db.delete(row._id)
}

/** The 7-day sweep skips kept, foldered and trashed uploads (the trash has its own 30-day rule). */
export const isKeptUpload = (row: Doc<'uploads'>) => !!(row.kept || row.folder || row.trashedAt)
