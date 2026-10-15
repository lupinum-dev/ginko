<script setup lang="ts">
import { docsEditUrl, docsIssueUrl, docsStudioUrl } from '../lib/docsPage'
import { markdownComponents } from '../lib/markdownComponents'
// One doc: breadcrumbs, title, lead and page actions, the text with the layer's Markdown components, the edit
// link and date, previous/next; the table of contents beside it (or in the docs bar, see doc.vue).
import { breadcrumbJsonLd, type ItemOf } from '@lupinum/ginko'
import { articleLd } from '@lupinum/ginko/internal'
import type { docsCollection } from '@lupinum/ginko-docs/config'

// `source` (the page's repository path) is in the bundle because this layer asks for it (hook `ginko:files`, nuxt.config.ts).
const props = defineProps<{ doc: ItemOf<ReturnType<typeof docsCollection>['fields']> & { source?: string } }>()
const { t, format, language } = useI18n()
const { crumbs } = useDocs()
const neighbors = useGinkoNeighbors('docs', () => props.doc.id)
const site = useGinkoSite()
// The Studio link needs the platform address and the site name: internal keys of the Ginko module, read by its own layer.
const { platform, site: siteName } = useRuntimeConfig().public.ginko as { site: string, platform: string }
const route = useRoute()
useGinkoSeo(() => ({
  title: props.doc.data.title,
  description: props.doc.data.description,
  section: props.doc.data.section,
  type: 'article',
  jsonLd: [
    // articleLd fixes the type to Article; docs are TechArticle.
    { ...articleLd({ title: props.doc.data.title, url: new URL(route.path, site.url).href, description: props.doc.data.description, modified: props.doc.updatedAt, lang: language.value }), '@type': 'TechArticle' },
    ...(crumbs.value.length > 1 ? [breadcrumbJsonLd(crumbs.value, site.url)] : []),
  ],
}))

const repository = useAppConfig().docs?.repository
// A page from a file is edited in the repository; one stored on the platform in the Studio.
const editUrl = computed(() => (props.doc.source ? docsEditUrl(repository, props.doc.source) : docsStudioUrl(platform, siteName, 'docs', props.doc.id)))
const issueUrl = computed(() => docsIssueUrl(repository, props.doc.data.title, new URL(route.path, site.url).href))
const updated = computed(() => props.doc.updatedAt && {
  iso: props.doc.updatedAt,
  text: format.date(new Date(props.doc.updatedAt), 'long'),
})
// The toc comes with the text (page state holds only its ref); the same request as <GinkoMarkdown> below.
const tree = await useGinkoMarkdown(() => props.doc.data.body)
const toc = computed(() => tree.value?.toc?.links ?? [])
const top = () => window.scrollTo({ top: 0, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' })
</script>

<template>
  <div class="docs-page">
    <article class="docs-article">
      <nav v-if="crumbs.length > 1" class="docs-crumbs" :aria-label="t('docs.breadcrumb')">
        <ol>
          <li v-for="(c, i) in crumbs" :key="c.path + i">
            <Icon v-if="i" name="lucide:chevron-right" class="docs-icon" />
            <span v-if="i === crumbs.length - 1" aria-current="page">{{ c.title }}</span>
            <NuxtLink v-else :to="c.path">{{ c.title }}</NuxtLink>
          </li>
        </ol>
      </nav>
      <header class="docs-page-head">
        <h1>{{ doc.data.title }}</h1>
        <p v-if="doc.data.description" class="docs-lead">{{ doc.data.description }}</p>
        <DocsPageActions :path="route.path" :origin="site.url" />
      </header>
      <GinkoMarkdown :value="doc.data.body" :components="markdownComponents" class="docs-prose" />
      <footer>
        <div v-if="editUrl || updated" class="docs-page-foot">
          <a v-if="editUrl" :href="editUrl" target="_blank" rel="noopener"><Icon name="lucide:pencil" class="docs-icon" />{{ t('docs.edit') }}</a>
          <span v-if="updated">{{ t('docs.updated') }} <time :datetime="updated.iso">{{ updated.text }}</time></span>
        </div>
        <nav v-if="neighbors.prev || neighbors.next" class="docs-pager" :aria-label="t('docs.pager')">
          <NuxtLink v-if="neighbors.prev" :to="neighbors.prev.url" rel="prev">
            <small><Icon name="lucide:arrow-left" class="docs-icon" />{{ t('docs.previous') }}</small>{{ neighbors.prev.data.title }}
          </NuxtLink>
          <NuxtLink v-if="neighbors.next" :to="neighbors.next.url" rel="next" class="is-next">
            <small>{{ t('docs.next') }}<Icon name="lucide:arrow-right" class="docs-icon" /></small>{{ neighbors.next.data.title }}
          </NuxtLink>
        </nav>
      </footer>
    </article>
    <DocsToc v-if="toc.length" :links="toc" variant="aside">
      <div class="docs-toc-more">
        <a v-if="editUrl" :href="editUrl" target="_blank" rel="noopener"><Icon name="lucide:pencil" class="docs-icon" />{{ t('docs.edit') }}</a>
        <a v-if="issueUrl" :href="issueUrl" target="_blank" rel="noopener"><Icon name="lucide:circle-alert" class="docs-icon" />{{ t('docs.issue') }}</a>
        <button type="button" @click="top"><Icon name="lucide:arrow-up" class="docs-icon" />{{ t('docs.top') }}</button>
      </div>
    </DocsToc>
  </div>
</template>
