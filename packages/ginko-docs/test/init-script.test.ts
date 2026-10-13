// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { bannerInitScript, bannerKey, COLOR_KEY, colorInitScript } from '../app/lib/docsInit'

const run = (bannerId?: string) => new Function(bannerId ? bannerInitScript(bannerId) : colorInitScript())()

afterEach(() => {
  localStorage.clear()
  document.documentElement.removeAttribute('data-theme')
  document.documentElement.removeAttribute('data-docs-banner-off')
  vi.restoreAllMocks()
})

describe('head scripts', () => {
  it.each([['dark', 'dark'], ['light', 'light'], ['system', null], ['junk', null]])('stored "%s" gives data-theme %s', (stored, theme) => {
    localStorage.setItem(COLOR_KEY, stored)
    run()
    expect(document.documentElement.getAttribute('data-theme')).toBe(theme)
  })

  it('hides only the dismissed banner', () => {
    localStorage.setItem(bannerKey('v2'), '1')
    run('v3')
    expect(document.documentElement.hasAttribute('data-docs-banner-off')).toBe(false)
    run('v2')
    expect(document.documentElement.hasAttribute('data-docs-banner-off')).toBe(true)
  })

  it('survives a localStorage that throws', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked') })
    expect(() => run('v2')).not.toThrow()
    expect(document.documentElement.getAttribute('data-theme')).toBeNull()
  })
})
