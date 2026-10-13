#!/usr/bin/env node
// The `ginko` command: `ginko check | release | export | dev | import | pull`.
// Reads GINKO_PLATFORM (or NUXT_PUBLIC_GINKO_PLATFORM), GINKO_KEY and GINKO_COMMIT (or GITHUB_SHA) from the environment (release, check, export and pull need the first two).
import { execFile } from 'node:child_process'
import { realpathSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadConfig } from './config.ts'
import { check } from './check.ts'
import { runDev } from './dev.ts'
import { defaultDir, exportSite, siteOfKey } from './export.ts'
import { importSite, postFile } from './import.ts'
import { connectLocal } from './local.ts'
import { CliError } from './model.ts'
import { createPlatform, PlatformError } from './platform.ts'
import { pull } from './pull.ts'
import { release } from './release.ts'

const USAGE = `Usage: ginko <command> [--config <file>]
            ginko export [--out <folder>]
            ginko import <folder>

Commands:
  check     Check ginko.config.ts and the links in content/, and for platform bricks the schema against production.
            Writes nothing. Platform bricks need GINKO_PLATFORM, GINKO_KEY.
  release   Deploy the schema and content to production (CI). Needs GINKO_PLATFORM, GINKO_KEY, GINKO_COMMIT (or GITHUB_SHA).
  export    Save the schema, entries and files from production to a folder. Needs GINKO_PLATFORM, GINKO_KEY
            (scope export or pull). The folder must be new or empty.
  dev       (Ginko monorepo only) Start the local platform and site; schema changes go to the local platform at once.
  import    (Ginko monorepo only) Load an export folder into the local platform. Replaces the site's content there.
  pull      (Ginko monorepo only) Copy content from production to the local platform (export, then import).
            Needs GINKO_PLATFORM, GINKO_KEY (scope pull or export).

Options:
  --config <file>   Path to ginko.config.ts (default: ./ginko.config.ts); import and pull look for apps/platform from here
  --out <folder>     Target folder of export (default: ginko-export-<site>-<yyyy-mm-dd>)
  -h, --help         Show this help
`

interface Args {
  command?: string
  config: string
  help: boolean
  /** `--out`: target folder of export. */
  out?: string
  /** The folder that `import` reads. */
  dir?: string
}

export function parseArgs(argv: string[]): Args {
  const args: Args = { config: 'ginko.config.ts', help: false }
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!
    if (arg === '-h' || arg === '--help') args.help = true
    else if (arg === '--config') {
      const value = argv[++i]
      if (!value) throw new CliError('--config needs a path.')
      args.config = value
    } else if (arg.startsWith('--config=')) args.config = arg.slice('--config='.length)
    else if (arg === '--out') {
      const value = argv[++i]
      if (!value) throw new CliError('--out needs a folder.')
      args.out = value
    } else if (arg.startsWith('--out=')) args.out = arg.slice('--out='.length)
    else if (arg.startsWith('-')) throw new CliError(`Unknown option “${arg}”.`)
    else if (args.command === undefined) args.command = arg
    else if (args.command === 'import' && args.dir === undefined) args.dir = arg
    else throw new CliError(`Unexpected argument “${arg}”.`)
  }
  return args
}

/** The outside world of the CLI. main() takes it as a parameter so that tests can replace it. */
export interface CliDeps {
  env: NodeJS.ProcessEnv
  /** Runs git and returns its stdout. Rejects when git fails. */
  git: (args: string[]) => Promise<string>
  stdout: (text: string) => void
  log: (line: string) => void
  /** Network requests (platform, file downloads, local upload). Defaults to the global fetch; tests route it elsewhere. */
  fetch?: (input: string, init?: RequestInit) => Promise<Response>
}

function realDeps(): CliDeps {
  return {
    env: process.env,
    git: (args) => new Promise((done, fail) => {
      execFile('git', args, (error, stdout) => (error ? fail(error) : done(stdout)))
    }),
    stdout: (text) => { process.stdout.write(text) },
    log: (line) => { process.stderr.write(`${line}\n`) },
  }
}

/** Head commit of origin/main (SPEC 5.1 step 1). */
async function mainCommit(deps: CliDeps): Promise<string> {
  let stdout: string
  try {
    stdout = await deps.git(['ls-remote', 'origin', 'main'])
  } catch {
    throw new CliError('Could not read origin/main (git ls-remote origin main).')
  }
  const sha = stdout.trim().split(/\s+/)[0]
  if (!sha) throw new CliError('Could not read origin/main (git ls-remote origin main).')
  return sha
}

const sleep = (ms: number) => new Promise<void>((done) => setTimeout(done, ms))

/** The first set variable among these names; the error names the first one. */
function env(deps: CliDeps, ...names: [string, ...string[]]): string {
  const value = names.map((name) => deps.env[name]).find(Boolean)
  if (!value) throw new CliError(`The environment variable ${names[0]} is missing.`)
  return value
}

// One CI secret serves the site and the CLI: the site reads NUXT_PUBLIC_GINKO_PLATFORM, so the CLI accepts it too.
const PLATFORM_ENV = ['GINKO_PLATFORM', 'NUXT_PUBLIC_GINKO_PLATFORM'] as const
// GITHUB_SHA is the GitHub name; GINKO_COMMIT works on any CI host.
const COMMIT_ENV = ['GINKO_COMMIT', 'GITHUB_SHA'] as const

export async function main(argv: string[], deps: CliDeps = realDeps()): Promise<number> {
  const args = parseArgs(argv)
  if (args.help || args.command === undefined) {
    deps.stdout(USAGE)
    return args.help ? 0 : 1
  }
  if (!['release', 'check', 'dev', 'export', 'import', 'pull'].includes(args.command)) throw new CliError(`Unknown command “${args.command}”.\n\n${USAGE}`)
  if (args.out !== undefined && args.command !== 'export') throw new CliError('--out only applies to export.')
  if (args.command === 'import' && args.dir === undefined) throw new CliError('import needs the folder of an export: ginko import <folder>')
  const configPath = resolve(args.config)
  const request = deps.fetch ?? ((url: string, init?: RequestInit) => fetch(url, init))

  if (args.command === 'dev') return runDev({ configPath, log: deps.log })

  // export, import and pull work on the hosted or local content only, so they need no config.
  if (args.command === 'export') {
    const platform = createPlatform({ url: env(deps, ...PLATFORM_ENV), key: env(deps, 'GINKO_KEY'), fetch: request })
    const site = siteOfKey(env(deps, 'GINKO_KEY'))
    const done = await exportSite({ platform, site, dir: args.out ?? defaultDir(site, new Date()), fetch: (url) => request(url), log: deps.log })
    deps.stdout(`${JSON.stringify({ export: done.dir, entries: done.entries, files: done.files })}\n`)
    return 0
  }
  if (args.command === 'import' || args.command === 'pull') {
    // The local check comes first: a wrong target stops before anything is read or written.
    const run = connectLocal(dirname(configPath), `ginko ${args.command}`)
    const upload = (url: string, bytes: Uint8Array<ArrayBuffer>, mime: string) => postFile(request, url, bytes, mime)
    if (args.command === 'import') {
      const done = await importSite({ dir: args.dir!, run, upload, log: deps.log })
      deps.stdout(`${JSON.stringify({ import: args.dir, entries: done.entries, files: done.files })}\n`)
      return 0
    }
    const platform = createPlatform({ url: env(deps, ...PLATFORM_ENV), key: env(deps, 'GINKO_KEY'), fetch: request })
    const done = await pull({ platform, site: siteOfKey(env(deps, 'GINKO_KEY')), fetch: (url) => request(url), log: deps.log, run, upload })
    deps.stdout(`${JSON.stringify({ pull: true, entries: done.entries, files: done.files })}\n`)
    return 0
  }

  // SPEC 5.1 step 1 comes first: a superseded run needs neither the config nor the platform credentials.
  if (args.command === 'release') {
    const commit = env(deps, ...COMMIT_ENV)
    if ((await mainCommit(deps)) !== commit) {
      deps.stdout(`${JSON.stringify({ deploy: false, reason: 'superseded' })}\n`)
      return 0
    }
  }

  const config = await loadConfig(configPath)
  const connect = () => createPlatform({ url: env(deps, ...PLATFORM_ENV), key: env(deps, 'GINKO_KEY'), fetch: request })
  if (args.command === 'check') {
    // A site whose bricks all come from files has no platform: only its content links are checked.
    const filesOnly = Object.values(config.bricks).every((b) => b.source === 'files')
    return (await check({ config, platform: filesOnly ? undefined : connect(), root: dirname(configPath), log: deps.log })) ? 0 : 1
  }
  const platform = connect()

  const outcome = await release({ config, commit: env(deps, ...COMMIT_ENV), platform, mainCommit: () => mainCommit(deps), sleep, log: deps.log })
  deps.stdout(`${JSON.stringify(outcome.deploy ? { deploy: true, schemaRev: outcome.schemaRev, contentRev: outcome.contentRev } : outcome)}\n`)
  return 0
}

// Runs only as the `ginko` command, not when a test imports this module (argv[1] is the bin link or this file).
const isEntryPoint = process.argv[1] !== undefined && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)

if (isEntryPoint) {
  main(process.argv.slice(2)).then(
    (code) => { process.exitCode = code },
    (error: unknown) => {
      const log = realDeps().log
      if (error instanceof PlatformError) log(`Error ${error.code}: ${error.message}`)
      else if (error instanceof Error) log(error.message)
      else log(String(error))
      process.exitCode = 1
    },
  )
}
