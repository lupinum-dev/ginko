// `ginko-platform setup`: puts a platform project online, on Convex cloud (the backend) and Vercel (the Studio), with
// sign-in mail through Resend. The person logs in to both CLIs first (`npx convex login`, `vercel login`); setup asks
// four questions and runs the rest. Rules:
// - No secret in a command-line argument, in the output or in a log: secrets go to Convex through a temp file (mode
//   0600, always removed) and to Vercel on stdin.
// - Safe to run again: what exists is reused, only missing values are set, a secret is never replaced. A changed Studio
//   address is changed on both sides.
// - A failed step prints what was done and the exact command of the failed step, then exits 1; a second run continues.
// - The local backend of `ginko-platform dev` stays as it is: setup never selects the production deployment in
//   .env.local (`dev` refuses a cloud target there) and never writes a deploy key into it. Every Convex command names
//   the production deployment with `--deployment`, which setup keeps in ginko-platform.json (no secrets in it).
import { randomBytes } from 'node:crypto'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'
import { CliError, isObject } from './model.ts'
import { commandLine, StepError, type CommandRunner, type Step } from './platform-run.ts'

export const QUESTIONS = {
  siteUrl: 'Studio address (press Enter to use the address Vercel gives the project):',
  admin: 'Admin email (this address may sign in first):',
  resendKey: 'Resend API key (input is hidden):',
  mailFrom: 'Sender address for sign-in mail, for example "Studio <login@example.com>":',
} as const

/** What setup knows about the project across runs. No secret goes here; the file may be committed. */
export const STATE_FILE = 'ginko-platform.json'
interface State {
  convex?: {
    /** The `--deployment` reference of the production deployment (`team:project:prod`). */
    deployment: string
    url: string
    siteUrl: string
  }
  /** The Studio address that SITE_URL holds on both sides. */
  siteUrl?: string
  /** A production deploy on Vercel finished once. */
  deployed?: boolean
}

/** The name of the deploy key that setup creates for Vercel's production builds. */
const KEY_NAME = 'ginko-platform-vercel'
/** Vercel sets the client IP in this header; the Studio and the backend trust it only with the proxy secret. */
const CLIENT_IP_HEADER = 'x-real-ip'

export type Ask = (question: string, hidden: boolean) => Promise<string>

export interface SetupOptions {
  siteUrl?: string
  admin?: string
  mailFrom?: string
  /** The Convex and Vercel project name; default: the folder name. */
  project?: string
  /** The Convex team slug, when the account has more than one team. */
  team?: string
  /** The Convex region of the production deployment. */
  region?: string
  dryRun: boolean
}

export interface SetupInput {
  /** The platform project: the folder with convex.json. */
  cwd: string
  options: SetupOptions
  /** RESEND_API_KEY may come from here; nothing else is read. */
  env: NodeJS.ProcessEnv
  run: CommandRunner
  /** Undefined when nobody can answer (no terminal): every missing value must come from an option. */
  ask?: Ask
  log: (line: string) => void
}

/** A step of setup: the program to run, and how it shows in the plan (`--dry-run`) and in a failure. */
interface Planned extends Step {
  title: string
  /** stdin holds a secret: shown as <hidden>. */
  secretInput?: boolean
}

/** A Convex or Vercel project name: lower case letters, digits and dashes. */
export function projectName(dir: string): string {
  return basename(dir).toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'ginko-platform'
}

/** The origin of an http(s) address, or undefined when the text is not one. */
function originOf(text: string): string | undefined {
  try {
    const url = new URL(text.trim())
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.origin : undefined
  } catch {
    return undefined
  }
}

const EMAIL = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/
/** `Studio <login@example.com>` or a bare address. */
const SENDER = /^(?:[^<>]+ <[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+>|[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+)$/

/** Names in `convex env list --names-only` (one per line; a NAME=value line also counts). */
function envNames(output: string): Set<string> {
  return new Set(output.split('\n').map((line) => /^([A-Z_][A-Z0-9_]*)(?:=|$)/.exec(line.trim())?.[1]).filter((name): name is string => !!name))
}

/** The variable names in `vercel env list --format json`, whatever the exact shape around the `key` fields. */
function vercelNames(output: string): Set<string> {
  const names = new Set<string>()
  const walk = (value: unknown) => {
    if (Array.isArray(value)) value.forEach(walk)
    else if (isObject(value)) {
      if (typeof value.key === 'string') names.add(value.key)
      Object.values(value).forEach(walk)
    }
  }
  try {
    walk(JSON.parse(output))
  } catch {
    // no JSON: nothing known, so everything counts as missing (and Vercel refuses an existing one without --force)
  }
  return names
}

/** The production address Vercel gives the project, from `vercel project inspect --format json`. */
function vercelAddress(output: string, project: string): string {
  const found = [...new Set(output.match(/[a-z0-9-]+\.vercel\.app/g) ?? [])]
  return `https://${found.find((host) => host === `${project}.vercel.app`) ?? found[0] ?? `${project}.vercel.app`}`
}

/**
 * The deployment's addresses from its deploy key (`prod:<name>|<secret>`). Convex names a deployment's hosts after it;
 * in a region other than the default one the region is part of the host (not confirmed by a real run).
 */
function convexUrls(key: string, region?: string): { url: string; siteUrl: string } {
  const name = /^prod:([^|]+)\|/.exec(key)![1]!
  const host = region && region !== 'aws-us-east-1' ? `${name}.${region}` : name
  return { url: `https://${host}.convex.cloud`, siteUrl: `https://${host}.convex.site` }
}

const secret = () => randomBytes(32).toString('base64')

/** Shown in the plan and in a failure; stdin and temp files are named, never their secret content. */
function shown(step: Planned): string {
  const line = commandLine(step)
  if (step.input === undefined) return line
  return `${line} < ${step.secretInput ? '<hidden>' : JSON.stringify(step.input)}`
}

export async function setup({ cwd, options, env, run, ask, log }: SetupInput): Promise<void> {
  const dry = options.dryRun
  const project = options.project ?? projectName(cwd)
  const statePath = join(cwd, STATE_FILE)
  const state: State = existsSync(statePath) ? JSON.parse(readFileSync(statePath, 'utf8')) as State : {}
  const save = () => { if (!dry) writeFileSync(statePath, `${JSON.stringify(state, null, 2)}\n`) }
  const deployment = state.convex?.deployment ?? (options.team ? `${options.team}:${project}:prod` : `${project}:prod`)
  const onDeployment = ['--deployment', deployment]
  const linked = existsSync(join(cwd, '.vercel', 'project.json'))

  let number = 0
  const done: string[] = []
  const step = async (planned: Omit<Planned, 'cwd'>, dryResult = ''): Promise<string> => {
    const full: Planned = { cwd, ...planned }
    number++
    if (dry) {
      log(`${number}. ${full.title}\n   ${shown(full)}`)
      return dryResult
    }
    log(`${number}. ${full.title}`)
    try {
      const out = await run(full)
      done.push(full.title)
      return out
    } catch (error) {
      throw error instanceof StepError ? new SetupFailed(number, full, error, done) : error
    }
  }

  if (dry) log('Dry run: these are the steps of a setup in this folder. Nothing runs, nothing changes.\n')

  // Preconditions: both CLIs, logged in. The cheapest read-only command of each.
  try {
    await step({ title: 'Check the Convex login', command: 'npx', args: ['convex', 'login', 'status'] })
  } catch {
    throw new CliError('The Convex CLI is not logged in. Run `npx convex login`, then run setup again.')
  }
  try {
    await step({ title: 'Check the Vercel login', command: 'vercel', args: ['whoami'] })
  } catch (error) {
    const missing = error instanceof SetupFailed && error.cause instanceof StepError && error.cause.missing
    throw new CliError(missing
      ? 'The Vercel CLI is not installed. Run `npm install --global vercel`, then `vercel login`, then run setup again.'
      : 'The Vercel CLI is not logged in. Run `vercel login`, then run setup again.')
  }

  // What the deployment has already (a second run). Names only: values of secrets are never read for this.
  let convexHas = new Set<string>()
  let convexSiteUrl: string | undefined
  if (state.convex) {
    convexHas = envNames(await step({ title: 'Read which values the backend has', command: 'npx', args: ['convex', 'env', 'list', '--names-only', ...onDeployment] }))
    if (convexHas.has('SITE_URL')) {
      convexSiteUrl = originOf(await step({ title: 'Read the Studio address the backend has', command: 'npx', args: ['convex', 'env', 'get', 'SITE_URL', ...onDeployment] }))
    }
  }
  let vercelHas = new Set<string>()
  if (linked) {
    vercelHas = vercelNames(await step({ title: 'Read which values the Vercel project has', command: 'vercel', args: ['env', 'list', 'production', '--format', 'json'] }))
  }

  // The four questions, each only when its value is missing.
  const answer = async (key: keyof typeof QUESTIONS, flag: string, given: string | undefined, valid: (text: string) => boolean, wrong: string): Promise<string> => {
    if (given !== undefined) {
      if (!valid(given)) throw new CliError(`${wrong} (${flag}).`, 'USAGE')
      return given.trim()
    }
    if (dry) return `<${flag.replace(/^--/, '')}>`
    if (!ask) {
      throw new CliError(key === 'resendKey'
        ? 'Without a terminal, setup reads the Resend API key only from the environment variable RESEND_API_KEY.'
        : `Without a terminal, setup needs ${flag}.`, 'USAGE')
    }
    for (;;) {
      const text = (await ask(QUESTIONS[key], key === 'resendKey')).trim()
      if (valid(text)) return text
      log(wrong)
    }
  }

  let siteUrl = options.siteUrl === undefined ? undefined : originOf(options.siteUrl)
  if (options.siteUrl !== undefined && !siteUrl) throw new CliError('The Studio address must be an http(s) address (--site-url).', 'USAGE')
  if (siteUrl === undefined && ask && !dry) {
    if (state.siteUrl) log(`The Studio runs on ${state.siteUrl} now; press Enter to keep it.`)
    for (;;) {
      const text = (await ask(QUESTIONS.siteUrl, false)).trim()
      if (!text) break
      siteUrl = originOf(text)
      if (siteUrl) break
      log('That is not an http(s) address.')
    }
  }
  siteUrl ??= state.siteUrl
  const admin = convexHas.has('GINKO_ADMIN_EMAILS') ? undefined : await answer('admin', '--admin', options.admin, (text) => EMAIL.test(text.trim()), 'That is not an email address')
  const resendKey = convexHas.has('RESEND_API_KEY')
    ? undefined
    : env.RESEND_API_KEY?.trim() || await answer('resendKey', 'RESEND_API_KEY', undefined, (text) => text.length > 0, 'The Resend API key is empty')
  const mailFrom = convexHas.has('GINKO_MAIL_FROM') ? undefined : await answer('mailFrom', '--mail-from', options.mailFrom, (text) => SENDER.test(text.trim()), 'That is not a sender address like "Studio <login@example.com>"')

  let changed = false

  // The Vercel project first: its address is the default Studio address.
  if (!linked) {
    await step({ title: `Create the Vercel project ${project}`, command: 'vercel', args: ['project', 'create', project] })
    await step({ title: 'Link this folder to it', command: 'vercel', args: ['link', '--yes', '--project', project] })
    changed = true
  }
  if (!siteUrl) {
    const inspected = await step({ title: 'Read the address Vercel gives the project', command: 'vercel', args: ['project', 'inspect', project, '--format', 'json'] })
    siteUrl = dry ? '<the address Vercel gives the project>' : vercelAddress(inspected, project)
  }

  // The Convex project, its production deployment, and a deploy key for Vercel's production builds.
  let deployKey: string | undefined
  if (!state.convex) {
    await step({ title: `Create the Convex project ${project}`, command: 'npx', args: ['convex', 'project', 'create', project, ...(options.team ? ['--team', options.team] : [])] })
    await step({ title: 'Create its production deployment', command: 'npx', args: ['convex', 'deployment', 'create', deployment, '--type', 'prod', '--default', ...(options.region ? ['--region', options.region] : [])] })
    changed = true
  }
  if (!state.convex || !vercelHas.has('CONVEX_DEPLOY_KEY')) {
    const printed = await step({ title: 'Create a deploy key for Vercel', command: 'npx', args: ['convex', 'deployment', 'token', 'create', KEY_NAME, ...onDeployment] }, 'prod:<deployment>|<hidden>')
    deployKey = printed.split('\n').map((line) => line.trim()).find((line) => /^prod:[^|\s]+\|\S+$/.test(line))
    if (!deployKey) throw new CliError('Convex printed no production deploy key (prod:…); nothing more was changed. Run setup again.')
    if (!state.convex) {
      state.convex = { deployment, ...(dry ? { url: 'https://<deployment>.convex.cloud', siteUrl: 'https://<deployment>.convex.site' } : convexUrls(deployKey, options.region)) }
      save()
    }
  }
  const convex = state.convex!

  // The proxy secret must be the same on both sides; only Convex can hand it over (a Vercel secret cannot be read).
  let proxySecret: string | undefined
  if (!convexHas.has('BCN_AUTH_PROXY_IP_SECRET')) {
    if (vercelHas.has('BCN_AUTH_PROXY_IP_SECRET')) {
      throw new CliError('BCN_AUTH_PROXY_IP_SECRET is set on Vercel but not on the backend, and a Vercel secret cannot be read back. Run `vercel env rm BCN_AUTH_PROXY_IP_SECRET production --yes`, then run setup again.')
    }
    proxySecret = secret()
  } else if (!vercelHas.has('BCN_AUTH_PROXY_IP_SECRET')) {
    proxySecret = (await step({ title: 'Read the proxy secret for Vercel', command: 'npx', args: ['convex', 'env', 'get', 'BCN_AUTH_PROXY_IP_SECRET', ...onDeployment] }, '<hidden>')).trim()
  }

  // The backend's values: only the missing ones, plus SITE_URL when the address changed.
  const addressChanged = convexSiteUrl !== undefined && convexSiteUrl !== siteUrl
  const backend: [string, string, boolean][] = []
  const want = (name: string, value: string | undefined, isSecret: boolean) => {
    if (value !== undefined && (!convexHas.has(name) || (name === 'SITE_URL' && addressChanged))) backend.push([name, value, isSecret])
  }
  want('SITE_URL', siteUrl, false)
  want('BETTER_AUTH_SECRETS', `1:${secret()}`, true)
  want('BCN_AUTH_PROXY_IP_SECRET', proxySecret, true)
  want('GINKO_ADMIN_EMAILS', admin, false)
  want('GINKO_MAIL', 'resend', false)
  want('GINKO_MAIL_FROM', mailFrom, false)
  want('RESEND_API_KEY', resendKey, true)
  if (backend.length) {
    const args = ['convex', 'env', 'set', '--from-file', '<file>', ...onDeployment, ...(addressChanged ? ['--force'] : [])]
    const title = `Set ${backend.map(([name]) => name).join(', ')} on the backend`
    if (dry) {
      await step({ title, command: 'npx', args: args.map((arg) => (arg === '<file>' ? '<temp file, mode 0600, removed afterwards>' : arg)) })
      for (const [name, value, isSecret] of backend) log(`   ${name}=${isSecret ? '<hidden>' : value}`)
    } else {
      const folder = mkdtempSync(join(tmpdir(), 'ginko-setup-'))
      const file = join(folder, 'values.env')
      try {
        writeFileSync(file, backend.map(([name, value]) => `${name}=${value}\n`).join(''), { mode: 0o600 })
        await step({ title, command: 'npx', args: args.map((arg) => (arg === '<file>' ? file : arg)) })
      } finally {
        rmSync(folder, { recursive: true, force: true })
      }
    }
    changed = true
  }

  // The Studio's values on Vercel, Production only, each on stdin.
  const studio: [string, string | undefined, boolean][] = [
    ['CONVEX_DEPLOY_KEY', deployKey, true],
    ['BCN_AUTH_PROXY_IP_SECRET', proxySecret, true],
    ['NUXT_PUBLIC_CONVEX_URL', convex.url, false],
    ['NUXT_PUBLIC_CONVEX_SITE_URL', convex.siteUrl, false],
    ['CONVEX_SITE_URL', convex.siteUrl, false],
    ['SITE_URL', siteUrl, false],
    ['BCN_AUTH_TRUSTED_CLIENT_IP_HEADER', CLIENT_IP_HEADER, false],
  ]
  for (const [name, value, isSecret] of studio) {
    const replace = name === 'SITE_URL' && addressChanged
    if (value === undefined || (vercelHas.has(name) && !replace)) continue
    await step({
      title: `Set ${name} on Vercel`,
      command: 'vercel',
      args: ['env', 'add', name, 'production', isSecret ? '--sensitive' : '--no-sensitive', ...(replace ? ['--force'] : [])],
      input: value,
      secretInput: isSecret,
    })
    changed = true
  }
  state.siteUrl = siteUrl
  save()

  // The deploy: Vercel runs `ginko-platform build`, which deploys the backend first. Then the auth signing key, which
  // needs the deployed functions.
  if (changed || !state.deployed) {
    await step({ title: 'Deploy the backend and the Studio on Vercel (a few minutes)', command: 'vercel', args: ['deploy', '--prod', '--yes'], show: true })
    state.deployed = true
    save()
    await step({ title: 'Create the sign-in signing key', command: 'npx', args: ['convex', 'run', 'auth:ensureSigningKey', '{}', ...onDeployment] })
  } else {
    log('Nothing changed, so nothing was deployed.')
  }

  log([
    '',
    dry ? 'After a real run:' : `The Studio runs on ${siteUrl}`,
    ...(dry ? [`The Studio runs on ${siteUrl}`] : []),
    `Sign in with ${admin ?? 'an address from GINKO_ADMIN_EMAILS'}. The sign-in code comes by mail; the first sign-in makes that address the admin.`,
    'Resend sends only from a domain you verified in Resend; until then, sign-in mail is not delivered.',
    `Your own domain: add it to the Vercel project ${project}, then run \`npx ginko-platform setup --site-url https://<your domain>\`.`,
    'Updates: raise the @lupinum/ginko versions in package.json and run `vercel deploy --prod` (or push, when the Vercel project is connected to Git). The build deploys the backend first and starts its data migrations.',
    '',
  ].join('\n'))
}

/** A failed step: what was done, and the command to run again. */
export class SetupFailed extends CliError {
  constructor(number: number, step: Planned, cause: StepError, done: string[]) {
    super([
      `Setup stopped at step ${number}: ${step.title}.`,
      `Done before it: ${done.length ? done.join('; ') : 'nothing'}.`,
      'The command that failed (run setup again to continue from here):',
      `  ${shown(step)}`,
      cause.reason,
    ].join('\n'))
    this.cause = cause
  }
}
