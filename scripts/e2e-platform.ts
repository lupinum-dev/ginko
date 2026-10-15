// `pnpm e2e:platform [playwright args]`: the platform e2e (apps/platform/e2e) on a fresh local backend, start to end.
//
// 1. One heavy run per machine and a calm machine (scripts/lib/runs.ts): waits for the lock and the load.
// 2. Preflight: no cloud key, an earlier killed run cleaned up, a local Convex target, ports 3000, 3100, 3210, 3211 free
//    (Playwright would reuse any server there, also one of another worktree).
// 3. A fresh backend: packages/ginko-server/.convex and .env.local and the stored sessions (apps/platform/e2e/.state)
//    are set aside (with convex/_generated, which `convex dev` rewrites) and put back at the end.
// 4. The local Convex backend (`pnpm --filter @ginko/platform convex`), prepared like `local:dev` does (env variables,
//    sign-in secrets), then Playwright in apps/platform; it starts the Studio and sites/restaurant itself.
// 5. Everything this run started is stopped, also after Ctrl-C or the time limit.
// The exit code is Playwright's; 1 when the setup failed. Logs of the backend: GINKO_E2E_LOGS, else a temp folder.
import { mkdirSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { confirmLocal, findBackend, knownTargetError, prepareLocalBackend, readDeploymentTarget } from '../packages/ginko/src/cli/local.ts'
import { busyPorts, CONVEX_READY, heavyLock, PLATFORM_PORTS, recoverCrashedRun, startSession, waitFor, waitForCalm } from './lib/runs.ts'

const root = join(import.meta.dirname, '..')
const COMMAND = 'e2e:platform'
const TIMEOUT_MS = 60 * 60_000

function stop(reason: string): never {
  console.error(`pnpm ${COMMAND}: ${reason}`)
  process.exit(1)
}

await heavyLock(`pnpm ${COMMAND}`)
await waitForCalm()

if (process.env.CONVEX_DEPLOY_KEY) stop('CONVEX_DEPLOY_KEY is set: the platform e2e writes data and runs against the local backend only.')
const active = await recoverCrashedRun()
if (active) stop(active)
const backendDir = findBackend(root, COMMAND)
const early = knownTargetError(readDeploymentTarget(backendDir), COMMAND)
if (early) stop(early)
const ports = Object.values(PLATFORM_PORTS)
const busy = await busyPorts(ports)
if (busy.length) stop(`port ${busy.join(', ')} is in use (the platform e2e needs ${ports.join(', ')} free). Stop what runs there, or wait for it, and run again.`)

const logs = process.env.GINKO_E2E_LOGS ?? mkdtempSync(join(tmpdir(), 'ginko-e2e-platform-'))
mkdirSync(logs, { recursive: true })
const server = 'packages/ginko-server'
const session = startSession({
  name: `pnpm ${COMMAND}`,
  base: root,
  touched: [`${server}/.convex`, `${server}/.env.local`, `${server}/convex/_generated`, 'apps/platform/e2e/.state'],
  fresh: [`${server}/.convex`, `${server}/.env.local`, 'apps/platform/e2e/.state'],
  logs,
  timeoutMs: TIMEOUT_MS,
})

let code: number | null = 1
try {
  console.log(`pnpm ${COMMAND}: starting the local Convex backend (log: ${join(logs, 'convex.log')})`)
  let ready = false
  const convex = session.start('convex', 'pnpm', ['--filter', '@ginko/platform', 'convex'], root, process.env, (line) => { if (CONVEX_READY.test(line)) ready = true })
  await waitFor('The local Convex backend', async () => ready, 300, convex)
  confirmLocal(backendDir, COMMAND)
  await prepareLocalBackend(backendDir, COMMAND, (line) => console.log(`  ${line}`), session.run)
  console.log(`pnpm ${COMMAND}: running Playwright in apps/platform`)
  code = await session.attached('pnpm', ['exec', 'playwright', 'test', ...process.argv.slice(2)], join(root, 'apps/platform'), process.env)
  if (code === null) console.error(`pnpm ${COMMAND}: Playwright could not start.`)
} catch (error) {
  console.error(`pnpm ${COMMAND}: setup failed: ${error instanceof Error ? error.message : String(error)}`)
  code = 1
} finally {
  await session.finish()
  const left = await busyPorts(ports)
  if (left.length) console.error(`pnpm ${COMMAND}: port ${left.join(', ')} still answers after the stop; look for a leftover server.`)
}
process.exit(code ?? 1)
