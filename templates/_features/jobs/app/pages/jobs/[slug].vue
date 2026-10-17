<script setup lang="ts">
import { ArrowLeft, Mail } from '@lucide/vue'

// One job: title, short description, place, employment, work place and the last day to apply, the text, and how to
// apply (an email with the job title in the subject, or the job's application page; no form on this site), at the
// top and again below the text. JobPosting JSON-LD with `validThrough`. A job after its `validUntil` day, and an
// unknown one, is a 404.
const route = useRoute()
const job = useGinkoEntry('jobs', () => route.params.slug)
const path = useGinkoPath()
const { t } = useI18n('jobs')
const { employment, workplace, deadline } = useJobText()
const apply = useApplyLink(() => job.value.data)
const body = await useGinkoMarkdown(() => job.value.data.body)
const jsonLd = useJobJsonLd(() => ({ ...job.value.data, url: job.value.url, updatedAt: job.value.updatedAt }), () => body.value)
usePageSeo(() => ({ title: job.value.data.title, description: job.value.data.description, jsonLd: [jsonLd.value] }))
</script>

<template>
  <article>
    <div class="mx-auto max-w-page px-gutter pt-8 md:pt-12">
      <NuxtLink :to="path('jobs')" class="-ms-1 inline-flex min-h-11 items-center gap-2 px-1 text-small font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">
        <ArrowLeft class="size-4 rtl:-scale-x-100" aria-hidden="true" />
        {{ t('all') }}
      </NuxtLink>
    </div>
    <header class="mx-auto max-w-page px-gutter pt-4 pb-8 md:pb-12">
      <div class="flex max-w-3xl flex-col gap-5">
        <h1 class="text-h1">{{ job.data.title }}</h1>
        <p class="text-lead text-muted-foreground">{{ job.data.description }}</p>
        <dl class="grid gap-x-8 gap-y-3 sm:grid-cols-[auto_1fr]">
          <dt class="text-small text-muted-foreground">{{ t('location') }}</dt>
          <dd class="font-medium">{{ job.data.location }}</dd>
          <dt class="text-small text-muted-foreground">{{ t('employmentLabel') }}</dt>
          <dd class="font-medium">{{ employment(job.data) }}</dd>
          <dt class="text-small text-muted-foreground">{{ t('workplaceLabel') }}</dt>
          <dd class="font-medium">{{ workplace(job.data) }}</dd>
          <dt class="text-small text-muted-foreground">{{ t('deadline') }}</dt>
          <dd class="font-medium tabular-nums"><time :datetime="job.data.validUntil">{{ deadline(job.data) }}</time></dd>
        </dl>
        <div v-if="apply" class="flex flex-wrap gap-3">
          <Button as-child size="lg" class="max-sm:w-full">
            <a :href="apply.href" :rel="apply.email ? undefined : 'noopener'"><Mail v-if="apply.email" aria-hidden="true" />{{ apply.email ? t('applyEmail') : t('applyOnline') }}</a>
          </Button>
        </div>
      </div>
    </header>
    <ProseBody :value="job.data.body" />
    <section v-if="apply" aria-labelledby="job-apply" class="mx-auto max-w-page px-gutter pt-10">
      <div class="flex max-w-prose flex-col items-start gap-4 border-t pt-8">
        <h2 id="job-apply" class="text-h3">{{ t('how') }}</h2>
        <p class="text-muted-foreground">
          <template v-if="apply.email">{{ t('howEmail', { email: apply.email, date: deadline(job.data) }) }}</template>
          <template v-else>{{ t('howOnline', { date: deadline(job.data) }) }}</template>
        </p>
        <Button as-child variant="outline" size="lg" class="max-sm:w-full">
          <a :href="apply.href" :rel="apply.email ? undefined : 'noopener'"><Mail v-if="apply.email" aria-hidden="true" />{{ apply.email ? t('applyEmail') : t('applyOnline') }}</a>
        </Button>
      </div>
    </section>
  </article>
</template>
