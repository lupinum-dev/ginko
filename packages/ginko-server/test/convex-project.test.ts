// The Convex CLI keeps a package out of the bundle only when it is in the package.json nearest to the folder where
// the CLI runs and the functions resolve it from that folder's node_modules (convex/src/bundler/external.ts).
// A convex.json anywhere else bundles `sharp` without a warning, and the deploy then fails on Convex's Linux runtime.
import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const server = new URL('../', import.meta.url)
const read = <T>(file: string) => JSON.parse(readFileSync(new URL(file, server), 'utf8')) as T

describe('the Convex project', () => {
  it('convex.json sits next to the package.json that lists every external package', () => {
    const convex = read<{ functions: string; node: { externalPackages: string[] } }>('convex.json')
    const { dependencies } = read<{ dependencies: Record<string, string> }>('package.json')
    expect(convex.functions).toBe('convex/')
    expect(convex.node.externalPackages).toContain('sharp')
    for (const name of convex.node.externalPackages) expect(dependencies).toHaveProperty(name)
  })

  it('there is no second convex.json in the host', () => {
    expect(existsSync(new URL('../../apps/platform/convex.json', server))).toBe(false)
  })
})
