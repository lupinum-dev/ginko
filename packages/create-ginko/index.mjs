#!/usr/bin/env node
// npm create ginko <folder> [-- --preset gastro|docs] [--lang en|de]: copies template/ into a new folder and sets
// the site id and the Ginko versions. The Ginko packages release together, so they get this package's own version.
// A preset is a small folder in presets/ that is copied over the base template and adds the preset's packages.
// German: template-de/ goes over the base template; a preset has its own folder `<preset>-de`.
import { cpSync, existsSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { basename, join, resolve } from 'node:path'
import { supportsNode } from './node-version.mjs'

// preset name -> the packages it adds (its own package, then the Ginko peers of that package that the base template
// lacks; test/create-ginko.test.ts checks this against the packages' metadata), and what the next steps say about it
const presets = {
  gastro: { packages: ['@lupinum/ginko-preset-gastro'], note: 'Hours and menu read from files. The preset\'s other bricks (notices, lunch, events, gallery) and the owner\'s quick tasks need the Ginko platform.' },
  docs: { packages: ['@lupinum/ginko-docs', '@lupinum/ginko-i18n'], note: 'Pages are Markdown files in content/docs. No platform needed.' },
}
const langs = { en: 'English', de: 'German' }
const command = 'npm create ginko@latest'
const usage = `Usage: ${command} <folder> -- [--preset gastro|docs] [--lang en|de]

Creates a Nuxt site with Ginko that reads its content from Markdown files.

  --preset <name>  start from a preset: gastro (restaurant) or docs (documentation)
  --lang <code>    language of the sample site: en (default) or de
  -h, --help       show this help

With npm, write -- before the options. Without it, npm keeps them for itself.`

/** Prints the problem and the usage, and stops without creating anything. */
function fail(message) {
  console.error(`${message}\n\n${usage}`)
  process.exit(1)
}

const args = process.argv.slice(2)
let target
let preset
let lang = 'en'
for (let i = 0; i < args.length; i++) {
  const arg = args[i]
  // pnpm and yarn may pass the `--` of `pnpm create ginko my-site -- --preset gastro` through.
  if (arg === '--') continue
  if (arg === '-h' || arg === '--help') { console.log(usage); process.exit(0) }
  if (arg === '--preset' || arg === '--lang') {
    const value = args[++i]
    if (!value || value.startsWith('-')) fail(`${arg} needs a value.`)
    if (arg === '--preset') preset = value
    else lang = value
  }
  else if (arg.startsWith('--preset=')) preset = arg.slice('--preset='.length)
  else if (arg.startsWith('--lang=')) lang = arg.slice('--lang='.length)
  else if (arg.startsWith('-')) fail(`Unknown option "${arg}".`)
  else if (target === undefined) target = arg
  // npm drops `--preset` written without `--` and passes only its value, so a second name is almost always that.
  else if (Object.hasOwn(presets, arg)) fail(`Unexpected argument "${arg}". npm drops --preset when it comes before --. Write:\n  ${command} ${target} -- --preset ${arg}`)
  else if (Object.hasOwn(langs, arg)) fail(`Unexpected argument "${arg}". npm drops --lang when it comes before --. Write:\n  ${command} ${target} -- --lang ${arg}`)
  else fail(`Unexpected argument "${arg}". Give one folder name.`)
}
if (preset !== undefined && !Object.hasOwn(presets, preset)) {
  fail(`Unknown preset "${preset}". Choose one of: ${Object.keys(presets).join(', ')}.`)
}
if (!Object.hasOwn(langs, lang)) fail(`Unknown language "${lang}". Choose one of: ${Object.keys(langs).join(', ')}.`)
const presetDir = preset && (lang === 'en' ? preset : `${preset}-${lang}`)
if (presetDir && !existsSync(new URL(`./presets/${presetDir}`, import.meta.url))) {
  fail(`The ${preset} preset has no ${langs[lang]} version yet. Leave out --lang ${lang}.`)
}
if (!target) fail('Give the name of the folder to create.')
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
// A warning, not an error: the site is still created, and the user may run it on another Node.
if (!supportsNode(process.versions.node, own.engines.node)) {
  console.warn(`Warning: Ginko needs Node ${own.engines.node}, but this is Node ${process.versions.node}. The site is created, but install and dev may fail or print warnings. Switch to a supported Node version before you run "install".\n`)
}
cpSync(new URL('./template', import.meta.url), dir, { recursive: true })
// npm drops .gitignore from published packages, so the template carries it as `gitignore`.
renameSync(join(dir, 'gitignore'), join(dir, '.gitignore'))
if (presetDir) {
  // The base page and sample text give way to the preset's own.
  rmSync(join(dir, 'content/start.md'))
  rmSync(join(dir, 'app/pages/index.vue'))
  cpSync(new URL(`./presets/${presetDir}`, import.meta.url), dir, { recursive: true })
}
else if (lang !== 'en') cpSync(new URL(`./template-${lang}`, import.meta.url), dir, { recursive: true })
for (const file of ['package.json', 'ginko.config.ts']) {
  const path = join(dir, file)
  writeFileSync(path, readFileSync(path, 'utf8').replaceAll('{{SITE}}', site).replaceAll('{{VERSION}}', own.version))
}
if (preset) {
  const path = join(dir, 'package.json')
  const pkg = JSON.parse(readFileSync(path, 'utf8'))
  for (const name of presets[preset].packages) pkg.dependencies[name] = `^${own.version}`
  pkg.dependencies = Object.fromEntries(Object.entries(pkg.dependencies).sort(([a], [b]) => a.localeCompare(b)))
  writeFileSync(path, `${JSON.stringify(pkg, null, 2)}\n`)
}

// The next steps name the package manager that ran us (npm, pnpm, yarn or bun), and quote a folder a shell would split.
const agent = (process.env.npm_config_user_agent ?? '').split('/')[0]
const pm = ['pnpm', 'yarn', 'bun'].includes(agent) ? agent : 'npm'
const cd = /^[\w./-]+$/.test(target) ? target : `'${target.replaceAll('\'', '\'\\\'\'')}'`
console.log(`Created ${target} from the ${preset ? `${preset} preset` : 'plain starter'} in ${langs[lang]}.`)
if (site !== basename(dir)) console.log(`The site id is "${site}": the folder name in lower case, with other characters replaced by "-", at most 40 characters. Change \`site\` in ginko.config.ts to use another one.`)
if (preset) console.log(presets[preset].note)
// npm keeps options for itself unless they come after --; pnpm, yarn and bun pass them on.
const example = pm === 'npm' ? `${command} my-site -- --preset gastro` : `${pm} create ginko my-site --preset gastro`
console.log(`Other starters: --preset gastro, --preset docs; German sample: --lang de.${pm === 'npm' ? ' With npm, put -- before them:' : ''}
  ${example}

Next:

  cd ${cd}
  ${pm} install
  ${pm} run dev
`)
