<script setup lang="ts">
import { Mail, MapPin, Phone } from '@lucide/vue'

// The email, phone and address of content/site.md for a page that points to them in its text (the pages feature's
// `components/pages/Top.vue` hook, below the page title). The values are never copied into a text: the owner changes
// them once, in site.md, and the footer, the imprint and this block follow.
const site = useGinko('site')
const contact = computed(() => site.value.data)
const tel = (phone: string) => `tel:${phone.replace(/[^\d+]/g, '')}`
</script>

<template>
  <!-- Each line keeps the direction of its own text (bdi); email and phone are always left to right, as in the footer. -->
  <address v-if="contact.email || contact.phone || contact.city" class="flex flex-col not-italic">
    <a v-if="contact.email" :href="`mailto:${contact.email}`" dir="ltr" class="inline-flex min-h-11 items-center gap-2 self-start text-primary underline underline-offset-4">
      <Mail class="size-4 shrink-0" aria-hidden="true" />{{ contact.email }}
    </a>
    <a v-if="contact.phone" :href="tel(contact.phone)" dir="ltr" class="inline-flex min-h-11 items-center gap-2 self-start tabular-nums text-primary underline underline-offset-4">
      <Phone class="size-4 shrink-0" aria-hidden="true" />{{ contact.phone }}
    </a>
    <span v-if="contact.city" class="flex items-start gap-2 py-2">
      <MapPin class="mt-1 size-4 shrink-0" aria-hidden="true" />
      <span class="flex flex-col">
        <span v-if="contact.legalName"><bdi>{{ contact.legalName }}</bdi></span>
        <span v-if="contact.street"><bdi>{{ contact.street }}</bdi></span>
        <span><bdi>{{ contact.postalCode }} {{ contact.city }}</bdi></span>
      </span>
    </span>
  </address>
</template>
