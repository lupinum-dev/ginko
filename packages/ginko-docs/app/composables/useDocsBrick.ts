// The key of the site's docs brick: `ginkoDocs.brick` in nuxt.config.ts, `docs` by default (modules/pages.ts). Typed as
// `docs`: the layer reads docsCollection's fields, whatever key the site gives the brick, and cannot know that key at
// compile time.
export function useDocsBrick() {
  return useRuntimeConfig().public.ginkoDocs.brick as 'docs'
}
