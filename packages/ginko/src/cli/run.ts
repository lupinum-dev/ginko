// How every run of a Ginko CLI ends (docs: 12.plattform-und-cli "Output and exit codes"). stdout gets exactly
// one JSON line, `{"ok":true,…}` or `{"ok":false,"error":{"code","message"}}`; human text goes to stderr.
// The exit code tells a CI what to do next, so it is part of the contract.
import { execFile } from 'node:child_process'
import { realpathSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { CliError } from './model.ts'
import { createPlatform, PlatformError, type Platform } from './platform.ts'

/** The outside world of the CLI. main() takes it as a parameter so that tests can replace it. */
export interface CliDeps {
  env: NodeJS.ProcessEnv
  /** Runs git and returns its stdout. Rejects when git fails. */
  git: (args: string[]) => Promise<string>
  stdout: (text: string) => void
  log: (line: string) => void
  /** Network requests (platform, file downloads, local upload). Tests route it elsewhere. */
  fetch: (input: string, init?: RequestInit) => Promise<Response>
}

export function realDeps(): CliDeps {
  return {
    env: process.env,
    git: (args) => new Promise((done, fail) => {
      execFile('git', args, (error, stdout) => (error ? fail(error) : done(stdout)))
    }),
    stdout: (text) => { process.stdout.write(text) },
    log: (line) => { process.stderr.write(`${line}\n`) },
    fetch: (input, init) => fetch(input, init),
  }
}

/** 0 ok, 1 invalid or rejected (fix the code), 2 usage (fix the call), 3 unavailable (run again), 4 key not allowed. */
export type ExitCode = 0 | 1 | 2 | 3 | 4

/**
 * The `error.code` of a failure: the CLI's own code, the platform's code, or UNEXPECTED for any other error (a bug or
 * a local failure such as EACCES). Not INTERNAL: that is the platform's own 500, which exits 3, not 1.
 */
function codeOf(error: unknown): string {
  return error instanceof CliError || error instanceof PlatformError ? error.code : 'UNEXPECTED'
}

/** The exit code of a failure. Only these rules decide it; every other error is a rejection (1). */
export function exitCodeOf(error: unknown): ExitCode {
  const code = codeOf(error)
  if (code === 'UNAUTHORIZED' || code === 'FORBIDDEN') return 4
  if (code === 'USAGE') return 2
  // CHANGED_SINCE reaches here only after every retry; the platform wrote nothing, so the same commit may run again.
  if (code === 'UNAVAILABLE' || code === 'CHANGED_SINCE') return 3
  if (error instanceof PlatformError) {
    // A proxy or deployment protection in front of the platform answers 401/403 without Ginko's code: still access.
    if (error.status === 401 || error.status === 403) return 4
    if (error.status >= 500 || error.status === 408 || error.status === 429) return 3
  }
  return 1
}

/**
 * Runs one command and prints its one JSON line: the command's fields after `ok: true`, or the coded error.
 * Never throws; the result is the exit code.
 */
async function runCommand(deps: CliDeps, command: () => Promise<Record<string, unknown>>): Promise<ExitCode> {
  try {
    const fields = await command()
    deps.stdout(`${JSON.stringify({ ok: true, ...fields })}\n`)
    return 0
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    const code = codeOf(error)
    deps.log(error instanceof PlatformError ? `Error ${code}: ${message}` : message)
    deps.stdout(`${JSON.stringify({ ok: false, error: { code, message } })}\n`)
    return exitCodeOf(error)
  }
}

/** A parsed command line: `<command> [folder] [--config <file>] [--flag …]`. */
export interface Args {
  command?: string
  /** `--config`: the site's ginko.config.ts. Each CLI decides what its absence means. */
  config?: string
  /** The one positional argument after the command: the folder of `export` and `import`. */
  folder?: string
  /** Boolean options such as `--offline`; each command says which it accepts. */
  flags: Set<string>
}

function parseArgs(argv: string[]): Args {
  const args: Args = { flags: new Set() }
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!
    if (arg === '--config') {
      const value = argv[++i]
      if (!value) throw new CliError('--config needs a path.', 'USAGE')
      args.config = value
    } else if (arg.startsWith('--config=')) args.config = arg.slice('--config='.length)
    else if (arg.startsWith('-')) args.flags.add(arg)
    else if (args.command === undefined) args.command = arg
    else if (args.folder === undefined) args.folder = arg
    else throw new CliError(`Unexpected argument “${arg}”.`, 'USAGE')
  }
  return args
}

export interface Command {
  /** Whether the command takes a folder as its positional argument. */
  folder?: 'optional' | 'required'
  /** Boolean options besides `--config`, such as `--offline`. */
  flags?: readonly string[]
  run: (args: Args) => Promise<Record<string, unknown>>
}

export interface Cli {
  /** How a command is called, for messages: `ginko ` gives `ginko export`. */
  prefix: string
  usage: string
  /** Read only for `--version`. */
  version?: () => string
  commands: Record<string, Command>
}

/** `--help` and `--version` print plain text and exit 0; every other call is one command run with its JSON line. */
export async function runCli(argv: string[], deps: CliDeps, cli: Cli): Promise<ExitCode> {
  if (argv.includes('--help') || argv.includes('-h')) {
    deps.stdout(cli.usage)
    return 0
  }
  if (cli.version && argv.includes('--version')) {
    deps.stdout(`${cli.version()}\n`)
    return 0
  }
  return runCommand(deps, async () => {
    const args = parseArgs(argv)
    if (args.command === undefined) throw new CliError('No command given. Run it with --help to see the commands.', 'USAGE')
    const command = Object.hasOwn(cli.commands, args.command) ? cli.commands[args.command]! : undefined
    if (!command) throw new CliError(`Unknown command “${args.command}”. Run it with --help to see the commands.`, 'USAGE')
    const name = `${cli.prefix}${args.command}`
    const flag = [...args.flags].find((f) => !command.flags?.includes(f))
    if (flag) throw new CliError(`Unknown option “${flag}” for ${name}.`, 'USAGE')
    if (args.folder !== undefined && !command.folder) throw new CliError(`Unexpected argument “${args.folder}” for ${name}.`, 'USAGE')
    if (args.folder === undefined && command.folder === 'required') throw new CliError(`${name} needs a folder: ${name} <folder>.`, 'USAGE')
    return command.run(args)
  })
}

/** The first set variable among these names; the error names the first one. */
export function env(deps: CliDeps, ...names: [string, ...string[]]): string {
  const value = names.map((name) => deps.env[name]).find(Boolean)
  if (!value) throw new CliError(`The environment variable ${names[0]} is missing.`, 'USAGE')
  return value
}

// One CI secret serves the site and the CLI: the site reads NUXT_PUBLIC_GINKO_PLATFORM, so the CLI accepts it too.
const PLATFORM_ENV = ['GINKO_PLATFORM', 'NUXT_PUBLIC_GINKO_PLATFORM'] as const

/** The hosted platform from GINKO_PLATFORM (or NUXT_PUBLIC_GINKO_PLATFORM) and GINKO_KEY. */
export function connectPlatform(deps: CliDeps): Platform {
  return createPlatform({ url: env(deps, ...PLATFORM_ENV), key: env(deps, 'GINKO_KEY'), fetch: deps.fetch })
}

/** True when the module at `url` is the started program (argv[1] is the bin link or the file), not an import of a test. */
export function isEntryPoint(url: string): boolean {
  return process.argv[1] !== undefined && realpathSync(process.argv[1]) === fileURLToPath(url)
}
