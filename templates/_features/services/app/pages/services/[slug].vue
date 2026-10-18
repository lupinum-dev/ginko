<script setup lang="ts">
import type { Component } from 'vue'
import { ArrowLeft, Mail, Phone } from '@lucide/vue'

// One service or product: title, summary, price or "On request", duration, how to ask about it (an email with the
// title in the subject and a phone number: the entry's contact person's, else the business's from content/site.md),
// the product sheet when it has one, photo (3:2), key facts and text. Service JSON-LD with the
// price when it has one. An unknown entry is a 404. The sheet button comes from the downloads feature
// (`DownloadsFileButton`), found by its file, so a site without downloads builds without it. A template whose
// customers book another way brings `app/components/services/Actions.vue` (the local business: call, then email, with the
// phone hours); the page then shows it in place of its row of actions, with the same facts as props.
const SheetButton = Object.values(import.meta.glob<Component>('../../components/downloads/FileButton.vue', { eager: true, import: 'default' }))[0]
const Actions = Object.values(import.meta.glob<Component>('../../components/services/Actions.vue', { eager: true, import: 'default' }))[0]
const route = useRoute()
const service = useGinkoEntry('services', () => route.params.slug)
const site = useGinko('site')
const people = useGinko('people')
const path = useGinkoPath()
const { t } = useI18n('services')
const { price, priceLabel, duration, action } = useServiceText()
const sheet = computed(() => ('sheet' in service.value.data ? service.value.data.sheet : undefined))
const jsonLd = useServiceJsonLd(() => ({ ...service.value.data, url: service.value.url }))
usePageSeo(() => ({ title: service.value.data.title, description: service.value.data.summary, image: service.value.data.image, jsonLd: [jsonLd.value] }))

const contact = computed(() => people.value.items.find((person) => person.id === service.value.data.contact)?.data)
const email = computed(() => contact.value?.email || site.value.data.email)
const phone = computed(() => contact.value?.phone || site.value.data.phone)
const main = computed(() => action(service.value.data))
const enquiry = computed(() => email.value && `mailto:${email.value}?subject=${encodeURIComponent(main.value.subject)}`)
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
        <dl class="grid grid-cols-[auto_1fr] items-baseline gap-x-8 gap-y-3">
          <dt class="text-small text-muted-foreground">{{ priceLabel }}</dt>
          <dd class="font-medium tabular-nums">{{ price(service.data) }}</dd>
          <template v-if="duration(service.data)">
            <dt class="text-small text-muted-foreground">{{ t('duration') }}</dt>
            <dd class="font-medium tabular-nums">{{ duration(service.data) }}</dd>
          </template>
        </dl>
        <component :is="Actions" v-if="Actions" :subject="main.subject" :email="email" :phone="phone" :contact="contact?.name" :contact-id="service.data.contact" />
        <div v-else-if="enquiry || phone || (SheetButton && sheet)" class="flex flex-col gap-2">
          <div class="flex flex-wrap gap-3">
            <Button v-if="enquiry" as-child size="lg" class="max-sm:w-full">
              <a :href="enquiry"><Mail aria-hidden="true" />{{ main.label }}</a>
            </Button>
            <Button v-else-if="phone" as-child size="lg" class="max-sm:w-full">
              <a :href="telHref(phone)"><Phone aria-hidden="true" />{{ t('call', { phone }) }}</a>
            </Button>
            <component :is="SheetButton" v-if="SheetButton && sheet" :id="sheet" :label="t('sheet')" />
          </div>
          <p v-if="enquiry && phone" class="text-muted-foreground">
            {{ contact ? t('orCallName', { name: contact.name }) : t('orCall') }}
            <a :href="telHref(phone)" dir="ltr" class="inline-flex min-h-11 items-center font-medium text-foreground tabular-nums underline underline-offset-4">{{ phone }}</a>
          </p>
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
    <BlockCta v-if="!Actions && enquiry" :title="service.data.title" :action="{ label: main.label, to: enquiry }">
      <a v-if="contact?.phone" :href="telHref(contact.phone)" dir="ltr" class="inline-flex min-h-11 items-center font-medium tabular-nums underline underline-offset-4">{{ contact.phone }}</a>
    </BlockCta>
  </article>
</template>
