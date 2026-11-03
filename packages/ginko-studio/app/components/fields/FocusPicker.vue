<!-- The focus point of a library photo: the whole photo with its point, set with a click, a drag (mouse and pen), a tap
     or the arrow keys, and saved on release. A finger that scrolls the page over the photo changes nothing: on touch
     only a tap sets the point. `live` is the point shown right now (while it moves, then the saved one), so frames
     beside it can follow; `saved` turns true when a point was stored, for a visible "Gespeichert" where the caller
     has room for it without moving anything (this component announces it to screen readers). Used by the image
     field's frames, the "Ausschnitt" dialog and Files. -->
<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useI18n } from '#imports'

type Point = { x: number; y: number }
const props = defineProps<{
  src: string
  /** The saved point; the middle when there is none. */
  saved: Point | null | undefined
  /** Owner and admin; others see the point only. */
  editable: boolean
  save: (point: Point) => Promise<void>
  describedBy?: string
}>()
const live = defineModel<Point>('live')
const stored = defineModel<boolean>('stored', { default: false })
const { t } = useI18n()

/** The point while it is moved or saved; the saved one (live from the server) once its save is done. */
const moving = ref<Point | null>(null)
const status = ref<'idle' | 'saved' | 'failed'>('idle')
const focus = computed<Point>(() => moving.value ?? props.saved ?? { x: 0.5, y: 0.5 })
watch(focus, (point) => { live.value = point }, { immediate: true })
watch(status, (value) => { stored.value = value === 'saved' })

/** A mouse or pen is down on the photo: the saved point coming back must not end the move. */
let dragging = false
/** Where a finger went down; it sets the point only if it lifts there (a tap), not when the page scrolls. */
let touch: { x: number; y: number; point: Point } | null = null

const clamp = (n: number) => Math.min(1, Math.max(0, Math.round(n * 1000) / 1000))
function pointAt(event: PointerEvent): Point | undefined {
  const box = (event.currentTarget as HTMLElement).getBoundingClientRect()
  return box.width && box.height ? { x: clamp((event.clientX - box.left) / box.width), y: clamp((event.clientY - box.top) / box.height) } : undefined
}
function down(event: PointerEvent) {
  if (!props.editable || event.button !== 0) return
  const point = pointAt(event)
  if (!point) return
  if (event.pointerType === 'touch') {
    touch = { x: event.clientX, y: event.clientY, point }
    return
  }
  dragging = true
  ;(event.currentTarget as HTMLElement).setPointerCapture?.(event.pointerId)
  moving.value = point
}
function move(event: PointerEvent) {
  if (dragging) moving.value = pointAt(event) ?? moving.value
}
function up(event: PointerEvent) {
  if (touch) {
    const tapped = Math.hypot(event.clientX - touch.x, event.clientY - touch.y) < 10 ? touch.point : null
    touch = null
    if (tapped) {
      moving.value = tapped
      void store()
    }
    return
  }
  if (!dragging) return
  dragging = false
  void store()
}
/** The browser took over (a scroll, a system gesture): back to the saved point, nothing is stored. */
function cancel() {
  touch = null
  if (!dragging) return
  dragging = false
  moving.value = null
}

async function store() {
  const point = moving.value
  if (!point) return
  status.value = 'idle'
  try {
    // Convex answers a mutation once the queries show its result, so `saved` already holds the point here. Letting go
    // of it also follows a later change from elsewhere (Files, another admin), and a save that changed nothing.
    await props.save(point)
    status.value = 'saved'
    if (!dragging && moving.value === point) moving.value = null
  } catch {
    status.value = 'failed'
    // A newer point (a key pressed meanwhile) stays for its own save.
    if (moving.value === point) moving.value = null
  }
}

// Arrow keys move the point by 5 % (with Shift 1 %); it is saved once the keys rest.
let timer: ReturnType<typeof setTimeout> | undefined
const STEPS: Record<string, Point> = { ArrowLeft: { x: -1, y: 0 }, ArrowRight: { x: 1, y: 0 }, ArrowUp: { x: 0, y: -1 }, ArrowDown: { x: 0, y: 1 } }
function key(event: KeyboardEvent) {
  const step = STEPS[event.key]
  if (!props.editable || !step) return
  event.preventDefault()
  const size = event.shiftKey ? 0.01 : 0.05
  moving.value = { x: clamp(focus.value.x + step.x * size), y: clamp(focus.value.y + step.y * size) }
  status.value = 'idle'
  clearTimeout(timer)
  timer = setTimeout(() => { timer = undefined; void store() }, 400)
}
onBeforeUnmount(() => {
  if (timer === undefined) return
  clearTimeout(timer)
  void store()
})
const percent = (n: number) => Math.round(n * 100)
</script>

<template>
  <div class="grid gap-1.5">
    <div class="grid place-items-center rounded-lg border bg-muted/60 p-2">
      <!-- The touchable box is exactly the photo, so a click maps to the photo's own coordinates. -->
      <div
        class="relative w-fit max-w-full select-none rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring"
        :class="editable && 'cursor-crosshair touch-manipulation'"
        :tabindex="editable ? 0 : undefined"
        :role="editable ? 'group' : undefined"
        :aria-label="editable ? t('fields.image.frames.point', { x: percent(focus.x), y: percent(focus.y) }) : undefined"
        :aria-describedby="describedBy"
        data-testid="focus-area"
        @pointerdown="down" @pointermove="move" @pointerup="up" @pointercancel="cancel" @keydown="key"
      >
        <img :src="src" alt="" class="pointer-events-none block max-h-56 max-w-full rounded-md object-contain" draggable="false">
        <span
          class="pointer-events-none absolute size-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-primary shadow-[0_0_0_1px_rgb(0_0_0/0.35),0_1px_3px_rgb(0_0_0/0.4)]"
          :style="{ left: `${focus.x * 100}%`, top: `${focus.y * 100}%` }"
          data-testid="focus-point"
        />
      </div>
    </div>
    <p v-if="status === 'failed'" class="m-0 text-[13px] font-medium text-destructive" role="alert">{{ t('fields.image.frames.failed') }}</p>
    <!-- Always in the page (a live region must exist before its text changes); the caller shows it (`stored`). -->
    <p v-else class="sr-only" role="status">{{ status === 'saved' ? t('files.info.saved') : '' }}</p>
  </div>
</template>
