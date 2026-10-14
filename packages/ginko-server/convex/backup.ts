// Read side of `ginko export` and `pnpm local:pull` (SPEC 9, 12). The CLI reaches `snapshot` through
// GET /export (routes/export.ts), which resolves the push key to its site first.
import type { Json } from '@lupinum/ginko'
import { v } from 'convex/values'
import type { Id } from './_generated/dataModel'
import { internalQuery } from './_generated/server'
import { fail } from './lib/access'

/** The format of the export file. It changes only with an incompatible change of the shape below. */
export const EXPORT_FORMAT = 1

/**
 * Everything of one site in one read: schema, every entry (deleted ones too) and every ready upload
 * that an entry references, each with a signed storage URL. People, changes and ops are not part of it.
 * A processed image is a WebP copy, so `mime` names the exported bytes, not the original upload.
 */
export const snapshot = internalQuery({
  args: { site: v.id('sites') },
  handler: async (ctx, args) => {
    const site = await ctx.db.get(args.site)
    if (!site) fail('SITE_NOT_FOUND', 'errors.siteNotFound')
    const entries = await ctx.db.query('entries').withIndex('by_site_brick_order', (q) => q.eq('site', args.site)).collect()

    const referenced = new Set<Id<'uploads'>>()
    for (const entry of entries) {
      const refs = await ctx.db.query('fileRefs').withIndex('by_holder', (q) => q.eq('holder', 'entry').eq('holderId', entry._id)).collect()
      for (const ref of refs) referenced.add(ref.file)
    }
    // Library files that no entry uses yet (kept or in a folder) belong to a backup too.
    const library = await ctx.db.query('uploads').withIndex('by_site', (q) => q.eq('site', args.site)).collect()
    for (const upload of library) if ((upload.kept || upload.folder) && !upload.trashedAt) referenced.add(upload._id)
    const files = []
    for (const id of referenced) {
      const upload = await ctx.db.get(id)
      if (!upload || upload.site !== args.site || upload.status !== 'ready') continue
      const stored = upload.processedId ?? upload.storageId
      const url = await ctx.storage.getUrl(stored)
      if (!url) continue
      files.push({
        id: upload._id,
        name: upload.name,
        mime: stored === upload.storageId ? upload.mime : 'image/webp',
        size: upload.size,
        ...(upload.width === undefined ? {} : { width: upload.width }),
        ...(upload.height === undefined ? {} : { height: upload.height }),
        url,
        ...(upload.folder === undefined ? {} : { folder: upload.folder }),
        ...(upload.kept ? { kept: true } : {}),
        ...(upload.focus === undefined ? {} : { focus: upload.focus }),
        ...(upload.sha256 === undefined ? {} : { sha256: upload.sha256 }),
      })
    }

    return {
      format: EXPORT_FORMAT,
      site: site.slug,
      name: site.name,
      schema: site.schema as Json,
      schemaRev: site.schemaRev,
      contentRev: site.contentRev,
      exportedAt: new Date().toISOString(),
      entries: entries.map((e) => ({
        id: e._id, brick: e.brick, kind: e.kind, order: e.order, data: e.data as Json, prints: e.prints, rev: e.rev,
        ...(e.deletedAt === undefined ? {} : { deletedAt: e.deletedAt }),
        // Drafts keep their state in a backup (SPEC 15); a missing state means live.
        ...(e.state === undefined ? {} : { state: e.state }),
        ...(e.publishAt === undefined ? {} : { publishAt: e.publishAt }),
        // What the bundle shows as updatedAt, so a restored site keeps it (an entry from before contentAt counts from its creation).
        contentAt: e.contentAt ?? e._creationTime,
      })),
      folders: (await ctx.db.query('folders').withIndex('by_site_parent', (q) => q.eq('site', args.site)).collect())
        .map((f) => ({ id: f._id, name: f.name, ...(f.parent === undefined ? {} : { parent: f.parent }) })),
      files,
    }
  },
})
