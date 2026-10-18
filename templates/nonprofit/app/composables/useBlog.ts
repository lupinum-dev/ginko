// Synced from templates/_features/blog/app/composables/useBlog.ts by `pnpm templates sync`. Edit the source, not this copy.
import { wordsOf } from '@lupinum/ginko'

/** A post as the blog's lists and pages show it: the entry plus its authors' names and roles from `people`. */
export interface BlogPost {
  id: string
  title: string
  to: string
  date: string
  description?: string
  image?: GinkoItem<'posts'>['data']['image']
  tags: string[]
  /** Reading time in whole minutes, at least 1; 0 when the text's length is unknown. */
  minutes: number
  /** `to` is the author's page when `people` has a route. */
  authors: { id: string, name: string, role?: string, to?: string }[]
}

/** Words a reader reads in a minute, for the reading time. */
const WORDS_PER_MINUTE = 200

/**
 * The visible posts in the current language, newest first, with their authors (entries of `people`, by id). A draft
 * (`draft: true` in its file) and a post dated after the build day are never among them: they stay out of the build.
 */
export function useBlogPosts() {
  const posts = useGinko('posts')
  const people = useGinko('people')
  const locale = useGinkoLocale()
  return computed<BlogPost[]>(() => {
    const byId = new Map(people.value.items.map((person) => [person.id, person]))
    return posts.value.items.map((post) => {
      // The bundle carries the text's word count next to its reference, so a list needs no text to show the time.
      const words = wordsOf(post.data.body) ?? 0
      return {
        id: post.id,
        title: post.data.title,
        to: post.urls?.[locale.value] ?? '',
        date: post.data.date,
        description: post.data.description,
        image: post.data.image,
        // A tag without letters or digits has no address (empty slug), so it is left out instead of breaking the route.
        tags: (post.data.tags ?? []).map((row) => row.tag).filter((tag) => tagSlug(tag)),
        minutes: words ? Math.max(1, Math.round(words / WORDS_PER_MINUTE)) : 0,
        authors: (post.data.authors ?? []).flatMap((id) => {
          const person = byId.get(id)
          return person ? [{ id, name: person.data.name, role: person.data.role, to: person.urls?.[locale.value] }] : []
        }),
      }
    })
  })
}

/** The address word of a tag: "Street trees" → "street-trees", "Vögel" → "voegel". Tags are free text per language. */
export function tagSlug(tag: string) {
  return tag
    .replace(/[äöüÄÖÜß]/g, (c) => ({ ä: 'ae', ö: 'oe', ü: 'ue', Ä: 'ae', Ö: 'oe', Ü: 'ue', ß: 'ss' })[c] ?? c)
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
}

/**
 * The address of a tag's page (news/tags/[tag].vue) in the current language: `/news/tags/water`, or with the words
 * of `segments` in app/routes.ts `/de/aktuelles/themen/wasser`. The page has no `pages` key, so the address comes from
 * its route (ginko-i18n names the route of each language `<name>__<code>`).
 */
export function useTagPath() {
  const router = useRouter()
  const locale = useGinkoLocale()
  return (tag: string) => router.resolve({ name: `news-tags-tag__${locale.value}`, params: { tag: tagSlug(tag) } }).path
}

/** Every tag of the visible posts, most used first, with the number of posts and its page. */
export function useBlogTags() {
  const posts = useBlogPosts()
  const tagPath = useTagPath()
  return computed(() => {
    const tags = new Map<string, { name: string, slug: string, to: string, count: number }>()
    for (const post of posts.value) {
      for (const name of new Set(post.tags)) {
        const slug = tagSlug(name)
        const tag = tags.get(slug)
        if (tag) tag.count++
        else tags.set(slug, { name, slug, to: tagPath(name), count: 1 })
      }
    }
    return [...tags.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, undefined, { numeric: true }))
  })
}

/** The path of the news feed of the current language: `<news page>/rss.xml`. */
export function useFeedPath() {
  const path = useGinkoPath()
  return computed(() => `${path('news')}/rss.xml`)
}
