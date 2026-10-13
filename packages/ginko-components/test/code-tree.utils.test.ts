import { describe, expect, test } from 'vitest'
import { ancestorsOf, buildTree, codeTreeProblem } from '../src/runtime/components/code-tree.utils.ts'

describe('code tree paths', () => {
  test('nested distinct paths with a matching default are fine', () => {
    expect(codeTreeProblem(['app/app.vue', 'app/lib/config.ts'], 'app/app.vue')).toBeUndefined()
  })

  test.each([
    [[], undefined],
    [[''], undefined],
    [['app//index.ts'], undefined],
    [['app/../index.ts'], undefined],
    [['app.vue', 'app.vue'], undefined],
    [['app', 'app/index.ts'], undefined],
    [['app.vue'], 'missing.vue'],
  ] as const)('ambiguous input %#', (paths, file) => {
    expect(codeTreeProblem([...paths], file)).toBeTypeOf('string')
  })

  test('the tree lists folders before files and nests by path', () => {
    const tree = buildTree(['nuxt.config.ts', 'app/lib/b.ts', 'app/app.vue'])
    expect(tree.map((n) => n.path)).toEqual(['app', 'nuxt.config.ts'])
    expect(tree[0]!.children!.map((n) => n.path)).toEqual(['app/lib', 'app/app.vue'])
    expect(ancestorsOf('app/lib/b.ts')).toEqual(['app', 'app/lib'])
  })
})
