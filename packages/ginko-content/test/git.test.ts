// Change times of content files, against a real temporary Git repository (no mocks).
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { fileTimes } from '../src/git.ts'

function write(root: string, path: string, text: string) {
  mkdirSync(dirname(join(root, path)), { recursive: true })
  writeFileSync(join(root, path), text)
}

/** Commits everything at a fixed date; the offset in the date must not change the UTC result. */
function commit(root: string, date: string) {
  const env = { ...process.env, GIT_COMMITTER_DATE: date, GIT_AUTHOR_DATE: date }
  execFileSync('git', ['-C', root, 'add', '-A'], { env })
  execFileSync('git', ['-C', root, '-c', 'user.name=t', '-c', 'user.email=t@example.com', '-c', 'commit.gpgsign=false', 'commit', '-q', '-m', 'x'], { env })
}

/** A repository whose content lives in `site/content`, to prove `source` is relative to the repository root. */
function repo() {
  const root = mkdtempSync(join(tmpdir(), 'ginko-git-'))
  execFileSync('git', ['-C', root, 'init', '-q'])
  return { root, content: join(root, 'site', 'content') }
}

const touch = (path: string, iso: string) => utimesSync(path, new Date(iso), new Date(iso))

describe('fileTimes', () => {
  it('a committed file has the date of its last commit in UTC; source is relative to the repository root', async () => {
    const { root, content } = repo()
    write(root, 'site/content/docs/1.a.md', 'A')
    write(root, 'site/content/docs/2.b.md', 'B')
    commit(root, '2026-03-01T10:00:00+02:00')
    write(root, 'site/content/docs/2.b.md', 'B2')
    commit(root, '2026-04-05T23:30:00-05:00')
    const times = await fileTimes(content)
    expect(times.updatedAt(['docs/1.a.md'])).toBe('2026-03-01T08:00:00.000Z')
    expect(times.updatedAt(['docs/2.b.md'])).toBe('2026-04-06T04:30:00.000Z')
    expect(times.source('docs/1.a.md')).toBe('site/content/docs/1.a.md')
  })

  it('an entry takes the newest time of its main file and its translations', async () => {
    const { root, content } = repo()
    write(root, 'site/content/docs/1.a.md', 'A')
    commit(root, '2026-03-01T10:00:00Z')
    write(root, 'site/content/docs/1.a.en.md', 'A en')
    commit(root, '2026-05-01T10:00:00Z')
    const times = await fileTimes(content)
    expect(times.updatedAt(['docs/1.a.md', 'docs/1.a.en.md'])).toBe('2026-05-01T10:00:00.000Z')
  })

  it('a modified or untracked file has its mtime, a clean one keeps its commit date', async () => {
    const { root, content } = repo()
    write(root, 'site/content/docs/1.a.md', 'A')
    write(root, 'site/content/docs/2.b.md', 'B')
    commit(root, '2026-03-01T10:00:00Z')
    write(root, 'site/content/docs/1.a.md', 'A changed')
    write(root, 'site/content/docs/3.c.md', 'new')
    touch(join(content, 'docs/1.a.md'), '2026-09-01T12:00:00Z')
    touch(join(content, 'docs/3.c.md'), '2026-09-02T12:00:00Z')
    const times = await fileTimes(content)
    expect(times.updatedAt(['docs/1.a.md'])).toBe('2026-09-01T12:00:00.000Z')
    expect(times.updatedAt(['docs/3.c.md'])).toBe('2026-09-02T12:00:00.000Z')
    expect(times.updatedAt(['docs/2.b.md'])).toBe('2026-03-01T10:00:00.000Z')
  })

  it('without a repository: file mtime, and source relative to the parent of the content folder', async () => {
    const root = mkdtempSync(join(tmpdir(), 'ginko-nogit-'))
    write(root, 'content/docs/1.a.md', 'A')
    touch(join(root, 'content/docs/1.a.md'), '2026-07-07T07:07:07Z')
    const times = await fileTimes(join(root, 'content'))
    expect(times.updatedAt(['docs/1.a.md'])).toBe('2026-07-07T07:07:07.000Z')
    expect(times.source('docs/1.a.md')).toBe('content/docs/1.a.md')
  })
})
