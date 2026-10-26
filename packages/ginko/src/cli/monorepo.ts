// Tools for the Ginko monorepo, not part of the published `ginko` command (they need packages/ginko-server):
//   pnpm local:dev    --config <file>   local Convex backend, platform and site (dev.ts)
//   pnpm local:import <folder>          an export folder into the local platform (import.ts)
//   pnpm local:pull                     production content into the local platform (pull.ts)
//   pnpm local:files-export --config <file> [folder]  the site's content files as an export folder (files-export.ts)
//   pnpm ops:import <folder> --site <slug> --prod [--reset]  an export folder into an EMPTY site of the hosted platform
//                                                     (operators; import.ts); --reset clears it first (demo platform only)
// The root package.json runs this file; the package build leaves it out. Output and exit codes as `ginko` (run.ts).
// pnpm runs root scripts in the repository root, also with -w from a site folder, so local:dev has no default config:
// ./ginko.config.ts would be the root's, which does not exist.
import { dirname, resolve } from 'node:path'
import { runDev } from './dev.ts'
import { siteOfKey } from './export.ts'
import { filesExport } from './files-export.ts'
import { importSite, postFile } from './import.ts'
import { connectLocal, connectProd } from './local.ts'
import { CliError } from './model.ts'
import { pull } from './pull.ts'
import { connectPlatform, env, isEntryPoint, realDeps, runCli, type Args, type CliDeps, type ExitCode } from './run.ts'

const USAGE = `Usage: pnpm local:<command> | pnpm ops:import   (Ginko monorepo only, run in the repository root)

Commands:
  local:dev --config <file>
                         Start the local platform and the site; schema changes go to the local platform at once.
  local:import <folder>  Load an export folder into the local platform. Replaces the site's content there.
  local:files-export --config <file> [folder]
                         Write the site's content/ files as an export folder (default ginko-export-<site>-files),
                         ready for local:import. Every brick counts as file content, whatever its source.
  local:pull             Copy content from production to the local platform (export, then import).
                         Needs GINKO_PLATFORM and GINKO_KEY (scope pull or export).
  ops:import <folder> --site <slug> --prod [--reset]
                         For Lupinum operators: load an export folder into the EMPTY site <slug> of the hosted platform
                         (runs \`npx convex run --prod\`; needs Convex access to production). Run \`ginko release\` for the
                         site first: the schema is not pushed here. Refuses a site that has entries, changes or edits.
                         With --reset it clears the site first; only the demo platform (GINKO_DEMO=1) allows that.

Options:
  --site <slug>     ops:import: the site on the platform
  --prod            ops:import: required; confirms that production is meant
  --no-wait         import, ops:import: return without waiting for the images to be processed
  --wait-timeout <seconds>  import, ops:import: longest wait for the images (default 600)
  --reset           ops:import: replace the site's content (demo platform only)
  --config <file>   Path to the site's ginko.config.ts, required by local:dev; packages/ginko-server is searched from there
                    (without it: from the current folder)
  -h, --help        Show this help
`

/** `--no-wait` and `--wait-timeout <seconds>` as importSite options. */
const waiting = (args: Args) => ({ wait: !args.flags.has('--no-wait'), ...(args.waitTimeout === undefined ? {} : { waitTimeoutMs: args.waitTimeout * 1000 }) })

export function main(argv: string[], deps: CliDeps = realDeps()): Promise<ExitCode> {
  const upload = (url: string, bytes: Uint8Array<ArrayBuffer>, mime: string) => postFile(deps.fetch, url, bytes, mime)
  // The local check comes first: a wrong target stops before anything is read or written.
  const local = (args: Args) => connectLocal(args.config ? dirname(resolve(args.config)) : process.cwd(), `local:${args.command}`)

  return runCli(argv, deps, {
    prefix: argv[0]?.startsWith('ops:') ? '' : 'local:',
    usage: USAGE,
    commands: {
      dev: {
        async run(args) {
          if (!args.config) throw new CliError('local:dev needs --config <site>/ginko.config.ts.', 'USAGE')
          if ((await runDev({ configPath: resolve(args.config), log: deps.log })) !== 0) throw new CliError('local:dev stopped because one of its processes ended.')
          return {}
        },
      },
      import: {
        folder: 'required',
        flags: ['--no-wait'],
        waitTimeout: true,
        async run(args) {
          const run = local(args)
          const done = await importSite({ dir: args.folder!, run, upload, log: deps.log, ...waiting(args), again: `pnpm local:import ${args.folder!}` })
          return { dir: args.folder, ...done }
        },
      },
      'ops:import': {
        folder: 'required',
        site: true,
        flags: ['--prod', '--reset', '--no-wait'],
        waitTimeout: true,
        async run(args) {
          if (!args.flags.has('--prod')) throw new CliError('ops:import writes to the hosted platform. Add --prod to confirm.', 'USAGE')
          if (!args.site) throw new CliError('ops:import needs --site <slug>.', 'USAGE')
          const run = connectProd(process.cwd(), 'ops:import')
          const done = await importSite({ dir: args.folder!, run, upload, log: deps.log, ...waiting(args), prod: true, reset: args.flags.has('--reset'), site: args.site })
          return { dir: args.folder, site: args.site, ...done }
        },
      },
      'files-export': {
        folder: 'optional',
        async run(args) {
          if (!args.config) throw new CliError('local:files-export needs --config <site>/ginko.config.ts.', 'USAGE')
          return filesExport({ config: resolve(args.config), ...(args.folder ? { dir: args.folder } : {}), log: deps.log })
        },
      },
      pull: {
        async run(args) {
          const run = local(args)
          return pull({ platform: connectPlatform(deps), site: siteOfKey(env(deps, 'GINKO_KEY')), fetch: deps.fetch, log: deps.log, run, upload })
        },
      },
    },
  })
}

if (isEntryPoint(import.meta.url)) {
  void main(process.argv.slice(2)).then((code) => { process.exitCode = code })
}
