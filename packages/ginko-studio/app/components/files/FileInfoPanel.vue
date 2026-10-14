<!-- One file in detail (UI.md 10.3): preview with focus point, name, alt text, facts, where it is used and
     the actions. Everything that changes the library is for owner and admin (`canManage`). -->
<script setup lang="ts">
import { CONTAINED_FIELD } from '@studio/components/fields/sizes'
import { computed, ref, watch } from 'vue'
import { useI18n } from '#imports'
import { FileTextIcon } from '@lucide/vue'
import { Button } from '@studio/components/ui/button'
import { Input } from '@studio/components/ui/input'
import { Label } from '@studio/components/ui/label'
import { languageName } from '../../utils/content'
import { useStudioSite } from '../../utils/labels'
import type { FilesLibrary, UsedIn } from '../../composables/useFilesLibrary'
import { fieldsText } from './util'
import { sizeText } from '../../utils/size'
import { whoText } from '../../utils/who'
import { whenFull } from '../../utils/when'

/** `showAlt: false` in the picker: it asks for the description itself, one field instead of two. */
const props = withDefaults(defineProps<{ id: string; lib: FilesLibrary; locales: string[]; inTrash: boolean; showAlt?: boolean }>(), { showAlt: true })
const emit = defineEmits<{ remove: []; moveTo: []; restore: [] }>()
const { t, format, locale: studioLocale } = useI18n()
const site = useStudioSite()

const info = props.lib.info(() => props.id)
const canManage = props.lib.canManage

const error = ref<string | null>(null)
const name = ref('')
watch(() => info.value?.name, (value) => { name.value = value ?? '' }, { immediate: true })

async function run(action: () => Promise<unknown>) {
  error.value = null
  try {
    await action()
  } catch (e) {
    error.value = props.lib.errorText(e)
  }
}

function saveName() {
  const given = name.value.trim()
  if (!info.value || !given || given === info.value.name) {
    name.value = info.value?.name ?? ''
    return
  }
  void run(() => props.lib.rename(props.id, given))
}

function focusAt(event: MouseEvent) {
  if (!canManage.value || !info.value || info.value.kind !== 'image' || props.inTrash) return
  const box = (event.currentTarget as HTMLElement).getBoundingClientRect()
  if (!box.width || !box.height) return
  const clamp = (n: number) => Math.min(1, Math.max(0, n))
  void run(() => props.lib.setFocus(props.id, { x: clamp((event.clientX - box.left) / box.width), y: clamp((event.clientY - box.top) / box.height) }))
}

const picker = ref<HTMLInputElement | null>(null)
const replacing = ref(false)
async function replaceWith(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  replacing.value = true
  await run(() => props.lib.replace(props.id, file))
  replacing.value = false
}

// Alt text per content language: the library text, the default for every use without its own text. Staff see it, owners and admins edit it.
const alt = ref<Record<string, string>>({})
const savedAlt = ref<string | null>(null)
watch(() => info.value?.alt, (value) => {
  alt.value = Object.fromEntries(props.locales.map((l) => [l, typeof value?.[l] === 'string' ? (value[l] as string) : '']))
}, { immediate: true })
/** The newest text an entry has for this photo, shown as the placeholder while the library has none. */
const suggestion = computed<Record<string, string>>(() => Object.fromEntries(Object.entries(info.value?.altSuggestion ?? {}).filter(([, text]) => typeof text === 'string')) as Record<string, string>)
function saveAlt(locale: string) {
  const setAlt = props.lib.setAlt
  if (!setAlt || !canManage.value) return
  void run(() => setAlt(props.id, locale, alt.value[locale] ?? '').then(() => { savedAlt.value = locale }))
}

const used = computed(() => info.value?.usedIn ?? [])
/** `<field label> · <language>` of one use: the labels of the fields it sits in (the path when a field is gone), the language only when the server names one. */
const whereOf = (use: UsedIn) => [
  fieldsText(use, site.shown),
  ...(use.locale ? [languageName(use.locale, studioLocale.value)] : []),
].join(' · ')
const typeText = computed(() => (info.value ? (info.value.kind === 'image' ? info.value.mime.replace('image/', '').toUpperCase() : 'PDF') : ''))
const dimensions = computed(() => (info.value?.width && info.value.height ? `${info.value.width} × ${info.value.height}` : null))
const uploaded = computed(() => (info.value ? whenFull(info.value.createdAt, site.timeZone(), format) : ''))
</script>

<template>
  <div v-if="info" class="grid content-start gap-4">
    <div
      v-if="info.kind === 'image' && info.url"
      class="relative w-fit max-w-full justify-self-center"
      :class="canManage && !inTrash ? 'cursor-crosshair' : ''"
      @click="focusAt"
    >
      <img :src="info.url" alt="" class="block max-h-64 max-w-full rounded-md object-contain">
      <span
        v-if="info.focus"
        class="pointer-events-none absolute size-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-primary shadow"
        :style="{ left: `${info.focus.x * 100}%`, top: `${info.focus.y * 100}%` }"
        data-testid="focus-point"
      />
    </div>
    <div v-else class="grid h-32 place-items-center rounded-md bg-muted"><FileTextIcon class="size-12 text-muted-foreground" aria-hidden="true" /></div>
    <p v-if="canManage && info.kind === 'image' && !inTrash" class="text-xs text-muted-foreground">{{ t('files.focusHint') }}</p>

    <div :class="CONTAINED_FIELD">
      <Label for="file-name" class="text-xs leading-snug font-medium text-muted-foreground">{{ t('files.info.name') }}</Label>
      <Input id="file-name" v-model="name" :disabled="!canManage || inTrash" @blur="saveName" @keydown.enter.prevent="($event.target as HTMLInputElement).blur()" />
    </div>

    <div v-if="info.kind === 'image' && showAlt" class="grid gap-2">
      <div v-for="locale in locales" :key="locale" class="grid gap-1">
        <Label :for="`file-alt-${locale}`" class="text-sm font-medium">{{ locales.length > 1 ? `${t('files.info.alt')} (${locale.toUpperCase()})` : t('files.info.alt') }}</Label>
        <Input v-if="canManage && lib.setAlt" :id="`file-alt-${locale}`" v-model="alt[locale]" :placeholder="suggestion[locale] ?? ''" aria-describedby="file-alt-default" @blur="saveAlt(locale)" />
        <p v-else :id="`file-alt-${locale}`" class="text-sm [overflow-wrap:anywhere]">{{ alt[locale] || '–' }}</p>
        <p v-if="savedAlt === locale" class="text-xs text-muted-foreground" role="status">{{ t('files.info.saved') }}</p>
      </div>
      <p id="file-alt-default" class="text-xs text-muted-foreground">{{ t('files.info.altDefault') }}</p>
    </div>

    <dl class="m-0 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
      <dt class="text-muted-foreground">{{ t('files.info.type') }}</dt><dd class="m-0">{{ typeText }}</dd>
      <dt class="text-muted-foreground">{{ t('files.info.size') }}</dt><dd class="m-0">{{ sizeText(info.size, format.number) }}</dd>
      <template v-if="dimensions"><dt class="text-muted-foreground">{{ t('files.info.dimensions') }}</dt><dd class="m-0">{{ dimensions }}</dd></template>
      <dt class="text-muted-foreground">{{ t('files.info.uploaded') }}</dt><dd class="m-0">{{ uploaded }}</dd>
      <dt class="text-muted-foreground">{{ t('files.info.uploadedBy') }}</dt><dd class="m-0 [overflow-wrap:anywhere]">{{ whoText(info.uploadedBy, t) }}</dd>
    </dl>

    <section class="grid gap-1" aria-labelledby="file-used">
      <h3 id="file-used" class="m-0 text-sm font-medium">{{ t('files.info.usedIn') }}</h3>
      <p v-if="!used.length" class="text-sm text-muted-foreground">{{ t('files.info.notUsed') }}</p>
      <ul v-else class="m-0 grid list-none gap-1 p-0 text-sm">
        <li v-for="use in used" :key="use.entry" class="[overflow-wrap:anywhere]">
          <span v-if="use.deleted">{{ use.title }} · {{ whereOf(use) }} {{ t('files.deletedEntry') }}</span>
          <template v-else><NuxtLink :to="`/s/${lib.slug.value}/all/${use.brick}/${use.entry}`" class="text-primary underline underline-offset-4">{{ use.title }}</NuxtLink> · {{ whereOf(use) }}</template>
        </li>
      </ul>
    </section>

    <p v-if="error" class="text-sm font-medium text-destructive" role="alert">{{ error }}</p>

    <div class="grid gap-2">
      <template v-if="inTrash">
        <Button v-if="canManage" type="button" @click="emit('restore')">{{ t('files.restore') }}</Button>
      </template>
      <template v-else>
        <template v-if="canManage">
          <div class="grid gap-1">
            <Button type="button" variant="outline" :disabled="replacing" @click="picker?.click()">{{ replacing ? t('files.uploading') : t('files.replace') }}</Button>
            <p class="text-xs text-muted-foreground">{{ t('files.replaceNote') }}</p>
          </div>
          <input ref="picker" class="sr-only" type="file" tabindex="-1" aria-hidden="true" :accept="info.kind === 'image' ? 'image/jpeg,image/png,image/webp,image/heic' : 'application/pdf'" @change="replaceWith">
        </template>
        <Button v-if="info.url" as-child variant="outline"><a :href="info.url" :download="info.name">{{ t('files.download') }}</a></Button>
        <template v-if="canManage">
          <Button type="button" variant="outline" @click="emit('moveTo')">{{ t('files.moveTo') }}</Button>
          <Button type="button" variant="outline" @click="emit('remove')">{{ info.used ? t('files.removeUsed') : t('files.remove') }}</Button>
        </template>
      </template>
    </div>
  </div>
  <p v-else-if="info === null" class="text-sm font-medium text-destructive" role="alert">{{ t('files.gone') }}</p>
</template>
