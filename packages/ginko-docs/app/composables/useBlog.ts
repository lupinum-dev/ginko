// The optional blog and changelog: whether the site has them, where they live in this language, and typed
// reads. The layer cannot know the site's bricks at compile time, so the reads go through one cast here.
import schema from '#ginko/schema'
import type { ItemOf } from '@lupinum/ginko'
import { BLOG_PATH, CHANGELOG_PATH, type blogCollections, type changelogCollection } from '@lupinum/ginko-docs/config'

type Blog = ReturnType<typeof blogCollections>
export type Post = ItemOf<Blog['posts']['fields']> & { url?: string }
export type Author = ItemOf<Blog['authors']['fields']>
export type ChangelogEntry = ItemOf<ReturnType<typeof changelogCollection>['fields']>

const has = (brick: string) => Object.hasOwn(schema.bricks, brick)
const read = <T>(brick: string) => (useGinko as unknown as (b: string) => ComputedRef<{ items: T[] }>)(brick)

export function useBlog() {
  const { localePath } = useI18n()
  const hasPosts = has('posts')
  const hasChangelog = has('changelog')

  const authors = hasPosts && has('authors') ? read<Author>('authors') : undefined
  const authorsOf = (post: Post) => (post.data.authors ?? []).flatMap((id) => authors?.value.items.find((a) => a.id === id) ?? [])
  const { format } = useI18n()
  const formatDate = (iso: string) => format.date(iso, 'long')

  // `draft` is a reserved content key, no schema field; it reaches the bundle only in dev, where drafts show.
  const isDraft = (post: Post) => 'draft' in post.data && post.data.draft === true
  return {
    hasPosts, hasChangelog, authorsOf, isDraft, formatDate,
    blogPath: computed(() => localePath(BLOG_PATH)),
    feedPath: computed(() => localePath(`${BLOG_PATH}/rss.xml`)),
    changelogPath: computed(() => localePath(CHANGELOG_PATH)),
    posts: () => read<Post>('posts'),
    changelog: () => read<ChangelogEntry>('changelog'),
    post: (slug: string) => (useGinkoEntry as unknown as (b: string, s: string) => ComputedRef<Post>)('posts', slug),
  }
}
