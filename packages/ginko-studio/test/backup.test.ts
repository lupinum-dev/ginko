// @vitest-environment happy-dom
// The backup download (Team > Sicherung): the entries of the ZIP (utils/backup.ts), the folder `ginko export` writes
// with no file silently missing, and the 1 GB limit of browsers that build it in memory. The German catalog is the
// real one; Convex is replaced.
import { flushPromises, mount } from '@vue/test-utils'
import { ref } from 'vue'
import { expect, test, vi } from 'vitest'
import { useI18n } from '#imports'
import { backupEntries } from '../app/utils/backup'
import SiteBackup from '../app/components/SiteBackup.vue'

const now = new Date('2026-10-15T09:00:00Z')
const answer = {
  format: 1, site: 'restaurant', name: 'Gasthaus zur Linde', exportedAt: '2026-10-15T09:00:00.000Z', entries: [{ id: 'e1', brick: 'menu' }],
  files: [
    { id: 'f1', name: 'kueche.jpg', mime: 'image/webp', size: 4, width: 640, url: 'https://files.test/1' },
    { id: 'f2', name: 'karte.pdf', mime: 'application/pdf', size: 3, url: 'https://files.test/2' },
  ],
}
const served = (bodies: Record<string, string>, status = 200) => async (url: string) => new Response(bodies[url], { status })
const all = async <T>(entries: AsyncIterable<T>) => {
  const out: T[] = []
  for await (const entry of entries) out.push(entry)
  return out
}

// Wrong behaviour caught (admin-3): a Studio backup in its own layout, which `local:import` cannot read, or with the
// signed file URLs in export.json.
test('the ZIP holds the export folder: each file at its export path, then export.json naming those paths', async () => {
  const entries = await all(backupEntries(answer, { now, fetch: served({ 'https://files.test/1': 'webp', 'https://files.test/2': 'pdf' }) }))
  expect(entries.map((e) => e.name)).toEqual([
    'ginko-export-restaurant-2026-10-15/files/f1.webp',
    'ginko-export-restaurant-2026-10-15/files/f2.pdf',
    'ginko-export-restaurant-2026-10-15/export.json',
  ])
  expect(JSON.parse(entries[2]!.input as string)).toEqual({
    format: 1, site: 'restaurant', name: 'Gasthaus zur Linde', exportedAt: '2026-10-15T09:00:00.000Z', entries: [{ id: 'e1', brick: 'menu' }],
    files: [
      { id: 'f1', name: 'kueche.jpg', mime: 'image/webp', size: 4, width: 640, path: 'files/f1.webp' },
      { id: 'f2', name: 'karte.pdf', mime: 'application/pdf', size: 3, path: 'files/f2.pdf' },
    ],
  })
})

// Wrong behaviour caught: a cut-off or refused download became a backup that silently misses a picture.
test.each([
  ['comes back short', served({ 'https://files.test/1': 'webp', 'https://files.test/2': 'pd' }), 'karte.pdf'],
  ['is refused', served({}, 403), 'kueche.jpg'],
  ['cannot be reached', async () => { throw new TypeError('Failed to fetch') }, 'kueche.jpg'],
] as const)('a file that %s stops the backup and is named', async (_case, fetch, file) => {
  await expect(all(backupEntries(answer, { now, fetch }))).rejects.toMatchObject({ file })
})

// Wrong behaviour caught: in Safari or Firefox (no save dialog with a file stream) a site over 1 GB started loading
// every file into the tab's memory, which runs out, instead of saying so first.
test('without a file stream, a backup over 1 GB says so before any file loads', async () => {
  Object.entries({ ref, useI18n }).forEach(([name, fn]) => vi.stubGlobal(name, fn))
  vi.stubGlobal('useConvex', () => ({ query: async () => ({ ...answer, files: [{ ...answer.files[0]!, size: 1.5 * 1024 ** 3 }] }) }))
  const fetched = vi.fn()
  vi.stubGlobal('fetch', fetched)
  const wrapper = mount(SiteBackup, { props: { slug: 'restaurant' } })
  await wrapper.get('button').trigger('click')
  await flushPromises()
  expect(wrapper.text()).toContain('Mit 1,5 GB ist die Sicherung zu groß für diesen Browser. In Chrome oder Edge geht es.')
  expect(fetched).not.toHaveBeenCalled()
  vi.unstubAllGlobals()
})
