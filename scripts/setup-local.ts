// Prepares the LOCAL Convex backend (packages/ginko-server, `convex dev` running) for sign-in, as `pnpm local:dev` does
// by itself: for the e2e flow, which starts the backend without local:dev. Stops before any write when the Convex CLI
// points at a non-local deployment.
//   node --experimental-strip-types scripts/setup-local.ts
import { prepareLocalBackend, runOnce } from '../packages/ginko/src/cli/local.ts'

const admin = await prepareLocalBackend(new URL('../packages/ginko-server/', import.meta.url).pathname, 'setup-local', console.log, runOnce)
console.log(`Ready. Sign in as ${admin}, codes: pnpm outbox ${admin}`)
