<!-- The site preview (UI.md 4, SPEC 8 "Vorschau"): the site's /__ginko/preview in an iframe, fed by
     message with a bundle the core builds from the stored entries plus the unsaved form values.
     Nothing reaches production; the preview page never fetches. The frame renders the site at a device width
     (desktop 1280px or phone 390px) and is scaled down to the pane, so a narrow pane still shows the desktop layout. -->
<script setup lang="ts">
import type { Json, Locale } from '@lupinum/ginko'
import { servedBundle, todayIn, type FileInfo, type Schema, type StoredEntry } from '@lupinum/ginko/internal'
import type { Entry } from '../composables/useSiteData'
import type { Data } from '../utils/content'
import { siteOrigin } from '../utils/origin'
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useI18n } from '#imports'
import { useElementSize } from '@vueuse/core'
import { MonitorIcon, SmartphoneIcon, SquareArrowOutUpRightIcon, XIcon } from '@lucide/vue'
import { Button } from '@studio/components/ui/button'

const props = defineProps<{
  site: { slug: string; url: string; previewOrigins: string[]; schemaRev: number; contentRev: number }
  schema: Schema
  /** Undefined while they load: nothing is sent before, or the site would show without its entries. */
  entries: Entry[] | undefined
  /** The form being edited: its brick, its entry (none = new), and the unsaved values. */
  editing?: { brick: string; entry?: string; data: Data }
  locale: Locale
  /** The page to show first; undefined while the entry has no page to show (see `notice`). */
  path?: string
  /** Shown in place of the page while `path` is undefined: why there is none (no address yet, not translated). */
  notice?: string
  files?: (id: string) => FileInfo | undefined
  /** Changes when the files behind `files` change (an upload became ready), so the bundle is sent again. */
  revision?: string
  /** Docked beside the form on a wide screen (flush with the panel, a close button); else a card under the form. */
  docked?: boolean
  /** The field being edited: the page outlines where it shows `text`, with the field's label. */
  focus?: { path: string; text: string; label: string }
}>()
const emit = defineEmits<{ close: [] }>()

const { t } = useI18n()
/** A local platform previews the local site; a hosted one the site's own URL. */
const origin = computed(() => siteOrigin(props.site))

const session = ref(crypto.randomUUID())
const path = ref(props.path)
watch(() => props.path, (p) => { path.value = p; session.value = crypto.randomUUID() })
const src = computed(() => `${origin.value}/__ginko/preview?path=${encodeURIComponent(path.value ?? '')}&locale=${props.locale}&session=${session.value}`)
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

/**
 * The device the site is drawn for, remembered per browser. Without a choice: the desktop layout, or the phone one
 * when the pane is too narrow for a desktop page to stay readable (scale under about 0.4).
 */
const DEVICE = 'ginko:preview-device'
const WIDTHS = { desktop: 1280, phone: 390 } as const
type Device = keyof typeof WIDTHS
const chosen = ref<Device>()
onMounted(() => {
  try { const d = localStorage.getItem(DEVICE); if (d === 'desktop' || d === 'phone') chosen.value = d } catch { /* no choice yet */ }
})
function pick(d: Device) {
  chosen.value = d
  try { localStorage.setItem(DEVICE, d) } catch { /* not remembered */ }
}
const stage = ref<HTMLElement | null>(null)
const { width: stageWidth, height: stageHeight } = useElementSize(stage)
const device = computed<Device>(() => chosen.value ?? (stageWidth.value && stageWidth.value < 520 ? 'phone' : 'desktop'))
/** Scaled to the pane's width (never up); the frame is as tall as the pane at that scale. */
const scale = computed(() => (stageWidth.value ? Math.min(1, stageWidth.value / WIDTHS[device.value]) : 1))
/** A phone page at full size stands in the pane with room around it (`py-4`). */
const padded = computed(() => device.value === 'phone' && scale.value === 1)
const frameStyle = computed(() => ({
  width: `${WIDTHS[device.value]}px`,
  height: `${Math.max(1, stageHeight.value - (padded.value ? 32 : 0)) / scale.value}px`,
  transform: scale.value < 1 ? `scale(${scale.value})` : undefined,
}))

function bundle() {
  const entries: Record<string, StoredEntry[]> = {}
  for (const e of props.entries ?? []) {
    const data = props.editing && props.editing.brick === e.brick && props.editing.entry === e._id ? { ...e.data, ...props.editing.data } : e.data
    ;(entries[e.brick] ??= []).push({ id: e._id, order: e.order, data: data as Record<string, Json>, prints: e.prints })
  }
  if (props.editing && !props.editing.entry) {
    ;(entries[props.editing.brick] ??= []).push({ id: 'new', order: Number.MAX_SAFE_INTEGER, data: props.editing.data as Record<string, Json> })
  }
  // Served like the platform's bundle endpoint: Markdown as trees, since the site has no parser.
  return servedBundle({
    schema: props.schema, requestedLocale: props.locale, entries, files: props.files ?? (() => undefined),
    schemaRev: props.site.schemaRev, contentRev: props.site.contentRev, generatedAt: new Date().toISOString(), today: todayIn(props.schema.timeZone),
  })
}

let sends = 0
async function send() {
  if (!ready.value || !props.entries || !frame.value?.contentWindow) return
  const run = ++sends
  const message = { type: 'ginko:preview', session: session.value, site: props.site.slug, locale: props.locale, bundle: JSON.parse(JSON.stringify(await bundle())), focus: focusNow() }
  // A newer edit was sent while this one was parsed.
  if (run === sends) frame.value?.contentWindow?.postMessage(message, origin.value)
}

/** `zoom`: the scale the page is drawn at, so its outline and label keep their size in the pane. */
const focusNow = () => ({ text: props.focus?.text ?? '', label: props.focus?.label ?? '', zoom: scale.value })
/**
 * Another field got the focus: the page outlines it at once. Typing changes the text, which travels with the next
 * bundle instead, so the page looks for it only once it shows it.
 */
function sendFocus() {
  if (!ready.value || !frame.value?.contentWindow) return
  frame.value.contentWindow.postMessage({ type: 'ginko:focus', session: session.value, site: props.site.slug, ...focusNow() }, origin.value)
}
watch(() => [props.focus?.path, scale.value], sendFocus)

let timer: ReturnType<typeof setTimeout> | undefined
function sendSoon() {
  clearTimeout(timer)
  timer = setTimeout(send, 250)
}
// The form's values change inside one object; the entries come as a new list with every update, so they need no deep watch.
watch(() => props.editing, sendSoon, { deep: true })
watch(() => [props.entries, props.locale, props.revision], sendSoon)
watch(() => props.locale, () => { session.value = crypto.randomUUID() })
watch(src, () => { ready.value = false; if (path.value) waitForReady(); else clearTimeout(readyTimer) })

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
onMounted(() => { window.addEventListener('message', onMessage); if (path.value) waitForReady() })
onBeforeUnmount(() => { window.removeEventListener('message', onMessage); clearTimeout(timer); clearTimeout(readyTimer) })
</script>

<template>
  <section :class="['grid h-full grid-rows-[auto_1fr] overflow-hidden bg-sidebar', docked ? 'border-l' : 'rounded-xl border']" :aria-label="t('entry.preview.label')">
    <header class="flex min-h-12 items-center gap-2 border-b bg-card px-3 py-1.5 text-sm">
      <div class="flex flex-none rounded-lg bg-muted p-0.5" role="group" :aria-label="t('entry.preview.device')">
        <button
          v-for="d in (['desktop', 'phone'] as const)" :key="d" type="button" :aria-pressed="device === d"
          class="inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 font-medium text-muted-foreground outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/80 aria-pressed:bg-card aria-pressed:text-foreground aria-pressed:shadow-xs pointer-coarse:h-10"
          @click="pick(d)"
        >
          <component :is="d === 'desktop' ? MonitorIcon : SmartphoneIcon" class="size-4" aria-hidden="true" />
          <span class="max-[1279px]:sr-only">{{ d === 'desktop' ? t('entry.preview.desktop') : t('entry.preview.phone') }}</span>
        </button>
      </div>
      <span class="min-w-0 flex-1 truncate px-1 text-muted-foreground" :title="path">{{ path }}</span>
      <Button v-if="path" as-child variant="ghost" size="sm" class="text-muted-foreground">
        <a :href="siteHref" target="_blank" rel="noopener"><span class="max-[1279px]:sr-only">{{ t('entry.preview.open') }}</span><SquareArrowOutUpRightIcon aria-hidden="true" /><span class="sr-only"> {{ t('nav.newTab') }}</span></a>
      </Button>
      <Button v-if="docked" type="button" variant="ghost" size="icon-sm" class="text-muted-foreground" :aria-label="t('entry.preview.close')" @click="emit('close')">
        <XIcon aria-hidden="true" />
      </Button>
    </header>
    <div v-if="!path" class="grid place-content-center p-6 text-center" role="status">
      <p class="max-w-[36ch] text-sm text-muted-foreground">{{ notice }}</p>
    </div>
    <div v-else ref="stage" :class="['relative min-h-0 overflow-hidden', padded && 'grid justify-items-center py-4']">
      <iframe
        ref="frame" :key="session" :src="src" :title="t('entry.preview.frameTitle')" :style="frameStyle"
        :class="['origin-top-left border-0 bg-white', padded && 'rounded-xl shadow-sm ring-1 ring-border']"
      />
      <div v-if="stuck" class="absolute inset-0 grid place-content-center justify-items-center gap-3 bg-card p-6 text-center" role="status">
        <p class="max-w-[36ch] text-sm text-muted-foreground">{{ t('entry.preview.stuck') }}</p>
        <Button as-child variant="secondary">
          <a :href="siteHref" target="_blank" rel="noopener">{{ t('entry.preview.openSite') }}</a>
        </Button>
      </div>
    </div>
  </section>
</template>
