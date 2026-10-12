<!-- The site preview (UI.md 4, SPEC 8 "Vorschau"): the site's /__ginko/preview in an iframe, fed by
     message with a bundle the core builds from the stored entries plus the unsaved form values.
     Nothing reaches production; the preview page never fetches. -->
<script setup lang="ts">
import type { Json, Locale } from '@lupinum/ginko'
import { servedBundle, todayIn, type FileInfo, type Schema, type StoredEntry } from '@lupinum/ginko/internal'
import type { Entry } from '../composables/useSiteData'
import type { Data } from '../utils/content'
import { siteOrigin } from '../utils/origin'
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useI18n } from '#imports'
import { Button } from '@studio/components/ui/button'

const props = defineProps<{
  site: { slug: string; url: string; previewOrigins: string[]; schemaRev: number; contentRev: number }
  schema: Schema
  entries: Entry[]
  /** The form being edited: its brick, its entry (none = new), and the unsaved values. */
  editing?: { brick: string; entry?: string; data: Data }
  locale: Locale
  /** The page to show first. */
  path: string
  files?: (id: string) => FileInfo | undefined
  /** Changes when the files behind `files` change (an upload became ready), so the bundle is sent again. */
  revision?: string
}>()

const { t } = useI18n()
/** A local platform previews the local site; a hosted one the site's own URL. */
const origin = computed(() => siteOrigin(props.site))

const session = ref(crypto.randomUUID())
const path = ref(props.path)
watch(() => props.path, (p) => { path.value = p; session.value = crypto.randomUUID() })
const src = computed(() => `${origin.value}/__ginko/preview?path=${encodeURIComponent(path.value)}&locale=${props.locale}&session=${session.value}`)
const frame = ref<HTMLIFrameElement | null>(null)
const ready = ref(false)
/** No `ginko:ready` in time: the site is down, refuses framing, or has no preview route. The owner gets a way out. */
const stuck = ref(false)
const READY_MS = 8000
let readyTimer: ReturnType<typeof setTimeout> | undefined
function waitForReady() {
  clearTimeout(readyTimer)
  stuck.value = false
  readyTimer = setTimeout(() => { if (!ready.value) stuck.value = true }, READY_MS)
}
const siteHref = computed(() => `${origin.value}${path.value}`)

function bundle() {
  const entries: Record<string, StoredEntry[]> = {}
  for (const e of props.entries) {
    const data = props.editing && props.editing.brick === e.brick && props.editing.entry === e._id ? { ...e.data, ...props.editing.data } : e.data
    ;(entries[e.brick] ??= []).push({ id: e._id, order: e.order, data: data as Record<string, Json>, prints: e.prints })
  }
  if (props.editing && !props.editing.entry) {
    ;(entries[props.editing.brick] ??= []).push({ id: 'new', order: Number.MAX_SAFE_INTEGER, data: props.editing.data as Record<string, Json> })
  }
  // Served like the platform's bundle endpoint: Markdown as trees, since the site has no parser.
  return servedBundle({
    schema: props.schema, requestedLocale: props.locale, entries, files: props.files ?? (() => undefined),
    schemaRev: props.site.schemaRev, contentRev: props.site.contentRev, generatedAt: new Date().toISOString(), today: todayIn(props.schema.timezone),
  })
}

let sends = 0
async function send() {
  if (!ready.value || !frame.value?.contentWindow) return
  const run = ++sends
  const message = { type: 'ginko:preview', session: session.value, site: props.site.slug, locale: props.locale, bundle: JSON.parse(JSON.stringify(await bundle())) }
  // A newer edit was sent while this one was parsed.
  if (run === sends) frame.value?.contentWindow?.postMessage(message, origin.value)
}

let timer: ReturnType<typeof setTimeout> | undefined
watch(() => [props.editing, props.entries, props.locale, props.revision], () => {
  clearTimeout(timer)
  timer = setTimeout(send, 250)
}, { deep: true })
watch(() => props.locale, () => { session.value = crypto.randomUUID() })
watch(src, () => { ready.value = false; waitForReady() })

function onMessage(event: MessageEvent) {
  if (event.source !== frame.value?.contentWindow || event.origin !== origin.value) return
  const data = event.data as { type?: string; session?: string; path?: string }
  if (data?.session !== session.value) return
  if (data.type === 'ginko:ready') {
    ready.value = true
    stuck.value = false
    clearTimeout(readyTimer)
    send()
  } else if (data.type === 'ginko:navigate' && typeof data.path === 'string' && data.path.startsWith('/') && !data.path.startsWith('//')) {
    path.value = data.path
    session.value = crypto.randomUUID()
  }
}
onMounted(() => { window.addEventListener('message', onMessage); waitForReady() })
onBeforeUnmount(() => { window.removeEventListener('message', onMessage); clearTimeout(timer); clearTimeout(readyTimer) })
</script>

<template>
  <section class="grid h-full grid-rows-[auto_1fr] overflow-hidden rounded-xl border bg-card" :aria-label="t('entry.preview.label')">
    <header class="flex items-baseline gap-2.5 border-b bg-muted px-4 py-2.5 text-sm">
      <span class="font-semibold">{{ t('entry.preview.label') }}</span>
      <span class="truncate text-muted-foreground">{{ path }}</span>
    </header>
    <div class="relative min-h-0">
      <iframe ref="frame" :key="session" :src="src" :title="t('entry.preview.frameTitle')" />
      <div v-if="stuck" class="absolute inset-0 grid place-content-center justify-items-center gap-3 bg-card p-6 text-center" role="status">
        <p class="max-w-[36ch] text-sm text-muted-foreground">{{ t('entry.preview.stuck') }}</p>
        <Button as-child variant="secondary">
          <a :href="siteHref" target="_blank" rel="noopener">{{ t('entry.preview.openSite') }}</a>
        </Button>
      </div>
    </div>
  </section>
</template>

<style scoped>
iframe { width: 100%; height: 100%; border: 0; background: #fff; }
</style>
