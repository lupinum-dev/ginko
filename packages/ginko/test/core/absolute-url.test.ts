import { expect, test } from 'vitest'
import { absoluteUrl, withAbsoluteImages } from '../../src/core/seo.ts'

// Wrong behaviour caught: JSON-LD and og:image carry a path (/__ginko/file/…) that crawlers cannot resolve.
test('paths of the site become absolute; absolute and protocol-relative addresses stay', () => {
  expect(absoluteUrl('/__ginko/file/a/b', 'https://linde.example/')).toBe('https://linde.example/__ginko/file/a/b')
  expect(absoluteUrl('https://cdn.example/x.jpg', 'https://linde.example')).toBe('https://cdn.example/x.jpg')
  expect(absoluteUrl('//cdn.example/x.jpg', 'https://linde.example')).toBe('//cdn.example/x.jpg')
})

test('JSON-LD image keys are made absolute at any depth; other values stay', () => {
  const node = { '@type': 'BlogPosting', url: '/blog/a', image: '/__ginko/file/a/b', author: { '@type': 'Person', image: ['/x.jpg', 'https://o.example/y.jpg'] } }
  expect(withAbsoluteImages(node, 'https://linde.example')).toEqual({
    '@type': 'BlogPosting', url: '/blog/a', image: 'https://linde.example/__ginko/file/a/b',
    author: { '@type': 'Person', image: ['https://linde.example/x.jpg', 'https://o.example/y.jpg'] },
  })
})
