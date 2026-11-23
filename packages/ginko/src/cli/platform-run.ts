// The one way `ginko-platform build` and `ginko-platform setup` run another program (the Convex CLI, the Vercel CLI,
// Nuxt). Tests replace the runner, so a test sees every command line and every stdin text.
import { spawn } from 'node:child_process'
import { failureOf } from './local.ts'
import { CliError } from './model.ts'

export interface Step {
  command: string
  args: string[]
  cwd: string
  /** Text for the program's stdin. A secret goes here or into a file, never into `args`. */
  input?: string
  /** Stream the program's output to the terminal (deploys and builds take minutes); stdout is still returned. */
  show?: boolean
  /** Return stderr after stdout: the Convex CLI writes its status lines (the teams of `login status`) to stderr. */
  stderr?: boolean
}

/** Runs a step to its end and returns its stdout; a failing step throws a StepError. */
export type CommandRunner = (step: Step) => Promise<string>

/** A step that failed. The command line holds no secret, so it is safe to print for the person to run again. */
export class StepError extends CliError {
  readonly step: Step
  readonly reason: string
  /** The program is not installed (ENOENT). */
  readonly missing: boolean

  constructor(step: Step, reason: string, missing = false) {
    super(`${commandLine(step)} failed: ${reason}`)
    this.step = step
    this.reason = reason
    this.missing = missing
  }
}

/** The step as a person types it in a shell. */
export function commandLine(step: Pick<Step, 'command' | 'args'>): string {
  return [step.command, ...step.args].map((part) => (/^[\w@%+=:,./<>-]+$/.test(part) ? part : `'${part.replaceAll("'", `'\\''`)}'`)).join(' ')
}

export const realRunner: CommandRunner = (step) => new Promise((done, fail) => {
  const child = spawn(step.command, step.args, { cwd: step.cwd, env: process.env, stdio: ['pipe', 'pipe', 'pipe'] })
  let out = ''
  let err = ''
  child.stdout.setEncoding('utf8').on('data', (chunk: string) => {
    out += chunk
    if (step.show) process.stdout.write(chunk)
  })
  child.stderr.setEncoding('utf8').on('data', (chunk: string) => {
    err += chunk
    if (step.show) process.stderr.write(chunk)
  })
  child.on('error', (error: NodeJS.ErrnoException) => fail(new StepError(step, error.message, error.code === 'ENOENT')))
  child.on('close', (code) => {
    if (code === 0) return done(step.stderr ? out + err : out)
    fail(new StepError(step, `exit code ${code}${step.show ? '' : `: ${failureOf(err || out)}`}`))
  })
  child.stdin.end(step.input ?? '')
})
