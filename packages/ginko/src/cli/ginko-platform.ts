#!/usr/bin/env node
// The `ginko-platform` command: runs the Ginko platform (the Studio and its Convex backend) from a platform project, the
// folder that `npm create ginko@latest my-cms -- --platform` writes. Its convex.json points `functions` into
// node_modules/@lupinum/ginko-server/convex/. Unlike `ginko` (one JSON line for CI), this command talks to a person.
//   ginko-platform dev [--verbose]   a local backend without an account, prepared for sign-in, and the Studio on :3100
import { startLocalPlatform, StoppedError } from './dev.ts'
import { backendAt, LOCAL_STUDIO } from './local.ts'
import { exitCodeOf, isEntryPoint } from './run.ts'

const COMMAND = 'ginko-platform dev'
const STUDIO_PORT = Number(new URL(LOCAL_STUDIO).port)
/** Quiet mode shows the Studio's output when its ready line has not come by then (Nuxt may change its wording). */
const STUDIO_WAIT_MS = 120_000

const USAGE = `Usage: ginko-platform <command>

Commands:
  dev    Start a local backend (no Convex account needed) and the Studio on ${LOCAL_STUDIO}.
         Run it in the folder of the platform project, the one with convex.json.

Options:
  --verbose    dev: show all output of the backend and the Studio from the start
  -h, --help   Show this help
`

/** The line that better-convex-nuxt's dev outbox writes into the `convex dev` log for each sign-in code. */
const CODE_LINE = /\[better-convex-nuxt dev outbox\] email-otp to (\S+): code (\d+)/
/** `nuxt dev` prints this when the server bundle is ready; the first page load works from then on. */
const STUDIO_READY = /Nitro server built/

export interface PlatformDeps {
  /** The platform project: the folder with convex.json. */
  cwd: string
  log: (line: string) => void
  error: (line: string) => void
  /** Tests replace the start of the local platform. */
  startPlatform?: typeof startLocalPlatform
}

export async function main(argv: string[], deps: PlatformDeps = { cwd: process.cwd(), log: console.log, error: console.error }): Promise<number> {
  const [command, ...rest] = argv
  if (command === '-h' || command === '--help') {
    deps.log(USAGE)
    return 0
  }
  const unknown = rest.find((arg) => arg !== '--verbose')
  if (command !== 'dev' || unknown !== undefined) {
    deps.error(`${command === undefined ? 'Give a command.' : command === 'dev' ? `Unknown argument "${unknown}".` : `Unknown command "${command}".`}\n\n${USAGE}`)
    return 2
  }
  try {
    return await dev(deps, rest.includes('--verbose'))
  } catch (error) {
    // Ctrl-C before the Studio was ready: everything is stopped, nothing failed.
    if (error instanceof StoppedError) return 0
    deps.error(error instanceof Error ? error.message : String(error))
    return exitCodeOf(error)
  }
}

/**
 * `ginko-platform dev`: resolves with 0 after Ctrl-C, 1 when a process ended by itself. Until the Studio is ready, it
 * prints short progress lines and keeps the children's output back (a failure shows its last lines); `verbose` shows all.
 */
async function dev({ cwd, log, startPlatform = startLocalPlatform }: PlatformDeps, verbose: boolean): Promise<number> {
  const backendDir = backendAt(cwd, COMMAND)
  log('Starting the local backend. The first start downloads it, which can take a minute.')
  const platform = await startPlatform({
    backendDir,
    command: COMMAND,
    log,
    // Sign-in links and the backend's SITE_URL name this port; on another one, sign-in fails without a clear reason.
    freePorts: [STUDIO_PORT],
    quiet: !verbose,
    onBackendLine: (line) => {
      const code = CODE_LINE.exec(line)
      if (code) log(`\nSign-in code for ${code[1]}: ${code[2]}\n`)
    },
  })
  log('The backend is ready.')
  log('Starting the Studio.')
  let ready = false
  // Quiet mode: without its ready line the person would see nothing forever. Show the Studio's output, stop nothing.
  const waiting = setTimeout(() => {
    if (ready || verbose || platform.stopping()) return
    log('The Studio is not ready after 2 minutes. Its output follows.')
    platform.showOutput('studio')
  }, STUDIO_WAIT_MS)
  waiting.unref()
  platform.onStop(() => clearTimeout(waiting))
  platform.start('studio', 'npx', ['nuxt', 'dev', '--port', String(STUDIO_PORT), '--dotenv', '.env.local'], backendDir, {
    onLine: (line) => {
      if (ready || !STUDIO_READY.test(line)) return
      ready = true
      clearTimeout(waiting)
      log([
        '',
        `The Studio runs on ${LOCAL_STUDIO}`,
        `Sign in as ${platform.admin}. The sign-in code appears here in the terminal; no mail is sent.`,
        'Press Ctrl-C to stop the Studio and the local backend.',
        '',
      ].join('\n'))
      // From now on, runtime errors of the Studio and the backend must be visible.
      platform.showOutput()
    },
  })
  return platform.exited
}

if (isEntryPoint(import.meta.url)) {
  void main(process.argv.slice(2)).then((code) => { process.exitCode = code })
}
