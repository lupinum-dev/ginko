// Every Studio component compiles. The typecheck and the component tests miss a broken template in a file no test
// mounts (an `<Input …>` without `/>`), and one such file turns every Studio page into a 500.
import { readFileSync, globSync } from 'node:fs'
import { compileTemplate, parse } from 'vue/compiler-sfc'
import { expect, test } from 'vitest'

const root = new URL('../', import.meta.url).pathname

test('every .vue file of the Studio compiles', () => {
  const problems: string[] = []
  for (const file of globSync('app/**/*.vue', { cwd: root })) {
    const { descriptor, errors } = parse(readFileSync(root + file, 'utf8'), { filename: file })
    const all = [...errors, ...(descriptor.template ? compileTemplate({ source: descriptor.template.content, filename: file, id: file }).errors : [])]
    for (const error of all) problems.push(`${file}: ${typeof error === 'string' ? error : error.message}`)
  }
  expect(problems).toEqual([])
})
