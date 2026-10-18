// The optional blog and changelog: whether the site has them, where they live in this language, and typed
// reads. The layer cannot know the site's bricks at compile time, so the reads go through one cast here.
import schema from '#ginko/schema'
import type { Author, ChangelogEntry, Post } from '../lib/blogTypes'


const has = (brick: string) => Object.hasOwn(schema.bricks, brick)
const read = <T>(brick: string) => (useGinko as unknown as (b: string) => ComputedRef<{ items: T[] }>)(brick)

export function useDocsBlog() {
  const { localePath } = useI18n()
  // The addresses of the bricks' lists in the main language, written by modules/pages.ts.
  const address = useRuntimeConfig().public.ginkoDocs
  const hasPosts = has('posts') && !!address.blog
  const hasChangelog = has('changelog') && !!address.changelog

  const authors = hasPosts && has('authors') ? read<Author>('authors') : undefined
  const authorsOf = (post: Post) => (post.data.authors ?? []).flatMap((id) => authors?.value.items.find((a) => a.id === id) ?? [])
  const { format } = useI18n()
  const formatDate = (iso: string) => format.date(iso, 'long')

  // `draft` is a reserved content key, no schema field; it reaches the bundle only in dev, where drafts show.
  const isDraft = (post: Post) => 'draft' in post.data && post.data.draft === true
  return {
    hasPosts, hasChangelog, authorsOf, isDraft, formatDate,
    blogPath: computed(() => localePath(address.blog)),
    feedPath: computed(() => localePath(`${address.blog}/rss.xml`)),
    changelogPath: computed(() => localePath(address.changelog)),
    posts: () => read<Post>('posts'),
    changelog: () => read<ChangelogEntry>('changelog'),
    post: (slug: string) => (useGinkoEntry as unknown as (b: string, s: string) => Readonly<Ref<Post>>)('posts', slug),
  }
}
