// Synced from templates/_features/changelog/app/utils/changelog.ts by `pnpm templates sync`. Edit the source, not this copy.
import { plainText, type MarkdownTree } from '@lupinum/ginko'

// Pure helpers of the changelog feature, shared by the pages and the feed (server/middleware/changelog-feed.ts). The
// anchor of a release (`#v4-6-0`) is `releaseAnchor` of @lupinum/ginko/basics, the same as in @lupinum/ginko-docs.

/**
 * The summary of a release as one line of plain text: what its text says before the `<!-- more -->` line, for the
 * home page and the feed. '' when the text has no such line.
 */
export function releaseSummary(tree: MarkdownTree | null | undefined): string {
  return tree?.summary ? plainText(tree.summary).replace(/\s+/g, ' ') : ''
}
