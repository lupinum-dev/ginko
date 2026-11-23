#!/usr/bin/env node
// The `ginko-platform` command: runs the Ginko platform (the Studio and its Convex backend) from a platform project, the
// folder that `npm create ginko@latest my-cms -- --platform` writes. Its convex.json points `functions` into
// node_modules/@lupinum/ginko-server/convex/. Unlike `ginko` (one JSON line for CI), this command talks to a person.
//   ginko-platform dev   a local backend without an account, prepared for sign-in, and the Studio on :3100
import { startLocalPlatform } from './dev.ts'
import { backendAt, LOCAL_STUDIO } from './local.ts'
import { exitCodeOf, isEntryPoint } from './run.ts'

const COMMAND = 'ginko-platform dev'
const STUDIO_PORT = Number(new URL(LOCAL_STUDIO).port)

const USAGE = `Usage: ginko-platform <command>

Commands:
  dev    Start a local backend (no Convex account needed) and the Studio on ${LOCAL_STUDIO}.
         Run it in the folder of the platform project, the one with convex.json.

Options:
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
}

export async function main(argv: string[], deps: PlatformDeps = { cwd: process.cwd(), log: console.log, error: console.error }): Promise<number> {
  const [command, ...rest] = argv
  if (command === '-h' || command === '--help') {
    deps.log(USAGE)
    return 0
  }
  if (command !== 'dev' || rest.length) {
    deps.error(`${command === undefined ? 'Give a command.' : command === 'dev' ? `Unknown argument "${rest[0]}".` : `Unknown command "${command}".`}\n\n${USAGE}`)
    return 2
  }
  try {
    return await dev(deps)
  } catch (error) {
    deps.error(error instanceof Error ? error.message : String(error))
    return exitCodeOf(error)
  }
}

/** `ginko-platform dev`: resolves with 0 after Ctrl-C, 1 when a process ended by itself. */
async function dev({ cwd, log }: PlatformDeps): Promise<number> {
  const backendDir = backendAt(cwd, COMMAND)
  log('Starting the local backend. The first start downloads it, which can take a minute.')
  const platform = await startLocalPlatform({
    backendDir,
    command: COMMAND,
    log,
    // Sign-in links and the backend's SITE_URL name this port; on another one, sign-in fails without a clear reason.
    freePorts: [STUDIO_PORT],
    onBackendLine: (line) => {
      const code = CODE_LINE.exec(line)
      if (code) log(`\nSign-in code for ${code[1]}: ${code[2]}\n`)
    },
  })
  let ready = false
  platform.start('studio', 'npx', ['nuxt', 'dev', '--port', String(STUDIO_PORT), '--dotenv', '.env.local'], backendDir, {
    onLine: (line) => {
      if (ready || !STUDIO_READY.test(line)) return
      ready = true
      log([
        '',
        `The Studio runs on ${LOCAL_STUDIO}`,
        `Sign in as ${platform.admin}. The sign-in code appears here in the terminal; no mail is sent.`,
        'Press Ctrl-C to stop the Studio and the local backend.',
        '',
      ].join('\n'))
    },
  })
  return platform.exited
}

if (isEntryPoint(import.meta.url)) {
  void main(process.argv.slice(2)).then((code) => { process.exitCode = code })
}
