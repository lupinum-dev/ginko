#!/usr/bin/env node
// npm create ginko <folder> [-- --template <name>] [--locales a,b]: copies a template into a new folder and sets the
// site id and the Ginko versions. The Ginko packages release together, so they get this package's own version.
// --template: a complete site from templates/<name> (bundled by build.mjs from the repository's templates/). Its
// languages are pruned to --locales (template-files.mjs), its sample dates move to this week, and its site id is set.
// Without --template: the plain starter in template/ (German: template-de/ over it). --preset (deprecated) copies a
// small folder from presets/ over the plain starter and adds the preset's packages; `<preset>-de` is its German one.
import { randomBytes } from 'node:crypto'
import { cpSync, existsSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { basename, join, resolve } from 'node:path'
import { supportsNode } from './node-version.mjs'
import { pruneLocales, shiftDates, weeksShift } from './template-files.mjs'

// preset name -> the packages it adds (its own package, then the Ginko peers of that package that the base template
// lacks; test/create-ginko.test.ts checks this against the packages' metadata), and what the next steps say about it
const presets = {
  gastro: { packages: ['@lupinum/ginko-preset-gastro'], note: 'Hours and menu read from files. The preset\'s other bricks (notices, lunch, events, gallery) and the owner\'s quick tasks need the Ginko platform.' },
  docs: { packages: ['@lupinum/ginko-docs'], note: 'Pages are Markdown files in content/docs. No platform needed.' },
}
const langs = { en: 'English', de: 'German' }
// The templates bundled into this package (build.mjs); none in a repository checkout before `pnpm build`.
const templatesDir = new URL('./templates/', import.meta.url)
const templates = existsSync(templatesDir) ? readdirSync(templatesDir).filter((name) => statSync(new URL(name, templatesDir)).isDirectory()).sort() : []
/** Each bundled template's languages, from its manifest (build.mjs). */
const templateLocales = Object.fromEntries(templates.map((name) => [name, JSON.parse(readFileSync(new URL(`${name}.json`, templatesDir), 'utf8')).locales]))
const command = 'npm create ginko@latest'
const usage = `Usage: ${command} <folder> -- [--template <name>] [--locales <codes>]

Creates a Nuxt site with Ginko that reads its content from Markdown files.

  --template <name>   start from a template: ${templates.join(', ') || '(none bundled)'}
  --locales <codes>   the languages to keep, comma-separated; the first is the main language
                      (default: all of the template's; without --template: en or de)
  --preset <name>     deprecated: the older starters gastro (restaurant) and docs (documentation)
  --locale <code>     deprecated: use --locales
  -h, --help          show this help

With npm, write -- before the options. Without it, npm keeps them for itself.`

/** Prints the problem and the usage, and stops without creating anything. Exit 2 is a usage error, as in `ginko`. */
function fail(message) {
  console.error(`${message}\n\n${usage}`)
  process.exit(2)
}

const args = process.argv.slice(2)
const options = { '--template': undefined, '--locales': undefined, '--preset': undefined, '--locale': undefined }
let target
for (let i = 0; i < args.length; i++) {
  const arg = args[i]
  // pnpm and yarn may pass the `--` of `pnpm create ginko my-site -- --template starter` through.
  if (arg === '--') continue
  if (arg === '-h' || arg === '--help') { console.log(usage); process.exit(0) }
  const [name, inline] = arg.startsWith('--') && arg.includes('=') ? [arg.slice(0, arg.indexOf('=')), arg.slice(arg.indexOf('=') + 1)] : [arg, undefined]
  if (Object.hasOwn(options, name)) {
    const value = inline ?? args[++i]
    if (!value || value.startsWith('-')) fail(`${name} needs a value.`)
    options[name] = value
  }
  else if (arg.startsWith('-')) fail(`Unknown option "${arg}".`)
  else if (target === undefined) target = arg
  // npm drops an option written without `--` and passes only its value, so a second name is almost always that.
  else if (templates.includes(arg)) fail(`Unexpected argument "${arg}". npm drops --template when it comes before --. Write:\n  ${command} ${target} -- --template ${arg}`)
  else if (Object.hasOwn(presets, arg)) fail(`Unexpected argument "${arg}". npm drops --preset when it comes before --. Write:\n  ${command} ${target} -- --preset ${arg}`)
  else if (Object.hasOwn(langs, arg)) fail(`Unexpected argument "${arg}". npm drops --locales when it comes before --. Write:\n  ${command} ${target} -- --locales ${arg}`)
  else fail(`Unexpected argument "${arg}". Give one folder name.`)
}
const { '--template': template, '--preset': preset } = options
// The old flags still work for one minor release; each says what replaces it.
if (preset !== undefined) console.warn(`Note: --preset is deprecated and will be removed; use --template <name> (${templates.join(', ')}).`)
if (options['--locale'] !== undefined) console.warn('Note: --locale is deprecated and will be removed; use --locales.')
if (options['--locale'] !== undefined && options['--locales'] !== undefined) fail('Use --locales, not both --locales and --locale.')
if (template !== undefined && preset !== undefined) fail('Use --template or --preset, not both.')
const locales = (options['--locales'] ?? options['--locale'])?.split(',').map((code) => code.trim()).filter((code, i, all) => code && all.indexOf(code) === i)
if (locales?.length === 0) fail('--locales needs at least one language code.')
if (template !== undefined && !templates.includes(template)) {
  fail(templates.length ? `Unknown template "${template}". Choose one of: ${templates.join(', ')}.` : 'This copy of create-ginko has no templates. In the Ginko repository, run `pnpm build` first.')
}
const manifest = template && JSON.parse(readFileSync(new URL(`${template}.json`, templatesDir), 'utf8'))
if (manifest) {
  const unknown = (locales ?? []).filter((code) => !manifest.locales.includes(code))
  if (unknown.length) fail(`Unknown locale ${unknown.map((code) => `"${code}"`).join(', ')}. The ${template} template has: ${manifest.locales.join(', ')}.`)
}
if (preset !== undefined && !Object.hasOwn(presets, preset)) {
  fail(`Unknown preset "${preset}". Choose one of: ${Object.keys(presets).join(', ')}.`)
}
// The plain starter and the presets have one language each.
const lang = template ? undefined : locales?.[0] ?? 'en'
if (!template && locales && locales.length > 1) fail(`The ${preset ? `${preset} preset` : 'plain starter'} has one language. Choose one of: ${Object.keys(langs).join(', ')}, or use a --template.`)
if (lang !== undefined && !Object.hasOwn(langs, lang)) fail(`Unknown language "${lang}". Choose one of: ${Object.keys(langs).join(', ')}.`)
const presetDir = preset && (lang === 'en' ? preset : `${preset}-${lang}`)
if (presetDir && !existsSync(new URL(`./presets/${presetDir}`, import.meta.url))) {
  fail(`The ${preset} preset has no ${langs[lang]} version yet. Leave out --locales ${lang}.`)
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
/** A language's English name (`de` → German), for the messages. */
const languageName = (code) => langs[code] ?? new Intl.DisplayNames(['en'], { type: 'language' }).of(code) ?? code
const writeJson = (path, value) => writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`)
let chosen = lang ? [lang] : manifest.locales
let moved = 0
if (template) {
  cpSync(new URL(template, templatesDir), dir, { recursive: true })
  if (existsSync(join(dir, 'gitignore'))) renameSync(join(dir, 'gitignore'), join(dir, '.gitignore'))
  chosen = locales ?? manifest.locales
  if (chosen.join() !== manifest.locales.join()) {
    try {
      pruneLocales(dir, manifest.locales, chosen)
    } catch (error) {
      rmSync(dir, { recursive: true, force: true })
      console.error(`Could not set the languages: ${error.message}`)
      process.exit(1)
    }
  }
  const config = join(dir, 'ginko.config.ts')
  writeFileSync(config, readFileSync(config, 'utf8').replace(/(\bsite:\s*)(['"])[^'"]*\2/, `$1'${site}'`))
  const path = join(dir, 'package.json')
  const pkg = JSON.parse(readFileSync(path, 'utf8'))
  pkg.name = site
  for (const field of ['dependencies', 'devDependencies']) {
    for (const name of Object.keys(pkg[field] ?? {})) if (name.startsWith('@lupinum/ginko')) pkg[field][name] = `^${own.version}`
  }
  // Sample dates move by whole weeks to today (spec T10), so a new site does not open with past events.
  const anchor = pkg.ginko?.sampleAnchor
  if (anchor) {
    const days = weeksShift(anchor, new Date().toISOString().slice(0, 10))
    moved = shiftDates(dir, manifest.shift, days).length
    pkg.ginko.sampleAnchor = new Date(Date.parse(`${anchor}T00:00:00Z`) + days * 864e5).toISOString().slice(0, 10)
  }
  // Which shared sources the template uses matters only inside the Ginko repository.
  if (pkg.ginko) delete pkg.ginko.features
  writeJson(path, pkg)
}
else {
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
    writeJson(path, pkg)
  }
}

// The share cards (nuxt-og-image) sign their URLs with this secret; `nuxt dev` and `nuxt preview` read .env.
writeFileSync(join(dir, '.env'), `# Signs the share card URLs. Set the same variable where the site runs.\nNUXT_APP_SECRET=${randomBytes(32).toString('hex')}\n`)

// The next steps name the package manager that ran us (npm, pnpm, yarn or bun), and quote a folder a shell would split.
const agent = (process.env.npm_config_user_agent ?? '').split('/')[0]
const pm = ['pnpm', 'yarn', 'bun'].includes(agent) ? agent : 'npm'
const cd = /^[\w./-]+$/.test(target) ? target : `'${target.replaceAll('\'', '\'\\\'\'')}'`
const from = template ? `the ${template} template` : preset ? `the ${preset} preset` : 'the plain starter'
console.log(`Created ${target} from ${from} in ${chosen.map(languageName).join(' and ').replace(/ and (?=.* and )/g, ', ')}.`)
if (site !== basename(dir)) console.log(`The site id is "${site}": the folder name in lower case, with other characters replaced by "-", at most 40 characters. Change \`site\` in ginko.config.ts to use another one.`)
if (moved) console.log(`The sample dates in ${moved} content file${moved === 1 ? '' : 's'} moved to this week.`)
if (preset) console.log(presets[preset].note)
// npm keeps options for itself unless they come after --; pnpm, yarn and bun pass them on.
// The example names the starter, the template to begin with, whatever else the list holds.
const sample = templates.includes('starter') ? 'starter' : templates[0] ?? 'starter'
const example = pm === 'npm' ? `${command} my-site -- --template ${sample}` : `${pm} create ginko my-site --template ${sample}`
console.log(`Templates (languages for --locales): ${templates.map((name) => `${name} (${templateLocales[name].join(', ')})`).join(', ')}.${pm === 'npm' ? ' With npm, put -- before the options:' : ''}
  ${example}

Next:

  cd ${cd}
  ${pm} install
  ${pm} run dev

Before you deploy, set NUXT_APP_SECRET where the site runs (any 32 or more random characters, .env has one).
Without it, the share cards of a server-rendered site answer with an error; a static build needs none.
`)
