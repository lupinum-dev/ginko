import { execFile } from 'node:child_process'
import { statSync } from 'node:fs'
import { basename, join } from 'node:path'
import { promisify } from 'node:util'

const run = promisify(execFile)

/** Where one content file lives and when it last changed. */
export interface FileTimes {
  /** Repo-relative path with POSIX separators, e.g. `content/docs/1.einstieg.md`. */
  source: (rel: string) => string
  /** The latest change time (ISO 8601, UTC) over the given files, relative to the content directory. */
  updatedAt: (rels: string[]) => string
}

/**
 * Change times of the files below `contentDir`: the last commit that touched a file (one `git log`
 * for the whole directory, read once), or the file's mtime when it is uncommitted, modified or
 * untracked (one `git status`), or when there is no repository. Never throws.
 *
 * Without a repository `source` is relative to the content directory's parent, so a site that keeps
 * its content in `content/` still gets `content/<file>`.
 */
export async function fileTimes(contentDir: string): Promise<FileTimes> {
  const prefix = (await gitText(contentDir, ['rev-parse', '--show-prefix']))?.trim()
  if (prefix === undefined) {
    return { source: (rel) => `${basename(contentDir)}/${rel}`, updatedAt: (rels) => latest(rels.map((rel) => mtimeOf(contentDir, rel))) }
  }
  const committed = new Map<string, string>()
  // `--relative` makes the names relative to contentDir; the first time a name appears is its newest commit.
  const log = await gitText(contentDir, ['-c', 'core.quotepath=false', 'log', '--relative', '--no-renames', '--format=%x00%cI', '--name-only', '--', '.'])
  let date = ''
  for (const line of (log ?? '').split('\n')) {
    if (line.startsWith('\0')) date = new Date(line.slice(1)).toISOString()
    else if (line !== '' && !committed.has(line)) committed.set(line, date)
  }
  // Paths of `status --porcelain -z` are relative to the repository root. A rename lists a second path, which is skipped.
  const dirty = new Set<string>()
  const status = await gitText(contentDir, ['status', '--porcelain', '-z', '--untracked-files=all', '--', '.'])
  const fields = (status ?? '').split('\0')
  for (let i = 0; i < fields.length; i++) {
    const field = fields[i]!
    if (field.length < 4) continue
    dirty.add(field.slice(3))
    if (field[0] === 'R' || field[0] === 'C') i++
  }
  const timeOf = (rel: string) => {
    const when = committed.get(rel)
    return when !== undefined && !dirty.has(prefix + rel) ? when : mtimeOf(contentDir, rel)
  }
  return { source: (rel) => prefix + rel, updatedAt: (rels) => latest(rels.map(timeOf)) }
}

function mtimeOf(contentDir: string, rel: string): string {
  try { return statSync(join(contentDir, rel)).mtime.toISOString() } catch { return new Date(0).toISOString() }
}

/** ISO strings in one format sort like the instants they name. */
const latest = (times: string[]) => times.reduce((a, b) => (a > b ? a : b))

/** Output of one Git command in `cwd`; `undefined` when Git is missing, `cwd` is no repository, or the command fails. */
async function gitText(cwd: string, args: string[]): Promise<string | undefined> {
  try {
    return (await run('git', ['-C', cwd, ...args], { maxBuffer: 64 * 1024 * 1024 })).stdout
  } catch {
    return undefined
  }
}
