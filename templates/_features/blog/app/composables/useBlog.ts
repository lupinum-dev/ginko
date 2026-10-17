/** A post as the blog's lists and pages show it: the entry plus its authors' names and roles from `people`. */
export interface BlogPost {
  id: string
  title: string
  to: string
  date: string
  description?: string
  image?: GinkoItem<'posts'>['data']['image']
  tags: string[]
  authors: { id: string, name: string, role?: string }[]
}

/**
 * The visible posts in the current language, newest first, with their authors (entries of `people`, by id). A draft
 * (`draft: true` in its file) is never among them: drafts stay out of the build.
 */
export function useBlogPosts() {
  const posts = useGinko('posts')
  const people = useGinko('people')
  const locale = useGinkoLocale()
  return computed<BlogPost[]>(() => {
    const byId = new Map(people.value.items.map((person) => [person.id, person.data]))
    return posts.value.items.map((post) => ({
      id: post.id,
      title: post.data.title,
      to: post.urls?.[locale.value] ?? '',
      date: post.data.date,
      description: post.data.description,
      image: post.data.image,
      tags: (post.data.tags ?? []).map((row) => row.tag),
      authors: (post.data.authors ?? []).flatMap((id) => {
        const person = byId.get(id)
        return person ? [{ id, name: person.name, role: person.role }] : []
      }),
    }))
  })
}

/** The address of a tag: the news page filtered to it (`/news?tag=water`). */
export function useTagPath() {
  const path = useGinkoPath()
  return (tag: string) => ({ path: path('news'), query: { tag } })
}

/** The path of the news feed of the current language: `<news page>/rss.xml`. */
export function useFeedPath() {
  const path = useGinkoPath()
  return computed(() => `${path('news')}/rss.xml`)
}
