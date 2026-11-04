<!-- The photo of an image field with frames (`f.image(…, { aspect })`) as the site shows it: the whole photo with its
     focus point (FocusPicker), and below it one tile per frame, cropped as <GinkoImage> crops (same frames, same focus
     point). The tiles follow the point while it moves. The point belongs to the library photo, so every use of the
     photo follows it. A tile warns when the frame cuts away much of a photo of the other orientation, or shows so few
     pixels that it may look blurred. Used in the field itself and in the "Ausschnitt" dialog. -->
<script setup lang="ts">
import { computed, ref } from 'vue'
import { Check, TriangleAlert } from '@lucide/vue'
import { useI18n } from '#imports'
import { focusPosition, type ImageFrame } from '@lupinum/ginko/internal'
import { useGinkoAssets, type UploadDetails } from '@lupinum/ginko-editor'
import { frameShape, frameWarning } from '../../utils/frames'
import FocusPicker from './FocusPicker.vue'

const props = defineProps<{
  id: string
  /** The library file: its URL, pixel size and saved focus point. */
  fileId: string
  file: UploadDetails
  frames: ImageFrame[]
}>()
const { t } = useI18n()
const assets = useGinkoAssets()
const allowed = computed(() => assets.focus?.allowed.value ?? false)
/** The point the tiles crop around: FocusPicker's, also while it moves; the saved one from the first render on. */
const focus = ref(props.file.focus ?? { x: 0.5, y: 0.5 })
const stored = ref(false)
const save = async (point: { x: number; y: number }) => { await assets.focus?.set(props.fileId, point) }

/**
 * Tiles share one height (a larger one when the field has a single frame: it is the only place the site shows the
 * photo); the width follows from the ratio and the tile shrinks as a whole in a narrow column, so its shape stays true.
 */
const tileRem = computed(() => (props.frames.length === 1 ? 8 : 6))
const tiles = computed(() => props.frames.map((frame) => {
  const warning = frameWarning(props.file.width, props.file.height, frame)
  return {
    key: frame.name ?? frame.aspect,
    label: `${t(`fields.image.frames.${frameShape(frame.aspect)}`)} ${frame.aspect}`,
    style: { aspectRatio: frame.aspect.replace(':', ' / '), width: `${tileRem.value * frame.ratio}rem` },
    warning: warning && t(`fields.image.frames.${warning.key}`, warning),
  }
}))
const hintId = computed(() => `${props.id}-frames-hint`)
</script>

<template>
  <div class="grid gap-3">
    <div class="grid gap-1.5">
      <FocusPicker v-model:live="focus" v-model:stored="stored" :src="file.url" :saved="file.focus" :editable="allowed" :save="save" :described-by="hintId" />
      <p :id="hintId" class="m-0 text-[13px] text-muted-foreground">{{ allowed ? t('fields.image.frames.hint') : t('fields.image.frames.hintStaff') }}</p>
    </div>

    <div class="grid gap-1.5">
      <div class="flex items-baseline justify-between gap-3">
        <p class="m-0 text-[13px] font-medium">{{ t('fields.image.frames.title') }}</p>
        <span v-if="stored" class="flex items-center gap-1 text-xs text-muted-foreground" aria-hidden="true"><Check class="size-3.5" />{{ t('files.info.saved') }}</span>
      </div>
      <ul class="m-0 flex list-none flex-wrap items-start gap-x-3 gap-y-2.5 p-0">
        <li v-for="tile in tiles" :key="tile.key" class="grid max-w-full min-w-0 gap-1" data-testid="frame">
          <div class="max-w-full overflow-hidden rounded-md border bg-muted" :style="tile.style">
            <img :src="file.url" alt="" class="block size-full object-cover" :style="{ objectPosition: focusPosition(focus) }">
          </div>
          <span class="text-xs text-muted-foreground tabular-nums">{{ tile.label }}</span>
          <span v-if="tile.warning" class="flex max-w-48 gap-1 text-xs leading-snug text-amber-700 dark:text-amber-400"><TriangleAlert class="mt-px size-3.5 shrink-0" aria-hidden="true" />{{ tile.warning }}</span>
        </li>
      </ul>
    </div>
  </div>
</template>
