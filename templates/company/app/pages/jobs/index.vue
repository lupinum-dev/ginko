<!-- Synced from templates/_features/jobs/app/pages/jobs/index.vue by `pnpm templates sync`. Edit the source, not this copy. -->
<script setup lang="ts">
import { Mail } from '@lucide/vue'

// The open jobs (content/jobs/). A job leaves this list, its page, the sitemap and the JSON-LD after its
// `validUntil` day by itself. With no open job the page says so and asks for an open application by email, to the
// business's address in content/site.md. The address per language comes from `pages.jobs` in ginko.config.ts.
const jobs = useOpenJobs()
const open = useApplyLink(() => undefined)
const { t } = useI18n('jobs')
usePageSeo(() => ({ title: t('title'), description: t('lead') }))
</script>

<template>
  <div>
    <BlockPageHeader :title="t('title')" :lead="t('lead')" />
    <div class="mx-auto max-w-page px-gutter">
      <div class="max-w-4xl">
        <template v-if="jobs.length">
          <JobsList :items="jobs" />
          <p v-if="open" class="mt-6 text-muted-foreground">
            {{ t('open.more') }}
            <a :href="open.href" class="inline-flex min-h-11 items-center font-medium text-primary underline underline-offset-4">{{ t('open.action') }}</a>
          </p>
        </template>
        <div v-else class="flex max-w-prose flex-col items-start gap-4">
          <p class="text-lead font-medium">{{ t('none') }}</p>
          <p class="text-muted-foreground">{{ t('open.text') }}</p>
          <Button v-if="open" as-child size="lg" class="max-sm:w-full">
            <a :href="open.href"><Mail aria-hidden="true" />{{ t('open.action') }}</a>
          </Button>
        </div>
      </div>
    </div>
  </div>
</template>
