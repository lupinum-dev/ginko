<!-- A contact person: photo or a steel circle with initials, name, role, phone, e-mail. -->
<script setup lang="ts">
import { initials, telHref } from '../utils/site'
import { safeHref } from '@lupinum/ginko'

const langOf = useGinkoLang()

type Contact = GinkoItem<'contacts'>
defineProps<{ contact: Contact }>()
</script>

<template>
  <article class="card" data-test="contact">
    <img v-if="contact.data.photo && safeHref(contact.data.photo.url)" class="avatar" :src="safeHref(contact.data.photo.url)" :alt="contact.data.photo.alt" :lang="langOf(contact, 'photo.alt')" width="56" height="56" loading="lazy">
    <span v-else class="avatar initials" aria-hidden="true">{{ initials(contact.data.name) }}</span>
    <div class="text">
      <h3>{{ contact.data.name }}</h3>
      <p class="role" :lang="langOf(contact, 'role')">{{ contact.data.role }}</p>
      <p><a :href="telHref(contact.data.phone)" class="mono">{{ contact.data.phone }}</a></p>
      <p><a :href="`mailto:${contact.data.email}`">{{ contact.data.email }}</a></p>
    </div>
  </article>
</template>

<style scoped>
.card { display: flex; gap: 16px; align-items: flex-start; padding: 20px; background: var(--surface); border: 1px solid var(--rule); border-radius: var(--radius); }
.avatar { flex: none; width: 56px; height: 56px; border-radius: 50%; object-fit: cover; }
.initials { display: grid; place-items: center; background: var(--steel); color: var(--steel-ink); font-weight: 600; letter-spacing: 0.04em; }
.text { min-width: 0; font-size: 0.95rem; }
h3 { font-size: 1.1rem; }
.role { color: var(--ink-2); margin-bottom: 6px; }
</style>
