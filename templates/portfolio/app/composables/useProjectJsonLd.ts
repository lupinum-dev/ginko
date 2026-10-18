/** A project's photos in their order: the main photo (`image`), then the others (`photos`). */
export function projectPhotos(project: GinkoItem<'projects'>) {
  return [...(project.data.image ? [project.data.image] : []), ...(project.data.photos ?? []).map((row) => row.image)]
}

/**
 * The CreativeWork JSON-LD of a project: its facts, all its photos and the studio as creator. The projects feature's
 * project page finds this composable and puts the result into the page's one `usePageSeo` call.
 */
export function useProjectJsonLd() {
  const { name, url } = useGinkoSite()
  const { language } = useI18n()
  const absolute = (path: string) => new URL(path, url).href
  return (project: GinkoItem<'projects'>): Record<string, unknown> => ({
    '@context': 'https://schema.org',
    '@type': 'CreativeWork',
    name: project.data.title,
    description: project.data.summary,
    url: project.url ? absolute(project.url) : undefined,
    image: projectPhotos(project).map((photo) => absolute(photo.url)),
    dateCreated: project.data.year === undefined ? undefined : String(project.data.year),
    locationCreated: project.data.place ? { '@type': 'Place', name: project.data.place } : undefined,
    creator: { '@type': 'Organization', name, url },
    inLanguage: language.value,
  })
}
