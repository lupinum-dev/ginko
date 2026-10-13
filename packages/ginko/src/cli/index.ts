#!/usr/bin/env node
// The `ginko` command: `ginko check | release | export`. Output and exit codes: run.ts.
// Reads GINKO_PLATFORM (or NUXT_PUBLIC_GINKO_PLATFORM), GINKO_KEY, GINKO_COMMIT (or GITHUB_SHA), GINKO_BRANCH and
// GINKO_REMOTE from the environment; it does not read .env files.
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { loadConfig } from './config.ts'
import { check } from './check.ts'
import { defaultDir, exportSite, siteOfKey } from './export.ts'
import { CliError } from './model.ts'
import { createPlatform } from './platform.ts'
import { release } from './release.ts'
import { env, isEntryPoint, realDeps, runCli, type CliDeps, type ExitCode } from './run.ts'

const USAGE = `Usage: ginko <command> [--config <file>]

Commands:
  check [--offline]  Check ginko.config.ts and the links in content/, and for platform bricks the schema against
                     production. Writes nothing. Platform bricks need GINKO_PLATFORM and GINKO_KEY, unless --offline
                     skips the comparison with production.
  release            Deploy the schema and content to production (CI). Needs GINKO_PLATFORM, GINKO_KEY and
                     GINKO_COMMIT (or GITHUB_SHA). Deploy the site only when it prints "deploy":true.
  export [folder]    Save the schema, entries and files from production to a new or empty folder
                     (default: ginko-export-<site>-<yyyy-mm-dd>). Needs GINKO_PLATFORM and GINKO_KEY.

Options:
  --config <file>    Path to ginko.config.ts (default: ./ginko.config.ts)
  -h, --help         Show this help
  --version          Show the version

Every run prints one JSON line on stdout. Exit codes: 0 ok, 1 invalid or rejected, 2 usage,
3 platform unavailable (run again), 4 key not allowed.
`

/** The version of this package; dist/cli/index.mjs and src/cli/index.ts both sit two folders below package.json. */
function version(): string {
  return (JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8')) as { version: string }).version
}

// One CI secret serves the site and the CLI: the site reads NUXT_PUBLIC_GINKO_PLATFORM, so the CLI accepts it too.
const PLATFORM_ENV = ['GINKO_PLATFORM', 'NUXT_PUBLIC_GINKO_PLATFORM'] as const
// GITHUB_SHA is the GitHub name; GINKO_COMMIT works on any CI host.
const COMMIT_ENV = ['GINKO_COMMIT', 'GITHUB_SHA'] as const

/** Head commit of the release branch on the remote (SPEC 5.1 step 1): GINKO_BRANCH on GINKO_REMOTE, default origin/main. */
async function branchHead(deps: CliDeps): Promise<string> {
  const remote = deps.env.GINKO_REMOTE || 'origin'
  const branch = deps.env.GINKO_BRANCH || 'main'
  let stdout: string
  try {
    stdout = await deps.git(['ls-remote', remote, `refs/heads/${branch}`])
  } catch {
    throw new CliError(`Could not read ${remote}/${branch} (git ls-remote ${remote} refs/heads/${branch}).`, 'UNAVAILABLE')
  }
  const sha = stdout.trim().split(/\s+/)[0]
  if (!sha) throw new CliError(`The branch ${branch} does not exist on ${remote}. Set GINKO_BRANCH and GINKO_REMOTE.`, 'USAGE')
  return sha
}

const sleep = (ms: number) => new Promise<void>((done) => setTimeout(done, ms))

export function main(argv: string[], deps: CliDeps = realDeps()): Promise<ExitCode> {
  const request = deps.fetch ?? ((url: string, init?: RequestInit) => fetch(url, init))
  const connect = () => createPlatform({ url: env(deps, ...PLATFORM_ENV), key: env(deps, 'GINKO_KEY'), fetch: request })

  return runCli(argv, deps, {
    prefix: 'ginko ',
    usage: USAGE,
    version,
    commands: {
      check: {
        flags: ['--offline'],
        async run(args) {
          const configPath = resolve(args.config)
          const config = await loadConfig(configPath)
          // A site whose bricks all come from files has no platform to compare with; --offline skips the comparison.
          const offline = args.flags.has('--offline')
          const platformBricks = Object.values(config.bricks).some((b) => b.source !== 'files')
          const compared = platformBricks && !offline
          const ok = await check({ config, platform: compared ? connect() : undefined, root: dirname(configPath), log: deps.log })
          if (platformBricks && offline) deps.log('Skipped the comparison with production (--offline).')
          if (!ok) throw new CliError('ginko check found problems. Each one is listed on stderr.')
          return { compared }
        },
      },
      release: {
        async run(args) {
          // SPEC 5.1 step 1 comes first: a superseded run needs neither the config nor the platform credentials.
          const commit = env(deps, ...COMMIT_ENV)
          if ((await branchHead(deps)) !== commit) return { deploy: false, reason: 'superseded' }
          const config = await loadConfig(resolve(args.config))
          return release({ config, commit, platform: connect(), branchHead: () => branchHead(deps), sleep, log: deps.log })
        },
      },
      // Works on the hosted content only, so it needs no config.
      export: {
        folder: 'optional',
        async run(args) {
          const platform = connect()
          const site = siteOfKey(env(deps, 'GINKO_KEY'))
          return exportSite({ platform, site, dir: args.folder ?? defaultDir(site, new Date()), fetch: (url) => request(url), log: deps.log })
        },
      },
    },
  })
}

if (isEntryPoint(import.meta.url)) {
  void main(process.argv.slice(2)).then((code) => { process.exitCode = code })
}
