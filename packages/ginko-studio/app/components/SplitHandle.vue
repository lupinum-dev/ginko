<!-- The divider between the form and the preview: drag it, or focus it and use the arrow keys (Shift for bigger steps,
     Home and End for the limits). A double click goes back to the standard width. The value is the width of the
     column before the handle, in pixels; the parent clamps and remembers it. -->
<script setup lang="ts">
const props = defineProps<{ value: number; min: number; max: number; label: string }>()
const emit = defineEmits<{ change: [width: number]; reset: [] }>()

const dragging = ref(false)
let startX = 0
let startValue = 0

function down(event: PointerEvent) {
  if (event.button !== 0) return
  // Pointer capture keeps the moves coming while the pointer is over the preview's iframe.
  ;(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId)
  dragging.value = true
  startX = event.clientX
  startValue = props.value
  event.preventDefault()
}
function move(event: PointerEvent) {
  if (dragging.value) emit('change', startValue + event.clientX - startX)
}
function up() { dragging.value = false }

function key(event: KeyboardEvent) {
  const step = event.shiftKey ? 80 : 16
  const next = { ArrowLeft: props.value - step, ArrowRight: props.value + step, Home: props.min, End: props.max }[event.key]
  if (next === undefined) return
  event.preventDefault()
  emit('change', next)
}
</script>

<template>
  <div
    role="separator" tabindex="0" aria-orientation="vertical" :aria-label="label"
    :aria-valuenow="Math.round(value)" :aria-valuemin="Math.round(min)" :aria-valuemax="Math.round(max)"
    :class="['split-handle group relative z-10 w-2 cursor-col-resize touch-none outline-none select-none', dragging && 'is-dragging']"
    @pointerdown="down" @pointermove="move" @pointerup="up" @pointercancel="up" @lostpointercapture="up"
    @keydown="key" @dblclick="emit('reset')"
  >
    <span
      aria-hidden="true"
      class="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-border transition-[width,background-color] group-hover:w-0.5 group-hover:bg-primary/60 group-focus-visible:w-0.5 group-focus-visible:bg-ring group-[.is-dragging]:w-0.5 group-[.is-dragging]:bg-primary"
    />
  </div>
</template>
