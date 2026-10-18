<script setup lang="ts">
import { markdownComponents } from '../lib/markdownComponents'
// The start page from the site's `home` brick (docsHome): hero with title, description, links and an install
// command, the feature grid, then the free text. Everything is content, so it is translated like the docs.
import type { ItemOf } from '@lupinum/ginko'
import type { docsHome } from '@lupinum/ginko-docs/config'

type Home = Pick<ItemOf<ReturnType<typeof docsHome>['fields']>, 'data'>
// The layer cannot know the site's bricks at compile time; index.vue renders this only when `home` exists.
const home = (useGinko as unknown as (b: string) => ComputedRef<Home>)('home')
const data = computed(() => home.value.data)
const { t } = useI18n()
useGinkoSeo(() => ({ title: data.value.title, description: data.value.description }))

const { state, copy } = useDocsCopy()
// A route link (`$docs.<page>`, `$page.<key>`) follows the reader's language; a path or URL stays as written.
const { href } = useDocsSite()
const to = (raw: string) => (raw.startsWith('$') ? href(raw) : raw)
const external = (href: string) => /^https?:\/\//.test(href)
</script>

<template>
  <div class="docs-landing">
    <div class="docs-landing-inner">
      <section class="docs-hero">
        <h1>{{ data.title }}</h1>
        <p v-if="data.description">{{ data.description }}</p>
        <div v-if="data.links.length" class="docs-hero-links">
          <NuxtLink
            v-for="(l, i) in data.links" :key="l.href" :to="to(l.href)" :target="external(l.href) ? '_blank' : undefined"
            class="docs-button is-large" :class="i === 0 ? 'is-primary' : 'is-soft'"
          >
            {{ l.label }}<DocsIcon v-if="i === 0" name="lucide:arrow-right" class="docs-icon" />
          </NuxtLink>
        </div>
        <div v-if="data.install" class="docs-install">
          <code tabindex="0" role="region" :aria-label="t('docs.installCommand')">{{ data.install }}</code>
          <button type="button" class="docs-icon-button" :aria-label="state === 'copied' ? t('docs.copied') : state === 'failed' ? t('docs.copyFailed') : t('docs.copyCommand')" @click="copy(data.install ?? '')">
            <DocsIcon :name="state === 'copied' ? 'lucide:check' : 'lucide:copy'" class="docs-icon" />
          </button>
        </div>
      </section>
      <ul v-if="data.features.length" class="docs-features">
        <li v-for="f in data.features" :key="f.title" class="docs-feature">
          <div v-if="f.icon" class="docs-feature-icon">
            <DocsIcon :name="f.icon" class="docs-icon" />
          </div>
          <h2>
            <NuxtLink v-if="f.href" :to="to(f.href)">{{ f.title }}</NuxtLink>
            <template v-else>{{ f.title }}</template>
          </h2>
          <p>{{ f.description }}</p>
        </li>
      </ul>
      <GinkoMarkdown v-if="data.body" :value="data.body" :components="markdownComponents" class="docs-prose docs-landing-body" />
    </div>
  </div>
</template>
