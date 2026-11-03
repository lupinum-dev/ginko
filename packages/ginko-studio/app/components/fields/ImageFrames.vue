<!-- The photo of an image field with frames (`f.image(…, { aspect })`) as the site shows it: the whole photo with its
     focus point, and below it one tile per frame, cropped as <GinkoImage> crops (same frames, same focus point). Owner
     and admin set the point here with a click, a drag or the arrow keys; the tiles follow while the pointer moves, and
     it is saved on release. The point belongs to the library photo, so every use of the photo follows it. A tile warns
     when the frame cuts away much of a photo of the other orientation, or shows so few pixels that it may look blurred. -->
<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { TriangleAlert } from '@lucide/vue'
import { useI18n } from '#imports'
import { frameFit, type ImageFrame } from '@lupinum/ginko/internal'
import { useGinkoAssets, type UploadDetails } from '@lupinum/ginko-editor'

const props = defineProps<{
  id: string
  /** The library file of the field: its URL, pixel size and saved focus point. */
  fileId: string
  file: UploadDetails
  frames: ImageFrame[]
}>()
const { t } = useI18n()
const assets = useGinkoAssets()
const allowed = computed(() => assets.focus?.allowed.value ?? false)

type Point = { x: number; y: number }
/** The point while it is moved or saved; the saved one (live from the server) once that has arrived. */
const moving = ref<Point | null>(null)
const error = ref(false)
const focus = computed<Point>(() => moving.value ?? props.file.focus ?? { x: 0.5, y: 0.5 })
const position = (p: Point) => `${Math.round(p.x * 1000) / 10}% ${Math.round(p.y * 1000) / 10}%`
/** The pointer is down on the photo: the saved point coming back must not end the move. */
let dragging = false
watch(() => props.file.focus, (saved) => {
  if (saved && moving.value && !dragging && saved.x === moving.value.x && saved.y === moving.value.y) moving.value = null
})

const clamp = (n: number) => Math.min(1, Math.max(0, Math.round(n * 1000) / 1000))
function pointAt(event: PointerEvent): Point | undefined {
  const box = (event.currentTarget as HTMLElement).getBoundingClientRect()
  return box.width && box.height ? { x: clamp((event.clientX - box.left) / box.width), y: clamp((event.clientY - box.top) / box.height) } : undefined
}
function down(event: PointerEvent) {
  if (!allowed.value || event.button !== 0) return
  dragging = true
  ;(event.currentTarget as HTMLElement).setPointerCapture?.(event.pointerId)
  moving.value = pointAt(event) ?? moving.value
}
function move(event: PointerEvent) {
  if (dragging) moving.value = pointAt(event) ?? moving.value
}
function up() {
  if (!dragging) return
  dragging = false
  save()
}

async function save() {
  const point = moving.value
  if (!point || !assets.focus) return
  error.value = false
  try {
    await assets.focus.set(props.fileId, point)
  } catch {
    error.value = true
    moving.value = null
  }
}

// Arrow keys move the point by 5 % (with Shift 1 %); it is saved once the keys rest.
let timer: ReturnType<typeof setTimeout> | undefined
const STEPS: Record<string, Point> = { ArrowLeft: { x: -1, y: 0 }, ArrowRight: { x: 1, y: 0 }, ArrowUp: { x: 0, y: -1 }, ArrowDown: { x: 0, y: 1 } }
function key(event: KeyboardEvent) {
  const step = STEPS[event.key]
  if (!allowed.value || !step) return
  event.preventDefault()
  const size = event.shiftKey ? 0.01 : 0.05
  moving.value = { x: clamp(focus.value.x + step.x * size), y: clamp(focus.value.y + step.y * size) }
  clearTimeout(timer)
  timer = setTimeout(save, 400)
}
onBeforeUnmount(() => {
  if (timer === undefined) return
  clearTimeout(timer)
  void save()
})

/** "Hochformat 3:4": the frame's shape in words, then its ratio. */
function shapeOf(frame: ImageFrame) {
  const shape = Math.abs(frame.ratio - 1) < 0.02 ? 'square' : frame.ratio < 1 ? 'portrait' : frame.ratio >= 2 ? 'wide' : 'landscape'
  return `${t(`fields.image.frames.${shape}`)} ${frame.aspect}`
}
const tiles = computed(() => props.frames.map((frame) => {
  const fit = props.file.width && props.file.height ? frameFit(props.file.width, props.file.height, frame.ratio) : undefined
  const warning = !fit ? null
    : fit.turned ? t(frame.ratio < 1 ? 'fields.image.frames.turnedLying' : 'fields.image.frames.turnedUpright')
    : fit.small ? t('fields.image.frames.small', { width: fit.width, height: fit.height })
    : null
  return { key: frame.name ?? frame.aspect, label: shapeOf(frame), aspect: frame.aspect.replace(':', ' / '), warning }
}))
/** One frame gets a larger tile: it is the only place the site shows the photo. */
const tileHeight = computed(() => (props.frames.length === 1 ? 'h-28' : 'h-20'))
const hintId = computed(() => `${props.id}-frames-hint`)
const percent = (n: number) => Math.round(n * 100)
</script>

<template>
  <div class="grid gap-3">
    <div class="grid place-items-center rounded-lg border bg-muted/60 p-2">
      <!-- The clickable box is exactly the photo, so a click maps to the photo's own coordinates. -->
      <div
        class="relative w-fit max-w-full touch-none select-none rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring"
        :class="allowed && 'cursor-crosshair'"
        :tabindex="allowed ? 0 : undefined"
        :role="allowed ? 'group' : undefined"
        :aria-label="allowed ? t('fields.image.frames.point', { x: percent(focus.x), y: percent(focus.y) }) : undefined"
        :aria-describedby="hintId"
        data-testid="focus-area"
        @pointerdown="down" @pointermove="move" @pointerup="up" @pointercancel="up" @keydown="key"
      >
        <img :src="file.url" alt="" class="pointer-events-none block max-h-56 max-w-full rounded-md object-contain" draggable="false">
        <span
          class="pointer-events-none absolute size-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-primary shadow-[0_0_0_1px_rgb(0_0_0/0.35),0_1px_3px_rgb(0_0_0/0.4)]"
          :style="{ left: `${focus.x * 100}%`, top: `${focus.y * 100}%` }"
          data-testid="focus-point"
        />
      </div>
    </div>
    <p :id="hintId" class="m-0 text-[13px] text-muted-foreground">{{ allowed ? t('fields.image.frames.hint') : t('fields.image.frames.hintStaff') }}</p>
    <p v-if="error" class="m-0 text-[13px] font-medium text-destructive" role="alert">{{ t('fields.image.frames.failed') }}</p>

    <div class="grid gap-1.5">
      <p class="m-0 text-[13px] font-medium">{{ t('fields.image.frames.title') }}</p>
      <ul class="m-0 flex list-none flex-wrap items-start gap-x-3 gap-y-2.5 p-0">
        <li v-for="tile in tiles" :key="tile.key" class="grid max-w-full min-w-0 gap-1" data-testid="frame">
          <div class="max-w-full overflow-hidden rounded-md border bg-muted" :class="tileHeight" :style="{ aspectRatio: tile.aspect }">
            <img :src="file.url" alt="" class="block size-full object-cover" :style="{ objectPosition: position(focus) }">
          </div>
          <span class="text-xs text-muted-foreground tabular-nums">{{ tile.label }}</span>
          <span v-if="tile.warning" class="flex max-w-48 gap-1 text-xs leading-snug text-amber-700 dark:text-amber-400"><TriangleAlert class="mt-px size-3.5 shrink-0" aria-hidden="true" />{{ tile.warning }}</span>
        </li>
      </ul>
    </div>
  </div>
</template>
