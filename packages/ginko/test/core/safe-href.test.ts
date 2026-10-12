import { expect, test } from 'vitest'
import { safeHref } from '../../src/core/index.ts'

// Links and images from content: only http(s), mailto, tel, same-site paths and fragments pass.
test.each([
  ['https://linde.example/buchen', 'https://linde.example/buchen'],
  ['/media/gastraum.jpg', '/media/gastraum.jpg'],
  ['mailto:info@linde.example', 'mailto:info@linde.example'],
  ['/\t/evil.example', undefined],
  ['/\\evil.example/x', undefined],
  ['//evil.example/x', undefined],
  ['javascript:alert(1)', undefined],
  ['data:image/png;base64,AA', undefined],
  [undefined, undefined],
] as const)('safeHref(%j)', (href, expected) => {
  expect(safeHref(href)).toBe(expected)
})
