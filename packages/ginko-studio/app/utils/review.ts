// Shapes the review and history components read from `proposals.*` and `changes.get`.
import type { api } from '#convex/api'
import type { FunctionReturnType } from 'convex/server'

/** One entry of `changes.get` / `proposals.get` `diff` (convex/lib/diff.ts), as the server returns it. */
export type DiffField = FunctionReturnType<typeof api.changes.get>['diff'][number]

/** A row of `proposals.list`, as the server returns it. */
export type ProposalRow = FunctionReturnType<typeof api.proposals.list>['page'][number]
