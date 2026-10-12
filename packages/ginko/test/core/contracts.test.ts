import { describe, expect, it } from 'vitest'
import { check, demos, type DemoName } from '../../../../scripts/contracts.ts'

// Wrong behaviour caught: a change to the core (schema serialization, validation, resolveEntry, buildBundle)
// or to a demo schema that changes what a site receives in bundle format 3, without a reviewed `--write`.
describe('contract corpus (bundle format 3)', () => {
  it.each(Object.keys(demos) as DemoName[])('%s: schema, data and bundles match the committed files', async (demo) => {
    expect(await check(demo)).toEqual([])
  })
})
