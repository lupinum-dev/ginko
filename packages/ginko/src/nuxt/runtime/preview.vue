<script setup lang="ts">
// The preview shell (SPEC 8 "Vorschau"). It announces itself to the platform that frames it,
// and once the platform sends a bundle (handled by the plugin) it opens the target route.
// It never fetches: the bundle comes only by message.
import { definePageMeta, navigateTo, onBeforeUnmount, onMounted, ref, useRequestHeaders, useRoute, useRouter, useRuntimeConfig, useState, watch } from '#imports'
import { coreMessage, type Bundle, type Locale } from '../../internal.ts'
import { BUNDLE_STATE, PREVIEW_STATE } from './composables.ts'
import type { GinkoPublicConfig } from './shared.ts'

// No layout: a site's layout may read content, and the preview has none until the platform sends it.
definePageMeta({ layout: false })

const route = useRoute()
const router = useRouter()
const config = useRuntimeConfig().public.ginko as GinkoPublicConfig
const bundles = useState<Partial<Record<Locale, Bundle>>>(BUNDLE_STATE, () => ({}))
const preview = useState<{ session: string; locale: Locale } | null>(PREVIEW_STATE, () => null)
// The owner reads this inside the Studio: their browser language, taken once on the server so hydration matches.
const reader = useState('ginko:preview-reader', () => (import.meta.server ? useRequestHeaders(['accept-language'])['accept-language']?.split(/[,;]/)[0] : navigator.language) || 'en')

// Relative paths only, and a route that exists. The path is checked as sent and as decoded per segment,
// so an encoded `%2e%2e`, `%5c` or `%2f%2f` cannot pass for `..`, a backslash or `//`.
function isSafePath(raw: string): boolean {
  let decoded: string
  try {
    decoded = raw.split('/').map((segment) => decodeURIComponent(segment)).join('/')
  } catch {
    return false
  }
  return [raw, decoded].every((form) => form.startsWith('/')
    && !form.includes('//')
    && !form.includes('\\')
    && !form.includes('..')
    && !form.split('/').includes('.')
    && !/[\u0000-\u001f\u007f]/.test(form))
}

const path = typeof route.query.path === 'string' ? route.query.path : ''
const session = typeof route.query.session === 'string' ? route.query.session : ''
const locale = config.locales.find((l) => l === route.query.locale)
const valid = Boolean(locale && session && isSafePath(path) && router.resolve(path).matched.length > 0)

const failed = ref(false)
const platformOrigin = config.platform ? new URL(config.platform).origin : ''
let timer: ReturnType<typeof setTimeout> | undefined

onMounted(() => {
  if (!valid || !locale) return
  preview.value = { session, locale }
  if (platformOrigin) window.parent.postMessage({ type: 'ginko:ready', session }, platformOrigin)
  timer = setTimeout(() => { if (!bundles.value[locale]) failed.value = true }, 5000)
})

// The first accepted bundle opens the target route; later bundles update the page in place.
let navigated = false
watch(() => (locale ? bundles.value[locale] : undefined), (bundle) => {
  if (!bundle || navigated) return
  navigated = true
  clearTimeout(timer)
  navigateTo(path, { replace: true })
})

onBeforeUnmount(() => clearTimeout(timer))
</script>

<template>
  <main>
    <p v-if="!valid">{{ coreMessage(reader, 'preview.notFound') }}</p>
    <p v-else-if="failed">{{ coreMessage(reader, 'preview.failed') }}</p>
    <p v-else>{{ coreMessage(reader, 'preview.loading') }}</p>
  </main>
</template>
