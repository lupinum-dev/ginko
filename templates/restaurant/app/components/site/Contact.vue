<!-- Synced from templates/_features/site/app/components/site/Contact.vue by `pnpm templates sync`. Edit the source, not this copy. -->
<script setup lang="ts">
import { Mail, MapPin, Phone } from '@lucide/vue'

// The email, phone and address of content/site.md for a page that points to them in its text (the pages feature's
// `components/pages/Top.vue` hook, below the page title). The values are never copied into a text: the owner changes
// them once, in site.md, and the footer, the imprint and this block follow. `address="false"`: only email and phone, for
// a band whose page has the address in the footer anyway.
const { address = true } = defineProps<{ address?: boolean }>()
const site = useGinko('site')
const contact = computed(() => site.value.data)
// A narrow screen breaks a long address after the @ (the <wbr>), not inside a word.
const email = computed(() => {
  const value = contact.value.email ?? ''
  const at = value.indexOf('@') + 1
  return [value.slice(0, at), value.slice(at)]
})
</script>

<template>
  <!-- Each line keeps the direction of its own text (bdi); email and phone are always left to right, as in the footer. -->
  <address v-if="contact.email || contact.phone || (address && contact.city)" class="flex flex-col not-italic">
    <a v-if="contact.email" :href="`mailto:${contact.email}`" dir="ltr" class="inline-flex min-h-11 items-center gap-2 self-start text-primary underline underline-offset-4">
      <Mail class="size-4 shrink-0" aria-hidden="true" /><span>{{ email[0] }}<wbr>{{ email[1] }}</span>
    </a>
    <a v-if="contact.phone" :href="telHref(contact.phone)" dir="ltr" class="inline-flex min-h-11 items-center gap-2 self-start tabular-nums text-primary underline underline-offset-4">
      <Phone class="size-4 shrink-0" aria-hidden="true" />{{ contact.phone }}
    </a>
    <span v-if="address && contact.city" class="flex items-start gap-2 py-2">
      <MapPin class="mt-1 size-4 shrink-0" aria-hidden="true" />
      <span class="flex flex-col">
        <span v-if="contact.legalName"><bdi>{{ contact.legalName }}</bdi></span>
        <span v-if="contact.street"><bdi>{{ contact.street }}</bdi></span>
        <span><bdi>{{ contact.postalCode }} {{ contact.city }}</bdi></span>
      </span>
    </span>
  </address>
</template>
