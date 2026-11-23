#!/usr/bin/env node
// The `ginko-platform` command: runs the Ginko platform (the Studio and its Convex backend) from a platform project, the
// folder that `npm create ginko@latest my-cms -- --platform` writes. Its convex.json points `functions` into
// node_modules/@lupinum/ginko-server/convex/. Unlike `ginko` (one JSON line for CI), this command talks to a person.
//   ginko-platform dev [--verbose]     a local backend without an account, prepared for sign-in, and the Studio on :3100
//   ginko-platform build [--convex D]  the build: backend deploy and data migrations in production, then the Studio
//   ginko-platform setup [options]     puts the project online on Convex cloud and Vercel, mail through Resend
import { resolve } from 'node:path'
import { createInterface } from 'node:readline'
import { parseArgs } from 'node:util'
import { startLocalPlatform, StoppedError } from './dev.ts'
import { backendAt, LOCAL_STUDIO } from './local.ts'
import { build } from './platform-build.ts'
import { realRunner, type CommandRunner } from './platform-run.ts'
import { setup, type Ask } from './platform-setup.ts'
import { exitCodeOf, isEntryPoint } from './run.ts'

const COMMAND = 'ginko-platform dev'
const STUDIO_PORT = Number(new URL(LOCAL_STUDIO).port)
/** Quiet mode shows the Studio's output when its ready line has not come by then (Nuxt may change its wording). */
const STUDIO_WAIT_MS = 120_000

const USAGE = `Usage: ginko-platform <command>

Commands:
  dev      Start a local backend (no Convex account needed) and the Studio on ${LOCAL_STUDIO}.
  build    Build the Studio. In production (on Vercel: VERCEL_ENV=production; elsewhere: a production
           CONVEX_DEPLOY_KEY) it first deploys the backend and starts its data migrations.
  setup    Put the platform online: the backend on Convex, the Studio on Vercel, sign-in mail through Resend.
           Log in first with \`npx convex login\` and \`vercel login\`. Safe to run again.
Run them in the folder of the platform project, the one with convex.json.

Options:
  --verbose             dev: show all output of the backend and the Studio from the start
  --convex <folder>     build: the folder with convex.json, if it is not the current folder
  --site-url <address>  setup: the Studio address (default: the address Vercel gives the project)
  --admin <email>       setup: the address that may sign in first
  --mail-from <sender>  setup: the sender of sign-in mail, for example "Studio <login@example.com>"
  --project <name>      setup: the Convex and Vercel project name (default: the folder name)
  --team <slug>         setup: the Convex team, when the account has more than one
  --region <region>     setup: the Convex region of the production deployment
  --dry-run             setup: print the steps and their commands, change nothing
  -h, --help            Show this help
setup reads the Resend API key from RESEND_API_KEY or asks for it; it never takes it as an option.
--team is the Convex team; on Vercel, setup uses the scope the Vercel CLI has selected (vercel switch).
`

/** The options of each command; anything else is refused with the usage. */
const COMMANDS = {
  dev: { verbose: { type: 'boolean' } },
  build: { convex: { type: 'string' } },
  setup: {
    'site-url': { type: 'string' },
    admin: { type: 'string' },
    'mail-from': { type: 'string' },
    project: { type: 'string' },
    team: { type: 'string' },
    region: { type: 'string' },
    'dry-run': { type: 'boolean' },
  },
} as const satisfies Record<string, Record<string, { type: 'boolean' | 'string' }>>
type Command = keyof typeof COMMANDS

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
  /** Tests replace the programs that build and setup run. */
  run?: CommandRunner
  env?: NodeJS.ProcessEnv
  /** Tests replace the questions of setup; undefined in tests means nobody can answer. */
  ask?: Ask
}

/** The command and its options, or the sentence that says what is wrong with the call. */
function parseCall(argv: string[]): { command: Command; values: Record<string, string | boolean | undefined> } | { wrong: string } {
  const [command, ...rest] = argv
  if (command === undefined) return { wrong: 'Give a command.' }
  if (!Object.hasOwn(COMMANDS, command)) return { wrong: `Unknown command "${command}".` }
  const options = COMMANDS[command as Command]
  const { values, tokens } = parseArgs({ args: rest, options, strict: false, allowPositionals: true, tokens: true })
  for (const token of tokens) {
    if (token.kind === 'positional') return { wrong: `Unknown argument "${token.value}".` }
    if (token.kind !== 'option') continue
    const option = (options as Record<string, { type: string }>)[token.name]
    if (!option) return { wrong: `Unknown argument "${token.rawName}".` }
    if (option.type === 'string' && typeof token.value !== 'string') return { wrong: `${token.rawName} needs a value.` }
  }
  return { command: command as Command, values: values as Record<string, string | boolean | undefined> }
}

export async function main(argv: string[], deps: PlatformDeps = { cwd: process.cwd(), log: console.log, error: console.error }): Promise<number> {
  if (argv[0] === '-h' || argv[0] === '--help') {
    deps.log(USAGE)
    return 0
  }
  const call = parseCall(argv)
  if ('wrong' in call) {
    deps.error(`${call.wrong}\n\n${USAGE}`)
    return 2
  }
  const { run = realRunner, env = process.env } = deps
  try {
    switch (call.command) {
      case 'dev':
        return await dev(deps, call.values.verbose === true)
      case 'build': {
        const convexDir = backendAt(resolve(deps.cwd, typeof call.values.convex === 'string' ? call.values.convex : '.'), 'ginko-platform build')
        await build({ cwd: deps.cwd, convexDir, env, run, log: deps.log })
        return 0
      }
      case 'setup': {
        const text = (name: string) => (typeof call.values[name] === 'string' ? call.values[name] : undefined)
        await setup({
          cwd: backendAt(deps.cwd, 'ginko-platform setup'),
          options: { siteUrl: text('site-url'), admin: text('admin'), mailFrom: text('mail-from'), project: text('project'), team: text('team'), region: text('region'), dryRun: call.values['dry-run'] === true },
          env,
          run,
          ask: deps.ask ?? (deps.run === undefined && process.stdin.isTTY ? terminalAsk : undefined),
          log: deps.log,
        })
        return 0
      }
    }
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

/** One question in the terminal; hidden input echoes nothing. */
const terminalAsk: Ask = (question, hidden) => new Promise((done) => {
  const terminal = createInterface({ input: process.stdin, output: process.stdout, terminal: true })
  if (hidden) {
    // readline echoes through _writeToOutput; after the question is written, it writes nothing more until Enter.
    const internal = terminal as unknown as { _writeToOutput: (text: string) => void }
    const write = internal._writeToOutput.bind(terminal)
    let asked = false
    internal._writeToOutput = (text) => {
      if (!asked || text === '\r\n' || text === '\n') write(text)
    }
    terminal.question(`${question} `, (answer) => { terminal.close(); done(answer) })
    asked = true
    return
  }
  terminal.question(`${question} `, (answer) => { terminal.close(); done(answer) })
})

if (isEntryPoint(import.meta.url)) {
  void main(process.argv.slice(2)).then((code) => { process.exitCode = code })
}
