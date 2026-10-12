/// <reference path="../schema.d.ts" />
// The markdown trees of file bricks as the Map `entryMarkdown` reads (bundles hold only `{ ref }`).
import trees from '#ginko/files-md'
import type { MarkdownTree } from '../../../internal.ts'

export const markdownTrees: ReadonlyMap<string, MarkdownTree> = new Map(Object.entries(trees))
