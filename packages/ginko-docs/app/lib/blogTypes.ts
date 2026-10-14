// Types of the blog and changelog entries. Kept out of `composables/` so that they are not auto-imported into the host app.
import type { ItemOf } from '@lupinum/ginko'
import type { blogCollections, changelogCollection } from '@lupinum/ginko-docs/config'

type Blog = ReturnType<typeof blogCollections>
export type Post = ItemOf<Blog['posts']['fields']> & { url?: string }
export type Author = ItemOf<Blog['authors']['fields']>
export type ChangelogEntry = ItemOf<ReturnType<typeof changelogCollection>['fields']>
