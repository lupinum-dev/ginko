<script setup lang="ts">
import { safeHref } from '@lupinum/ginko'
import { Mail, Rss } from '@lucide/vue'

// Following the blog, at the top of the footer's contact column on every page (SiteFooter shows this file): the feed
// of this language and, when app.config.ts names one, the sign-up page of the newsletter at its service. The site
// itself has no form (README, "Follow: feed and newsletter").
const feed = useFeedPath()
const newsletter = useAppConfig().blog.newsletter
const { t } = useI18n()
const { name } = useGinkoSite()
const link = 'inline-flex min-h-11 items-center gap-2 self-start text-muted-foreground underline-offset-4 hover:text-foreground hover:underline'
</script>

<template>
  <ul class="flex flex-col text-small" :aria-label="t('follow', { name })">
    <li>
      <a :href="feed" :class="link"><Rss class="size-4" aria-hidden="true" />{{ t('blog.feed') }}</a>
    </li>
    <li v-if="newsletter">
      <a :href="safeHref(newsletter)" rel="noopener" :class="link"><Mail class="size-4" aria-hidden="true" />{{ t('newsletter') }}</a>
    </li>
  </ul>
</template>
