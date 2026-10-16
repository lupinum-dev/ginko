// Synced from templates/_features/changelog/app/utils/changelog.ts by `pnpm templates sync`. Edit the source, not this copy.
import { plainText, type MarkdownTree } from '@lupinum/ginko'

// Pure helpers of the changelog feature, shared by the pages and the feed (server/middleware/changelog-feed.ts).

/** The anchor of a release on the changelog page, a valid id and a stable address: `4.6.0` → `v4-6-0`. */
export function releaseAnchor(version: string): string {
  return `v${version.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`
}

/**
 * The summary of a release as one line of plain text: what its text says before the `<!-- more -->` line, for the
 * home page and the feed. '' when the text has no such line.
 */
export function releaseSummary(tree: MarkdownTree | null | undefined): string {
  return tree?.summary ? plainText(tree.summary).replace(/\s+/g, ' ') : ''
}
