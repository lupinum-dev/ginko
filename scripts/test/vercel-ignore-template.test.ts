import { describe, expect, it } from 'vitest'
import { needsBuild, packagesOf } from '../vercel-ignore-template.ts'

// The demo projects ginko-template-<name> skip a build only when nothing their site reads changed. A wrong skip
// leaves a demo behind main; a wrong build costs build minutes on every push.
describe('vercel-ignore-template', () => {
  it('follows the workspace packages a template imports', () => {
    expect(packagesOf('restaurant')).toContain('packages/ginko-preset-gastro')
    expect(packagesOf('docs')).toContain('packages/ginko-components') // through @lupinum/ginko-docs
    expect(packagesOf('blog')).not.toContain('packages/ginko-server')
  })

  const versionOnly = (path: string) => path === 'packages/ginko/package.json'
  it.each([
    ['its own folder', 'restaurant', ['templates/restaurant/content/menu/soup.md'], true],
    ['another template only', 'restaurant', ['templates/blog/app/app.vue'], false],
    ['shared feature sources without their copies', 'blog', ['templates/_features/README.md'], false],
    ['a package it imports through another', 'docs', ['packages/ginko-components/src/runtime/x.ts'], true],
    ['a package it does not import', 'blog', ['packages/ginko-preset-gastro/src/index.ts'], false],
    ['platform, server and studio only', 'blog', ['apps/platform/x.vue', 'packages/ginko-server/convex/x.ts', 'packages/ginko-studio/app/x.vue'], false],
    ['changelog, tests and a version bump of an imported package', 'blog', ['packages/ginko/CHANGELOG.md', 'packages/ginko/test/x.test.ts', 'packages/ginko/package.json'], false],
    ['a dependency change of an imported package', 'blog', ['packages/ginko-content/package.json'], true],
    ['the lockfile', 'blog', ['pnpm-lock.yaml'], true],
    ['this script', 'blog', ['scripts/vercel-ignore-template.ts'], true],
  ])('%s → build %s', (_, template, changed, expected) => {
    expect(needsBuild(template, packagesOf(template), changed, versionOnly)).toBe(expected)
  })
})
