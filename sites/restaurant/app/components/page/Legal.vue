<script setup lang="ts">
import { siteName, telHref } from '../../utils/site'

const langOf = useGinkoLang()
const props = defineProps<{ field: 'imprint' | 'privacy' }>()
const { t } = useI18n()
const legal = useGinko('legal')
// The imprint's address and contact come from "Adresse und Kontakt", so a move or a new number updates the imprint too.
const contact = useGinko('contact')
const title = computed(() => (props.field === 'imprint' ? t('imprint') : t('privacy')))
useSeoMeta({ title: () => `${title.value} | Gasthaus zur Linde` })
</script>

<template>
  <div class="wrap">
    <h1 class="page-title">{{ title }}</h1>
    <address v-if="field === 'imprint'" class="provider" data-test="provider">
      <strong>{{ siteName }}</strong><br>
      {{ contact.data.street }}<br>
      {{ contact.data.postalCode }} {{ contact.data.city }}<br>
      {{ t('phone') }}: <a :href="telHref(contact.data.phone)">{{ contact.data.phone }}</a>
      <template v-if="contact.data.email"><br>{{ t('email') }}: <a :href="`mailto:${contact.data.email}`">{{ contact.data.email }}</a></template>
    </address>
    <GinkoMarkdown :value="legal.data[field]" class="prose body" :lang="langOf(legal, field)" />
  </div>
</template>

<style scoped>
.provider { margin-top: 24px; font-style: normal; }
.body { margin-top: 24px; }
</style>
