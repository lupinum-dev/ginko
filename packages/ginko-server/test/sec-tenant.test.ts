// Tenant isolation: the owner of site "andere" calls every public query, mutation and action with the restaurant's ids,
// once naming the restaurant and once naming "andere". Wrong behaviour caught: any answer that carries the
// restaurant's content, or any change to the restaurant's rows. Add a call here when a public function is added.
import type { Schema } from '@lupinum/ginko/internal'
import type { FunctionReference } from 'convex/server'
import { describe, expect, it, vi } from 'vitest'
import { api } from '../convex/_generated/api'
import { firstPage, opId, publicFunctions, setup, upload } from './setup'

type S = Awaited<ReturnType<typeof setup>>

async function fixtures(s: S) {
  vi.stubEnv('GINKO_MAIL', 'outbox')
  vi.stubEnv('SITE_URL', 'https://ginko.test')
  // The cook's menu tasks need approval so that a proposal exists.
  await s.t.run(async (ctx) => {
    const site = (await ctx.db.get(s.site))!
    const schema = site.schema as Schema
    for (const task of schema.bricks.menu!.tasks ?? []) (task as { needsApproval?: boolean }).needsApproval = true
    await ctx.db.patch(s.site, { schema })
  })
  const entry = s.entries['menu-saibling']!
  const file = await upload(s, { person: 'owner', ready: true })
  const folder = await s.as.owner.mutation(api.files.createFolder, { site: 'restaurant', name: 'GEHEIM-ORDNER' })
  const save = await s.as.owner.mutation(api.entries.save, { site: 'restaurant', opId: opId(), entry: s.entries['menu-frittaten']!, baseRev: 1, fields: { price: { amount: 1111 } } }) as { change: string }
  const proposal = await s.as.cook.mutation(api.entries.save, { site: 'restaurant', opId: opId(), task: 'menu.price', entry, baseRev: 1, fields: { price: { amount: 1500 } } }) as { proposal: string }
  const release = (await s.as.owner.mutation(api.proposals.createRelease, { site: 'restaurant', name: 'GEHEIM-RELEASE' }) as { release: string }).release
  const member = await s.t.run(async (ctx) => (await ctx.db.query('memberships').collect()).find((m) => m.user === 'u-koch')!._id)
  const invite = (await s.as.owner.mutation(api.invites.create, { site: 'restaurant', email: 'geheim@example.com', role: 'staff', grants: [] }) as { invite: string }).invite
  const pushKey = await s.as.owner.mutation(api.release.createPushKey, { site: 'restaurant', label: 'ci', scopes: ['release'] })
  const agentKey = await s.as.owner.mutation(api.agent.createKey, { site: 'restaurant', label: 'ownerkey' })
  const view = (await s.as.owner.mutation(api.views.save, { site: 'restaurant', brick: 'menu', name: 'GEHEIM-VIEW', query: {} }) as { id: string }).id
  // A removed entry for entries.purge, and a notice that points at the Saibling, so entries.usedBy has a use to leak.
  const removed = s.entries['menu-schnitzel']!
  await s.as.owner.mutation(api.entries.remove, { site: 'restaurant', opId: opId(), entry: removed, lifeRev: 1 })
  const user = s.entries['notice-ausgebucht']!
  await s.t.run(async (ctx) => {
    const site = (await ctx.db.get(s.site))!
    const schema = site.schema as Schema
    schema.bricks.notices!.fields.dish = { type: 'ref', to: 'menu', label: { de: 'Gericht' } }
    await ctx.db.patch(s.site, { schema })
    const row = (await ctx.db.get(user))!
    await ctx.db.patch(user, { data: { ...row.data, dish: entry } })
  })
  expect(await s.as.owner.query(api.entries.usedBy, { site: 'restaurant', entry })).toMatchObject([{ entry: user }])
  return { entry, file: file as string, folder: folder as string, change: save.change, proposal: proposal.proposal, release, member: member as string, invite, pushKey, agentKey, view, removed, user }
}

type Fx = Awaited<ReturnType<typeof fixtures>>
type Call = { fn: string; kind: 'query' | 'mutation' | 'action'; args: (site: string, f: Fx) => Record<string, unknown> }
const o = () => opId()
const calls: Call[] = [
  { fn: 'changes.list', kind: 'query', args: (site, f) => ({ site, paginationOpts: firstPage, entry: f.entry }) },
  { fn: 'changes.list#nofilter', kind: 'query', args: (site) => ({ site, paginationOpts: firstPage }) },
  { fn: 'changes.get', kind: 'query', args: (site, f) => ({ site, change: f.change }) },
  { fn: 'agent.createKey', kind: 'mutation', args: (site) => ({ site, label: 'x' }) },
  { fn: 'agent.keys', kind: 'query', args: (site) => ({ site }) },
  { fn: 'agent.revokeKey', kind: 'mutation', args: (site, f) => ({ site, key: f.agentKey.id }) },
  { fn: 'agent.setKeyReview', kind: 'mutation', args: (site, f) => ({ site, key: f.agentKey.id, review: false }) },
  { fn: 'files.list', kind: 'query', args: (site, f) => ({ site, view: 'all', folder: f.folder }) },
  { fn: 'files.list#dup', kind: 'query', args: (site) => ({ site, view: 'duplicates' }) },
  { fn: 'files.list#trash', kind: 'query', args: (site) => ({ site, view: 'trash' }) },
  { fn: 'files.info', kind: 'query', args: (site, f) => ({ site, file: f.file }) },
  { fn: 'files.counts', kind: 'query', args: (site) => ({ site }) },
  { fn: 'files.folders', kind: 'query', args: (site) => ({ site }) },
  { fn: 'files.createFolder', kind: 'mutation', args: (site, f) => ({ site, name: 'x', parent: f.folder }) },
  { fn: 'files.renameFolder', kind: 'mutation', args: (site, f) => ({ site, folder: f.folder, name: 'pwned' }) },
  { fn: 'files.moveFolder', kind: 'mutation', args: (site, f) => ({ site, folder: f.folder, parent: null }) },
  { fn: 'files.deleteFolder', kind: 'mutation', args: (site, f) => ({ site, folder: f.folder }) },
  { fn: 'files.move', kind: 'mutation', args: (site, f) => ({ site, files: [f.file], folder: f.folder }) },
  { fn: 'files.rename', kind: 'mutation', args: (site, f) => ({ site, file: f.file, name: 'pwned.pdf' }) },
  { fn: 'files.setFocus', kind: 'mutation', args: (site, f) => ({ site, file: f.file, focus: null }) },
  { fn: 'files.setAlt', kind: 'mutation', args: (site, f) => ({ site, file: f.file, locale: 'de', text: 'pwned' }) },
  { fn: 'files.keep', kind: 'mutation', args: (site, f) => ({ site, files: [f.file] }) },
  { fn: 'files.trash', kind: 'mutation', args: (site, f) => ({ site, files: [f.file] }) },
  { fn: 'files.restore', kind: 'mutation', args: (site, f) => ({ site, files: [f.file] }) },
  { fn: 'files.replace', kind: 'mutation', args: (site, f) => ({ site, file: f.file, upload: f.file }) },
  { fn: 'invites.create', kind: 'mutation', args: (site) => ({ site, email: 'evil@example.com', role: 'staff', grants: [] }) },
  { fn: 'invites.revoke', kind: 'mutation', args: (site, f) => ({ site, invite: f.invite }) },
  { fn: 'invites.acceptMine', kind: 'mutation', args: (_s, f) => ({ invite: f.invite }) },
  { fn: 'entries.save', kind: 'mutation', args: (site, f) => ({ site, opId: o(), entry: f.entry, baseRev: 1, fields: { price: { amount: 1 } } }) },
  { fn: 'entries.undo', kind: 'mutation', args: (site, f) => ({ site, opId: o(), change: f.change }) },
  { fn: 'entries.versionAt', kind: 'query', args: (site, f) => ({ site, entry: f.entry, change: f.change }) },
  { fn: 'entries.revert', kind: 'mutation', args: (site, f) => ({ site, opId: o(), entry: f.entry, change: f.change }) },
  { fn: 'entries.create', kind: 'mutation', args: (site) => ({ site, opId: o(), brick: 'menu', data: {} }) },
  { fn: 'entries.duplicate', kind: 'mutation', args: (site, f) => ({ site, opId: o(), entry: f.entry }) },
  { fn: 'entries.remove', kind: 'mutation', args: (site, f) => ({ site, opId: o(), entry: f.entry, lifeRev: 1 }) },
  { fn: 'entries.purge', kind: 'mutation', args: (site, f) => ({ site, opId: o(), entry: f.removed, lifeRev: 2 }) },
  { fn: 'entries.usedBy', kind: 'query', args: (site, f) => ({ site, entry: f.entry }) },
  { fn: 'entries.trashOverflow', kind: 'query', args: (site, f) => ({ site, entry: f.entry }) },
  { fn: 'entries.restore', kind: 'mutation', args: (site, f) => ({ site, opId: o(), entry: f.entry, lifeRev: 1 }) },
  { fn: 'entries.publish', kind: 'mutation', args: (site, f) => ({ site, opId: o(), entry: f.entry, lifeRev: 1 }) },
  { fn: 'entries.unpublish', kind: 'mutation', args: (site, f) => ({ site, opId: o(), entry: f.entry, lifeRev: 1 }) },
  { fn: 'entries.move', kind: 'mutation', args: (site, f) => ({ site, opId: o(), entry: f.entry, direction: 'down' }) },
  { fn: 'entries.removed', kind: 'query', args: (site) => ({ site, brick: 'menu' }) },
  { fn: 'entries.trash', kind: 'query', args: (site) => ({ site, paginationOpts: firstPage }) },
  { fn: 'entries.whyNotPublic', kind: 'query', args: (site, f) => ({ site, entry: f.entry }) },
  { fn: 'entries.list', kind: 'query', args: (site) => ({ site, brick: 'menu' }) },
  { fn: 'entries.list#search', kind: 'query', args: (site) => ({ site, brick: 'menu', search: 'Saibling' }) },
  { fn: 'entries.get', kind: 'query', args: (site, f) => ({ site, entry: f.entry }) },
  { fn: 'entries.single', kind: 'query', args: (site) => ({ site, brick: 'hours' }) },
  { fn: 'entries.titles', kind: 'query', args: (site) => ({ site, brick: 'menu' }) },
  { fn: 'entries.ofBricks', kind: 'query', args: (site) => ({ site, bricks: ['menu', 'hours', 'notices'] }) },
  { fn: 'release.createPushKey', kind: 'mutation', args: (site) => ({ site, label: 'x', scopes: ['release', 'export'] }) },
  { fn: 'release.revokePushKey', kind: 'mutation', args: (site, f) => ({ site, key: f.pushKey.id }) },
  { fn: 'members.list', kind: 'query', args: (site) => ({ site }) },
  { fn: 'members.setGrants', kind: 'mutation', args: (site, f) => ({ site, member: f.member, grants: [] }) },
  { fn: 'members.remove', kind: 'mutation', args: (site, f) => ({ site, member: f.member }) },
  { fn: 'search.studio', kind: 'query', args: (site) => ({ site, query: 'Saibling' }) },
  { fn: 'proposals.approve', kind: 'mutation', args: (_s, f) => ({ proposal: f.proposal }) },
  { fn: 'proposals.reject', kind: 'mutation', args: (_s, f) => ({ proposal: f.proposal, reason: 'nope' }) },
  { fn: 'proposals.withdraw', kind: 'mutation', args: (_s, f) => ({ proposal: f.proposal }) },
  { fn: 'proposals.list', kind: 'query', args: (site) => ({ site, paginationOpts: firstPage }) },
  { fn: 'proposals.mine', kind: 'query', args: (site) => ({ site }) },
  { fn: 'proposals.count', kind: 'query', args: (site) => ({ site }) },
  { fn: 'proposals.get', kind: 'query', args: (site, f) => ({ site, proposal: f.proposal }) },
  { fn: 'proposals.releases', kind: 'query', args: (site) => ({ site }) },
  { fn: 'proposals.createRelease', kind: 'mutation', args: (site) => ({ site, name: 'x' }) },
  { fn: 'proposals.addToRelease', kind: 'mutation', args: (_s, f) => ({ release: f.release, proposal: f.proposal }) },
  { fn: 'proposals.removeFromRelease', kind: 'mutation', args: (_s, f) => ({ release: f.release, proposal: f.proposal }) },
  { fn: 'proposals.approveRelease', kind: 'mutation', args: (_s, f) => ({ release: f.release }) },
  { fn: 'uploads.prepare', kind: 'mutation', args: (site, f) => ({ site, folder: f.folder }) },
  { fn: 'uploads.get', kind: 'query', args: (site, f) => ({ site, upload: f.file }) },
  { fn: 'uploads.urls', kind: 'query', args: (site, f) => ({ site, ids: [f.file] }) },
  { fn: 'tasks.prefill', kind: 'query', args: (site, f) => ({ site, task: 'menu.edit', entry: f.entry }) },
  { fn: 'sites.meta', kind: 'query', args: (site) => ({ site }) },
  { fn: 'sites.setAgentReview', kind: 'mutation', args: (site) => ({ site, review: false }) },
  { fn: 'sites.deletion', kind: 'query', args: (site) => ({ site }) },
  // A wrong confirmation: against "andere" the call stops there instead of really starting the deletion of the attacker's own site.
  { fn: 'sites.startDeletion', kind: 'mutation', args: (site) => ({ site, confirm: 'nope' }) },
  { fn: 'sites.cancelDeletion', kind: 'mutation', args: (site) => ({ site }) },
  { fn: 'sites.translationStatus', kind: 'query', args: (site) => ({ site }) },
  { fn: 'views.save', kind: 'mutation', args: (site, f) => ({ site, id: f.view, brick: 'menu', name: 'pwned', query: {} }) },
  { fn: 'views.remove', kind: 'mutation', args: (site, f) => ({ site, id: f.view }) },
  { fn: 'views.list', kind: 'query', args: (site) => ({ site, brick: 'menu' }) },
  // Against "andere" it stops at the missing refresh key, before anything is fetched.
  { fn: 'refresh.urgentRefresh', kind: 'action', args: (site) => ({ site, opId: o() }) },
]

const SECRETS = ['GEHEIM', 'Saibling', 'Frittaten', 'Gasthaus', 'koch@example.com', 'wirtin@example.com', 'geheim@example.com']

/** Everything in the database that belongs to the restaurant, as comparable text. */
async function snapshot(s: S) {
  return s.t.run(async (ctx) => {
    const out: Record<string, string[]> = {}
    for (const table of ['sites', 'entries', 'memberships', 'invites', 'agentKeys', 'pushKeys', 'uploads', 'folders', 'proposals', 'releases', 'views', 'changes', 'fileRefs', 'admins', 'uploadTickets'] as const) {
      const rows = await ctx.db.query(table).collect()
      out[table] = rows.filter((r) => (r as { site?: unknown }).site === s.site || table === 'sites' && r._id === s.site || table === 'admins').map((r) => JSON.stringify(r)).sort()
    }
    return out
  })
}

describe('tenant isolation: owner of "andere" against "restaurant"', () => {
  for (const target of ['restaurant', 'andere'] as const) {
    it(`every public query/mutation/action, site="${target}" with restaurant ids`, async () => {
      const s = await setup()
      const f = await fixtures(s)
      const before = await snapshot(s)
      const leaks: string[] = []
      for (const c of calls) {
        const name = c.fn.split('#')[0]!
        const [mod, fnName] = name.split('.') as [keyof typeof api, string]
        const ref = (api[mod] as unknown as Record<string, FunctionReference<'query' | 'mutation' | 'action'>>)[fnName]!
        const args = c.args(target, f)
        try {
          const result = c.kind === 'query' ? await s.as.stranger.query(ref, args) : c.kind === 'mutation' ? await s.as.stranger.mutation(ref, args) : await s.as.stranger.action(ref, args)
          const text = JSON.stringify(result)
          const hit = SECRETS.filter((x) => text.includes(x)).concat([f.entry, f.file, f.folder, f.change, f.proposal, f.member, f.removed, f.user].filter((x) => text.includes(x)))
          if (hit.length && !['uploads.urls', 'sites.meta'].includes(name)) leaks.push(`${c.fn}: ${hit.join(',')}`)
        } catch {
          // Refused: the expected answer for a stranger.
        }
      }
      expect(leaks).toEqual([])
      const after = await snapshot(s)
      // The attacker's own site may change (target=andere); the restaurant must not.
      expect(after).toEqual(before)
    })
  }
})

/**
 * Public functions that take no site, so no other site's owner can name one: each acts only on the caller's own
 * account, or on an invite whose secret token (or invited address) is the permission.
 */
const NO_SITE: Record<string, string> = {
  'account.settings': "the caller's own settings",
  'account.setRemindByMail': "the caller's own settings",
  'account.sawLocale': "the caller's own settings",
  'account.setLocale': "the caller's own settings",
  'account.deleteAccount': "the caller's own account",
  'invites.peek': 'the token is the permission (breakit-access: invitation tokens)',
  'invites.accept': 'the token and the invited address are the permission (breakit-access: invitation tokens)',
  'invites.mine': "invites to the caller's own address",
  'sites.mine': "the caller's own memberships",
  'sites.create': 'makes a new site for the caller',
  'mail.signInAvailable': 'answers only whether mail is set up',
}

// Wrong behaviour caught: a new public function ships without a tenant probe, because nobody added it to `calls`.
it('the call list names every public query, mutation and action, or says why it takes no site', async () => {
  const probed = new Set([...calls.map((c) => c.fn.split('#')[0]!), ...Object.keys(NO_SITE)])
  expect([...probed].sort()).toEqual(await publicFunctions())
})
