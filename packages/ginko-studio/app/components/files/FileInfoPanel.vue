<!-- One file in detail (UI.md 10.3): preview with focus point, name, alt text, facts, where it is used and
     the actions. Everything that changes the library is for owner and admin (`canManage`). -->
<script setup lang="ts">
import { acceptOf } from '@lupinum/ginko/internal'
import { computed, ref, watch } from 'vue'
import { useI18n } from '#imports'
import { DownloadIcon, FileTextIcon, FolderInputIcon, RefreshCwIcon, Trash2Icon } from '@lucide/vue'
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

const props = defineProps<{ id: string; lib: FilesLibrary; locales: string[]; inTrash: boolean }>()
const emit = defineEmits<{ remove: []; moveTo: []; restore: [] }>()
const { t, format, locale: studioLocale } = useI18n()
const site = useStudioSite()

const info = props.lib.info(() => props.id)
const canManage = props.lib.canManage

const error = ref<string | null>(null)
const name = ref('')
watch(() => info.value?.name, (value) => { name.value = value ?? '' }, { immediate: true })
/**
 * "Gespeichert" under the name after a rename, like under the alt text; the next keystroke in that field clears it. Another file gets a
 * panel of its own (FilesBrowser keys it by id), so a rename that answers late never marks the next file.
 */
const savedName = ref(false)

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
  void run(() => props.lib.rename(props.id, given).then(() => { savedName.value = true }))
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
/** The quiet list under Replace: one full-width ghost row per action, icon and text left aligned. */
const quiet = 'w-full justify-start px-2 has-[>svg]:px-2'
const uploaded = computed(() => (info.value ? whenFull(info.value.createdAt, site.timeZone(), format) : ''))
</script>

<template>
  <div v-if="info" class="grid content-start gap-5">
    <div class="grid gap-2">
      <div v-if="info.kind === 'image' && info.url" class="grid place-items-center rounded-lg bg-muted/60 p-2">
        <div class="relative w-fit max-w-full" :class="canManage && !inTrash ? 'cursor-crosshair' : ''" @click="focusAt">
          <img :src="info.url" alt="" class="block max-h-56 max-w-full rounded-md object-contain">
          <span
            v-if="info.focus"
            class="pointer-events-none absolute size-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-primary shadow"
            :style="{ left: `${info.focus.x * 100}%`, top: `${info.focus.y * 100}%` }"
            data-testid="focus-point"
          />
        </div>
      </div>
      <div v-else class="grid h-32 place-items-center rounded-lg bg-muted"><FileTextIcon class="size-12 text-muted-foreground" aria-hidden="true" /></div>
      <p v-if="canManage && info.kind === 'image' && !inTrash" class="m-0 text-xs text-muted-foreground">{{ t('files.focusHint') }}</p>
    </div>

    <!-- The actions right under the preview: Replace is the job people come for (new lunch PDF, new team photo). -->
    <div class="grid gap-2">
      <template v-if="inTrash">
        <Button v-if="canManage" type="button" @click="emit('restore')">{{ t('files.restore') }}</Button>
      </template>
      <template v-else>
        <template v-if="canManage">
          <Button type="button" variant="outline" :disabled="replacing" @click="picker?.click()"><RefreshCwIcon aria-hidden="true" />{{ replacing ? t('files.uploading') : t('files.replace') }}</Button>
          <input ref="picker" class="sr-only" type="file" tabindex="-1" aria-hidden="true" :accept="acceptOf(info.kind === 'image' ? 'image' : 'file')" @change="replaceWith">
          <p class="m-0 text-xs text-muted-foreground">{{ t('files.replaceNote') }}</p>
        </template>
        <div class="grid gap-0.5" :class="canManage && '-mx-2'">
          <Button v-if="info.url" as-child :variant="canManage ? 'ghost' : 'outline'" size="sm" :class="canManage && quiet"><a :href="info.url" :download="info.name"><DownloadIcon aria-hidden="true" />{{ t('files.download') }}</a></Button>
          <template v-if="canManage">
            <Button type="button" variant="ghost" size="sm" :class="quiet" @click="emit('moveTo')"><FolderInputIcon aria-hidden="true" />{{ t('files.moveTo') }}</Button>
            <Button type="button" variant="ghost" size="sm" :class="quiet" class="text-destructive hover:bg-destructive/10 hover:text-destructive" @click="emit('remove')"><Trash2Icon aria-hidden="true" />{{ info.used ? t('files.removeUsed') : t('files.remove') }}</Button>
          </template>
        </div>
      </template>
    </div>

    <p v-if="error" class="m-0 text-sm font-medium text-destructive" role="alert">{{ error }}</p>

    <div class="grid gap-4 border-t pt-4">
      <div class="grid gap-1">
        <div class="grid gap-1.5">
          <Label for="file-name" class="text-sm leading-snug font-medium">{{ t('files.info.name') }}</Label>
          <Input id="file-name" v-model="name" :disabled="!canManage || inTrash" @input="savedName = false" @blur="saveName" @keydown.enter.prevent="($event.target as HTMLInputElement).blur()" />
        </div>
        <p v-if="savedName" class="m-0 text-xs text-muted-foreground" role="status">{{ t('files.info.saved') }}</p>
      </div>

      <div v-if="info.kind === 'image'" class="grid gap-3">
        <div v-for="locale in locales" :key="locale" class="grid gap-1.5">
          <Label :for="`file-alt-${locale}`" class="text-sm font-medium">{{ locales.length > 1 ? `${t('files.info.alt')} (${locale.toUpperCase()})` : t('files.info.alt') }}</Label>
          <Input v-if="canManage && lib.setAlt" :id="`file-alt-${locale}`" v-model="alt[locale]" :placeholder="suggestion[locale] ?? ''" aria-describedby="file-alt-default" @input="savedAlt = null" @blur="saveAlt(locale)" />
          <p v-else :id="`file-alt-${locale}`" class="m-0 text-sm [overflow-wrap:anywhere]">{{ alt[locale] || '–' }}</p>
          <p v-if="savedAlt === locale" class="m-0 text-xs text-muted-foreground" role="status">{{ t('files.info.saved') }}</p>
        </div>
        <p id="file-alt-default" class="m-0 text-xs text-muted-foreground">{{ t('files.info.altDefault') }}</p>
      </div>
    </div>

    <section class="grid gap-1.5 border-t pt-4" aria-labelledby="file-used">
      <h3 id="file-used" class="m-0 text-sm font-semibold">{{ t('files.info.usedIn') }}</h3>
      <p v-if="!used.length" class="m-0 text-sm text-muted-foreground">{{ t('files.info.notUsed') }}</p>
      <ul v-else class="m-0 grid list-none gap-1.5 p-0 text-sm">
        <li v-for="use in used" :key="use.entry" class="[overflow-wrap:anywhere]">
          <span v-if="use.deleted">{{ use.title }} · {{ whereOf(use) }} {{ t('files.deletedEntry') }}</span>
          <template v-else><NuxtLink :to="`/s/${lib.slug.value}/all/${use.brick}/${use.entry}`" class="font-medium text-primary underline-offset-4 hover:underline">{{ use.title }}</NuxtLink> <span class="text-muted-foreground">· {{ whereOf(use) }}</span></template>
        </li>
      </ul>
    </section>

    <dl class="m-0 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 border-t pt-4 text-[13px]">
      <dt class="text-muted-foreground">{{ t('files.info.type') }}</dt><dd class="m-0">{{ typeText }}</dd>
      <dt class="text-muted-foreground">{{ t('files.info.size') }}</dt><dd class="m-0 tabular-nums">{{ sizeText(info.size, format.number) }}</dd>
      <template v-if="dimensions"><dt class="text-muted-foreground">{{ t('files.info.dimensions') }}</dt><dd class="m-0 tabular-nums">{{ dimensions }}</dd></template>
      <dt class="text-muted-foreground">{{ t('files.info.uploaded') }}</dt><dd class="m-0 tabular-nums">{{ uploaded }}</dd>
      <dt class="text-muted-foreground">{{ t('files.info.uploadedBy') }}</dt><dd class="m-0 [overflow-wrap:anywhere]">{{ whoText(info.uploadedBy, t) }}</dd>
    </dl>
  </div>
  <p v-else-if="info === null" class="text-sm font-medium text-destructive" role="alert">{{ t('files.gone') }}</p>
</template>
