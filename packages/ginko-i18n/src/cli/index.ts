#!/usr/bin/env node
import { parseArgs } from 'node:util'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { dirManifest, manifest, object, unknownLocale, withLocale, type Manifest } from './data.ts'
import { apply, check, todo } from './commands.ts'

const help = `ginko-i18n check [--locale <code>] [--html <dir>]
ginko-i18n todo --locale <code> [--only missing,stale]
ginko-i18n apply <file|->
Global: --cwd <dir> --build-dir <dir> --dir <folder> --default-locale <code> --json -h/--help --version
Exit: 0 success, 1 errors, rejected items or an invalid manifest, catalog or input, 2 usage`

/**
 * A wrong command line: error code `USAGE`, exit 2. Every other error (manifest, catalogs, input) is `INVALID`, exit 1.
 * The same codes and exit codes as the `ginko` CLI.
 */
class UsageError extends Error {}

/** The version of this package; dist/cli/index.mjs and src/cli/index.ts both sit two folders below package.json. */
const version = () => (JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8')) as { version: string }).version

/** A locale code from the command line must be a locale of `m`. */
function knownLocale(m: Manifest, code: string, what = 'locale') {
  if (!m.locales.some(l => l.code === code)) throw new UsageError(unknownLocale(m, code, what))
  return code
}

// With --json, stdout is exactly one JSON object: `{ ok: true, ...fields }`, or `{ ok: false, error: { code, message }, ...fields }`.
// `--help` and `--version` print plain text, like `ginko --help` and `ginko --version`.
let machine = process.argv.includes('--json')
const print = <T extends { ok: boolean }>(result: T, text: string) => console.log(machine ? JSON.stringify(result) : text)
try {
  const { values, positionals } = (() => {
    try {
      return parseArgs({ allowPositionals: true, options: { 'cwd': { type: 'string' }, 'build-dir': { type: 'string' }, 'dir': { type: 'string' }, 'default-locale': { type: 'string' }, 'json': { type: 'boolean' }, 'help': { type: 'boolean', short: 'h' }, 'version': { type: 'boolean' }, 'html': { type: 'string' }, 'locale': { type: 'string' }, 'only': { type: 'string' } } })
    }
    catch (error) {
      throw new UsageError(`${(error as Error).message}\n${help}`)
    }
  })()
  machine = !!values.json
  if (values.help) {
    console.log(help)
  }
  else if (values.version) {
    console.log(version())
  }
  else {
    const [command = '', file = ''] = positionals
    if (!['check', 'todo', 'apply'].includes(command) || positionals.length > (command === 'apply' ? 2 : 1) || (command === 'apply' && !file) || (command === 'todo' && !values.locale) || (command !== 'check' && values.html) || (command === 'apply' && values.locale) || (command !== 'todo' && values.only)) throw new UsageError(help)
    const only = (values.only ?? 'missing,stale').split(',')
    if (only.some(code => !['missing', 'stale'].includes(code))) throw new UsageError('--only accepts missing,stale')
    if (!!values.dir !== !!values['default-locale']) throw new UsageError(values.dir ? '--dir requires --default-locale <code>' : '--default-locale requires --dir <folder>')
    const cwd = resolve(values.cwd ?? process.cwd())
    const input = command === 'apply' ? JSON.parse(readFileSync(file === '-' ? 0 : resolve(cwd, file), 'utf8')) as unknown : undefined
    let m = values.dir ? dirManifest(resolve(cwd, values.dir), values['default-locale']!) : manifest(cwd, resolve(cwd, values['build-dir'] ?? '.nuxt'))
    if (values.dir) knownLocale(m, m.defaultLocale, 'default locale')
    // In --dir mode a new language starts with `todo --locale es`, then `apply` writes es.json.
    if (values.dir && command === 'todo') {
      try {
        m = withLocale(m, values.locale!)
      }
      catch (error) {
        throw new UsageError((error as Error).message)
      }
    }
    if (values.dir && object(input) && typeof input.locale === 'string') m = withLocale(m, input.locale)
    const locale = values.locale === undefined ? undefined : knownLocale(m, values.locale)
    if (command === 'check') {
      const result = check(m, cwd, values.html ? resolve(cwd, values.html) : undefined, locale)
      print(result, [...result.findings.map(f => `${f.severity} ${f.code} ${f.locale ?? ''} ${f.key ?? ''} ${f.file ?? ''}${f.line ? `:${f.line}` : ''}: ${f.message}`), `${result.summary.errors} errors, ${result.summary.warnings} warnings`].join('\n'))
      process.exitCode = result.ok ? 0 : 1
    }
    else if (command === 'todo') {
      const result = todo(m, cwd, locale!, only)
      print(result, [`Translate ${result.sourceLocale} → ${result.locale}`, ...result.items.map(i => `${i.key} (${i.code}) → ${i.file}: ${i.source}`)].join('\n'))
    }
    else {
      const result = apply(m, cwd, input)
      print(result, [...result.written.map(i => `Written ${i.key}: ${i.file}`), ...result.rejected.map(i => `Rejected ${i.key}: ${i.message}`), ...result.warnings.map(i => `Warning ${i.key}: ${i.message}`)].join('\n'))
      process.exitCode = result.ok ? 0 : 1
    }
  }
}
catch (error) {
  const message = (error as Error).message
  const usage = error instanceof UsageError
  if (machine) console.log(JSON.stringify({ ok: false, error: { code: usage ? 'USAGE' : 'INVALID', message } }))
  else process.stderr.write(`${message}\n`)
  process.exitCode = usage ? 2 : 1
}
