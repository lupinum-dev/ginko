<!-- Synced from templates/_features/changelog/app/pages/changelog.vue by `pnpm templates sync`. Edit the source, not this copy. -->
<script setup lang="ts">
import type { Component } from 'vue'
import { Rss } from '@lucide/vue'

// The changelog: one section per release, newest first (content/changelog/), with its version, date and text. The
// text names the kind of each change under a heading of its own (New, Improved, Fixed). Each release has an anchor
// (`#v4-6-0`), so a post, the home page or the feed can link to it. The feed of this language is linked in the head and
// below the list. The address per language comes from `pages.changelog` in ginko.config.ts. The columns match
// BlockSection's (4 and 8), so version and text sit where they do in the home page's section. A template may bring
// `app/components/site/PageCta.vue`, its closing band: it shows at the end of the page.
const cta = Object.values(import.meta.glob<Component>('../components/site/PageCta.vue', { eager: true, import: 'default' }))[0]
const releases = useReleases()
const feed = useChangelogFeedPath()
const { t, format } = useI18n('changelog')
useHead(() => ({ link: [{ rel: 'alternate', type: 'application/rss+xml', title: t('feed'), href: feed.value }] }))
usePageSeo(() => ({ title: t('title'), description: t('lead') }))
</script>

<template>
  <div>
    <BlockPageHeader :title="t('title')" :lead="t('lead')" />
    <div class="mx-auto max-w-page px-gutter">
      <ul v-if="releases.length" class="flex flex-col border-b">
        <li v-for="release in releases" :id="release.anchor" :key="release.id" class="grid scroll-mt-6 gap-4 border-t py-10 lg:grid-cols-12 lg:gap-16" data-release>
          <div class="flex flex-col gap-1 lg:col-span-4">
            <h2 class="text-h3 font-semibold tabular-nums">
              <a :href="`#${release.anchor}`" class="inline-flex min-h-11 items-center underline-offset-4 hover:underline">{{ t('version', { version: release.version }) }}</a>
            </h2>
            <p class="text-small text-muted-foreground tabular-nums">
              <time :datetime="release.date">{{ format.date(release.date) }}</time>
            </p>
          </div>
          <GinkoMarkdown :value="release.body" class="prose min-w-0 lg:col-span-8" />
        </li>
      </ul>
      <BlockEmpty v-else :title="t('empty')" path="content/changelog/" />
      <a :href="feed" class="mt-6 inline-flex min-h-11 items-center gap-2 text-small text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">
        <Rss class="size-4" aria-hidden="true" />{{ t('feed') }}
      </a>
    </div>
    <component :is="cta" v-if="cta" />
  </div>
</template>
