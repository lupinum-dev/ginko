<!-- Synced from templates/_features/services/app/pages/services/[slug].vue by `pnpm templates sync`. Edit the source, not this copy. -->
<script setup lang="ts">
import { ArrowLeft, Download, Mail, Phone } from '@lucide/vue'

// One service or product: title, summary, price or "On request", duration, how to ask about it (an email with the
// title in the subject, else a call; the business's contact from content/site.md), the product sheet when it has
// one, photo (3:2), key facts and text. Service JSON-LD with the price when it has one. An unknown entry is a 404.
const route = useRoute()
const service = useGinkoEntry('services', () => route.params.slug)
const site = useGinko('site')
const path = useGinkoPath()
const { t, format } = useI18n('services')
const { price, duration } = useServiceText()
const sheet = useServiceSheet(() => ('sheet' in service.value.data ? service.value.data.sheet : undefined))
const jsonLd = useServiceJsonLd(() => ({ ...service.value.data, url: service.value.url }))
usePageSeo(() => ({ title: service.value.data.title, description: service.value.data.summary, image: service.value.data.image, jsonLd: [jsonLd.value] }))

const contact = computed(() => site.value.data)
const enquiry = computed(() => contact.value.email && `mailto:${contact.value.email}?subject=${encodeURIComponent(t('subject', { title: service.value.data.title }))}`)
const tel = (phone: string) => `tel:${phone.replace(/[^\d+]/g, '')}`
const typeOf = (name: string) => name.split('.').at(-1)?.toUpperCase() ?? ''
const sizeOf = (bytes: number) => (bytes >= 1024 * 1024
  ? format.number(bytes / 1024 / 1024, { style: 'unit', unit: 'megabyte', maximumFractionDigits: 1 })
  : format.number(Math.max(1, Math.round(bytes / 1024)), { style: 'unit', unit: 'kilobyte' }))
</script>

<template>
  <article>
    <div class="mx-auto max-w-page px-gutter pt-8 md:pt-12">
      <NuxtLink :to="path('services')" class="-ms-1 inline-flex min-h-11 items-center gap-2 px-1 text-small font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">
        <ArrowLeft class="size-4 rtl:-scale-x-100" aria-hidden="true" />
        {{ t('all') }}
      </NuxtLink>
    </div>
    <header class="mx-auto max-w-page px-gutter pt-4 pb-8 md:pb-12">
      <div class="flex max-w-3xl flex-col gap-5">
        <h1 class="text-h1">{{ service.data.title }}</h1>
        <p class="text-lead text-muted-foreground">{{ service.data.summary }}</p>
        <dl class="grid gap-x-8 gap-y-3 sm:grid-cols-[auto_1fr]">
          <dt class="text-small text-muted-foreground">{{ t('price') }}</dt>
          <dd class="font-medium tabular-nums">{{ price(service.data) }}</dd>
          <template v-if="duration(service.data)">
            <dt class="text-small text-muted-foreground">{{ t('duration') }}</dt>
            <dd class="font-medium tabular-nums">{{ duration(service.data) }}</dd>
          </template>
        </dl>
        <div v-if="enquiry || contact.phone || sheet" class="flex flex-wrap gap-3">
          <Button v-if="enquiry" as-child size="lg" class="max-sm:w-full">
            <a :href="enquiry"><Mail aria-hidden="true" />{{ t('enquire') }}</a>
          </Button>
          <Button v-else-if="contact.phone" as-child size="lg" class="max-sm:w-full">
            <a :href="tel(contact.phone)"><Phone aria-hidden="true" />{{ t('call', { phone: contact.phone }) }}</a>
          </Button>
          <Button v-if="sheet" as-child size="lg" variant="outline" class="max-sm:w-full">
            <a :href="sheet.url" type="application/pdf">
              <Download aria-hidden="true" />{{ t('sheet') }}
              <span class="font-normal text-muted-foreground tabular-nums">{{ [typeOf(sheet.name), sheet.size ? sizeOf(sheet.size) : ''].filter(Boolean).join(', ') }}</span>
            </a>
          </Button>
        </div>
      </div>
    </header>
    <div v-if="service.data.image" class="mx-auto max-w-page px-gutter pb-10">
      <GinkoImage :image="service.data.image" eager sizes="(min-width: 1216px) 896px, 100vw" class="aspect-3/2 w-full max-w-4xl rounded-block bg-muted object-cover" />
    </div>
    <section v-if="service.data.specs?.length" aria-labelledby="service-specs" class="mx-auto max-w-page px-gutter pb-10">
      <div class="max-w-3xl">
        <h2 id="service-specs" class="text-h3">{{ t('specs') }}</h2>
        <dl class="mt-4 border-b">
          <div v-for="spec in service.data.specs" :key="spec._id" class="grid gap-1 border-t py-3 sm:grid-cols-[minmax(0,14rem)_1fr] sm:gap-6">
            <dt class="text-muted-foreground">{{ spec.label }}</dt>
            <dd class="font-medium tabular-nums">{{ spec.value }}</dd>
          </div>
        </dl>
      </div>
    </section>
    <ProseBody :value="service.data.body" />
  </article>
</template>
