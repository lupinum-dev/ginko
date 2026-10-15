// Approval is on (SPEC 17): the server answers a write with a proposal and writes nothing. Every Studio
// write path must then say "Sent for approval", offer no Undo, and not read fields a proposal does not have.
// Only the Convex mutations and the toast are replaced; messages come from the real catalogs.
import { ConvexError } from 'convex/values'
import { ConvexCallError, normalizeConvexError } from '@lupinum/better-convex-nuxt/errors'
import { describe, expect, test, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ results: new Map<string, unknown>(), toasts: [] as { text: string; action?: unknown }[] }))
vi.mock('#imports', async () => {
  const { createTranslator } = await import('@lupinum/ginko-i18n/core')
  const { compileCatalogs } = await import('@lupinum/ginko-i18n/compile')
  // The server's error texts join under `server`, as modules/server-messages.ts does.
  const catalogs = compileCatalogs({
    de: { ...(await import('../i18n/de.json')).default, server: (await import('../../ginko-server/i18n/de.json')).default },
    en: { ...(await import('../i18n/en.json')).default, server: (await import('../../ginko-server/i18n/en.json')).default },
  })
  return { useI18n: () => ({ t: createTranslator({ messages: catalogs.en, fallback: catalogs.de, language: 'en', timeZone: 'Europe/Vienna' }).t, format: {}, locale: { value: 'en' } }) }
})

import { opErrorOf, provideLastingOps, useOps } from '../app/composables/useOps'

const holder: { lasting?: unknown } = {}
vi.stubGlobal('useToast', () => ({ show: (text: string, opts?: { action?: unknown }) => mocks.toasts.push({ text, action: opts?.action }) }))
vi.stubGlobal('useConvexMutation', (name: string) => ({ mutate: async () => mocks.results.get(String(name)) }))
vi.stubGlobal('provide', (_key: unknown, value: unknown) => { holder.lasting = value })
vi.stubGlobal('inject', () => holder.lasting)
provideLastingOps()

const ops = useOps({ value: 'demo' } as never)
const proposal = { proposal: 'p1', status: 'open' }
const sent = 'Sent for approval. The owner decides.'

// [path, mutation it calls, a normal result, the call, toasts of a normal result]
const paths: [string, string, unknown, () => Promise<unknown>, number][] = [
  ['saveEntry', 'entries.save', { entry: 'e', rev: 2, change: 'c1' }, () => ops.saveEntry({ entry: 'e', baseRev: 1, fields: {}, op: 'o' }), 1],
  ['createEntry', 'entries.create', { entry: 'e', state: 'live' }, () => ops.createEntry({ brick: 'b', data: {}, op: 'o' }), 1],
  ['removeEntry', 'entries.remove', { entry: 'e', lifeRev: 2 }, () => ops.removeEntry('e', 1), 1],
  ['restoreEntry', 'entries.restore', { entry: 'e', lifeRev: 3 }, () => ops.restoreEntry('e', 2), 1],
  ['publishEntry', 'entries.publish', { entry: 'e', lifeRev: 2 }, () => ops.publishEntry('e', 1, { timeZone: 'Europe/Vienna' }), 1],
  ['unpublishEntry', 'entries.unpublish', { entry: 'e', lifeRev: 2, contentRev: 4 }, () => ops.unpublishEntry('e', 1, { timeZone: 'Europe/Vienna', wasLive: true }), 1],
  ['undoChange', 'entries.undo', { change: 'c2' }, () => ops.undoChange('c1'), 1],
  ['revertEntry', 'entries.revert', { entry: 'e', change: 'c3' }, () => ops.revertEntry('e', 'c1'), 1],
]

describe('writes that become proposals', () => {
  test.each(paths)('%s: proposal says "Sent for approval", no Undo, no throw', async (_name, mutation, _normal, run) => {
    mocks.toasts.length = 0
    mocks.results.set(mutation, proposal)
    await expect(run()).resolves.not.toThrow()
    expect(mocks.toasts).toEqual([{ text: sent, action: undefined }])
  })

  test.each(paths)('%s: a normal result keeps its own toast', async (_name, mutation, normal, run, count) => {
    mocks.toasts.length = 0
    mocks.results.set(mutation, normal)
    await run()
    expect(mocks.toasts).toHaveLength(count)
    expect(mocks.toasts.map((t) => t.text)).not.toContain(sent)
  })
})

describe('failed calls', () => {
  const errors = [{ path: 'name', message: 'Bitte ausfüllen.', code: 'required' }]
  // Wrong behaviour caught: a call that a closed sheet cancelled, or a sign-out in another tab, shows "That did not
  // work" and logs an error; or a server refusal loses its code, text or field errors on the way to the form.
  test.each([
    ['server INVALID', normalizeConvexError(new ConvexError({ code: 'INVALID', key: 'errors.pleaseCheckMarkedFields', message: 'Bitte prüfe die markierten Felder.', details: { errors } }), { functionName: 'entries:save' }),
      { code: 'INVALID', message: 'Please check the marked fields.', details: { errors } }],
    ['CANCELLED', new ConvexCallError({ kind: 'unknown', code: 'CANCELLED', message: 'Convex mutation cancelled: its owning scope was disposed.', functionName: 'entries:save', outcome: 'not-sent' }),
      { code: 'CANCELLED', message: '' }],
    ['IDENTITY_CHANGED', new ConvexCallError({ kind: 'authentication', code: 'IDENTITY_CHANGED', message: 'The signed-in user changed.', functionName: 'entries:save', outcome: 'unknown' }),
      { code: 'IDENTITY_CHANGED', message: 'You were signed out. Sign in and try again.' }],
  ])('%s', (_name, error, expected) => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      expect(opErrorOf(error)).toEqual(expected)
      expect(logged).not.toHaveBeenCalled()
    } finally {
      logged.mockRestore()
    }
  })
})
