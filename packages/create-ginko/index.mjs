#!/usr/bin/env node
// npm create ginko <folder> [--preset gastro|docs]: copies template/ into a new folder and sets the
// site id and the Ginko versions. The Ginko packages release together, so they get this package's own version.
// A preset is a small folder in presets/ that is copied over the base template and adds the preset's package.
import { cpSync, existsSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { basename, join, resolve } from 'node:path'

// preset name -> the package it needs, and what the printed next steps say about it
const presets = {
  gastro: { dependency: '@lupinum/ginko-preset-gastro', note: 'Hours and menu read from files. The preset\'s other bricks (notices, lunch, events, gallery) and the owner\'s quick tasks need the Ginko platform.' },
  docs: { dependency: '@lupinum/ginko-docs', note: 'Pages are Markdown files in content/docs. No platform needed.' },
}
const usage = 'Usage: npm create ginko <folder> [--preset gastro|docs]\n\nCreates a Nuxt site with Ginko that reads its content from Markdown files.'

const args = process.argv.slice(2)
let target
let preset
for (let i = 0; i < args.length; i++) {
  const arg = args[i]
  if (arg === '--preset') preset = args[++i] ?? ''
  else if (arg.startsWith('--preset=')) preset = arg.slice('--preset='.length)
  else if (arg.startsWith('-')) { console.log(usage); process.exit(0) }
  else target ??= arg
}
if (preset !== undefined && !(preset in presets)) {
  console.error(`Unknown preset "${preset}". Choose one of: ${Object.keys(presets).join(', ')}.`)
  process.exit(1)
}
if (!target) {
  console.log(usage)
  process.exit(1)
}
const dir = resolve(target)
if (existsSync(dir) && readdirSync(dir).length) {
  console.error(`The folder ${target} exists and is not empty. Choose another name.`)
  process.exit(1)
}
const site = basename(dir).toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'my-site'
if (!/^[a-z]/.test(site)) {
  console.error(`The site id "${site}" must start with a letter. Choose another folder name.`)
  process.exit(1)
}
const own = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'))
cpSync(new URL('./template', import.meta.url), dir, { recursive: true })
// npm drops .gitignore from published packages, so the template carries it as `gitignore`.
renameSync(join(dir, 'gitignore'), join(dir, '.gitignore'))
if (preset) {
  // The base page and sample text give way to the preset's own.
  rmSync(join(dir, 'content/start.md'))
  rmSync(join(dir, 'app/pages/index.vue'))
  cpSync(new URL(`./presets/${preset}`, import.meta.url), dir, { recursive: true })
}
for (const file of ['package.json', 'ginko.config.ts']) {
  const path = join(dir, file)
  writeFileSync(path, readFileSync(path, 'utf8').replaceAll('{{SITE}}', site).replaceAll('{{VERSION}}', own.version))
}
if (preset) {
  const path = join(dir, 'package.json')
  const pkg = JSON.parse(readFileSync(path, 'utf8'))
  pkg.dependencies[presets[preset].dependency] = `^${own.version}`
  if (preset === 'docs') pkg.dependencies['@lupinum/ginko-components'] = `^${own.version}`
  pkg.dependencies = Object.fromEntries(Object.entries(pkg.dependencies).sort(([a], [b]) => a.localeCompare(b)))
  writeFileSync(path, `${JSON.stringify(pkg, null, 2)}\n`)
}
console.log(`Created ${target}${preset ? ` with the ${preset} preset` : ''}. Next:\n\n  cd ${target}\n  npm install\n  npm run dev\n`)
if (preset) console.log(`${presets[preset].note}\n`)
