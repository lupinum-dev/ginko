import { describe, expect, it } from 'vitest'
import { main, parseArgs } from '../../src/cli/index.ts'

describe('ginko release', () => {
  it('reports a superseded commit before it loads the config or needs the platform credentials', async () => {
    const out: string[] = []
    const code = await main(['release', '--config', 'missing/ginko.config.ts'], {
      env: { GITHUB_SHA: 'new-commit' },
      git: async () => 'old-commit\trefs/heads/main\n',
      stdout: (text) => out.push(text),
      log: () => undefined,
    })
    expect(code).toBe(0)
    expect(out.join('')).toBe('{"deploy":false,"reason":"superseded"}\n')
  })
})

describe('ginko environment names', () => {
  it('takes the commit from GINKO_COMMIT before GITHUB_SHA', async () => {
    const out: string[] = []
    const code = await main(['release', '--config', 'missing/ginko.config.ts'], {
      env: { GINKO_COMMIT: 'new-commit', GITHUB_SHA: 'old-commit' },
      git: async () => 'old-commit\trefs/heads/main\n',
      stdout: (text) => out.push(text),
      log: () => undefined,
    })
    expect(code).toBe(0)
    expect(out.join('')).toBe('{"deploy":false,"reason":"superseded"}\n')
  })

  it('reads the platform from NUXT_PUBLIC_GINKO_PLATFORM when GINKO_PLATFORM is not set', async () => {
    const deps = { env: { NUXT_PUBLIC_GINKO_PLATFORM: 'not a url', GINKO_KEY: 'ginko_site_00000000000000000000000000000000' }, git: async () => '', stdout: () => undefined, log: () => undefined }
    await expect(main(['export'], deps)).rejects.toThrow('GINKO_PLATFORM is not a valid URL.')
  })
})

describe('ginko export, import and pull arguments', () => {
  const deps = { env: {}, git: async () => '', stdout: () => undefined, log: () => undefined }

  it.each([
    [['import'], 'import needs the folder of an export'],
    [['release', '--out', 'x'], '--out only applies to export.'],
    [['export', '--out'], '--out needs a folder.'],
    [['pull', 'ordner'], 'Unexpected argument'],
    [['export'], 'The environment variable GINKO_PLATFORM is missing.'],
  ])('%j stops with a German message before it does anything', async (argv, message) => {
    await expect(main(argv, deps)).rejects.toThrow(message)
  })

  it('reads the folder of import and the target of export', () => {
    expect(parseArgs(['import', 'sicherung'])).toMatchObject({ command: 'import', dir: 'sicherung' })
    expect(parseArgs(['export', '--out=a/b'])).toMatchObject({ command: 'export', out: 'a/b' })
  })
})
