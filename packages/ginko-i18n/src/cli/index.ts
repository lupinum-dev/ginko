#!/usr/bin/env node
import { parseArgs } from 'node:util'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { dirManifest, manifest } from './data.ts'
import { apply, check, todo } from './commands.ts'

const help = `ginko-i18n check [--locale <code>] [--site <dir>]
ginko-i18n todo --to <code> [--only missing,stale]
ginko-i18n apply <file|->
Global: --cwd <dir> --build-dir <dir> --dir <folder> --default <code> --json --help
Exit: 0 success, 1 errors/rejected items, 2 usage/config error`
let machine = process.argv.includes('--json')
try {
  const { values, positionals } = parseArgs({ allowPositionals: true, options: { 'cwd': { type: 'string' }, 'build-dir': { type: 'string' }, 'dir': { type: 'string' }, 'default': { type: 'string' }, 'json': { type: 'boolean' }, 'help': { type: 'boolean' }, 'site': { type: 'string' }, 'locale': { type: 'string' }, 'to': { type: 'string' }, 'only': { type: 'string' } } })
  machine = !!values.json
  if (values.help) {
    console.log(machine ? JSON.stringify({ help }) : help)
  }
  else {
    const [command = '', file = ''] = positionals
    if (!['check', 'todo', 'apply'].includes(command) || positionals.length > (command === 'apply' ? 2 : 1) || (command === 'apply' && !file) || (command === 'todo' && !values.to) || (command !== 'check' && (values.site || values.locale)) || (command !== 'todo' && (values.to || values.only))) throw new Error(help)
    const only = (values.only ?? 'missing,stale').split(',')
    if (only.some(code => !['missing', 'stale'].includes(code))) throw new Error('--only accepts missing,stale')
    if (!!values.dir !== !!values.default) throw new Error(values.dir ? '--dir requires --default <code>' : '--default requires --dir <folder>')
    const cwd = resolve(values.cwd ?? process.cwd())
    const m = values.dir ? dirManifest(resolve(cwd, values.dir), values.default!, values.to) : manifest(cwd, resolve(cwd, values['build-dir'] ?? '.nuxt'))
    if (command === 'check') {
      const result = check(m, cwd, values.site ? resolve(cwd, values.site) : undefined, values.locale)
      console.log(machine ? JSON.stringify(result) : [...result.findings.map(f => `${f.severity} ${f.code} ${f.locale ?? ''} ${f.key ?? ''} ${f.file ?? ''}${f.line ? `:${f.line}` : ''}: ${f.message}`), `${result.summary.errors} errors, ${result.summary.warnings} warnings`].join('\n'))
      process.exitCode = result.ok ? 0 : 1
    }
    else if (command === 'todo') {
      const result = todo(m, cwd, values.to!, only)
      console.log(machine ? JSON.stringify(result) : [`Translate ${result.sourceLocale} → ${result.locale}`, ...result.items.map(i => `${i.key} (${i.reason}) → ${i.target}: ${i.source}`)].join('\n'))
    }
    else {
      const input = JSON.parse(readFileSync(file === '-' ? 0 : resolve(cwd, file), 'utf8')) as unknown
      const result = apply(m, cwd, input)
      console.log(machine ? JSON.stringify(result) : [...result.written.map(i => `Written ${i.key}: ${i.file}`), ...result.rejected.map(i => `Rejected ${i.key}: ${i.reason}`), ...result.warnings.map(i => `Warning ${i.key}: ${i.message}`)].join('\n'))
      process.exitCode = result.rejected.length ? 1 : 0
    }
  }
}
catch (error) {
  const message = (error as Error).message
  if (machine) console.log(JSON.stringify({ error: message }))
  else process.stderr.write(`${message}\n`)
  process.exitCode = 2
}
