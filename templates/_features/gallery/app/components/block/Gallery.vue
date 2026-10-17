<script setup lang="ts">
import type { ImageValue } from '@lupinum/ginko'

/**
 * Photos and one lightbox for all of them. On phones one column at full width, each photo cropped to 3:2, so no photo
 * stands narrower than the page. Up to three photos: from `sm` one row of equal 3:2 tiles. More: from `sm` justified
 * rows, each row fills the width and every photo keeps its ratio, so nothing jumps while loading; an empty last item
 * takes the rest of a short last row, so its photos keep about the row height instead of growing past the rows above.
 * Each photo is a button that opens the lightbox at that photo.
 * `stack`: one photo below the other at full width, each in its own ratio, the first loaded at once (the main photos of
 * a page, such as the photos of one project). `captions`: each photo's description below it; screen readers hear it once,
 * as the name of the photo's button.
 */
const props = defineProps<{ images: ImageValue[], stack?: boolean, captions?: boolean }>()
const { t } = useI18n('gallery')
const list = useTemplateRef<HTMLUListElement>('list')
const open = ref(false)
const index = ref(0)
const ratio = (image: ImageValue) => (image.width && image.height ? image.width / image.height : 1.5)
const few = computed(() => !props.stack && props.images.length <= 3)
const rows = computed(() => !props.stack && !few.value)
// Whole class names, so Tailwind finds them in the source.
const columns = ['', 'sm:grid-cols-1', 'sm:grid-cols-2', 'sm:grid-cols-3'] as const
const sizes = computed(() => {
  if (props.stack) return '(min-width: 1216px) 1152px, calc(100vw - 2rem)'
  return few.value
    ? `(min-width: 1216px) ${Math.round(1152 / props.images.length)}px, (min-width: 640px) ${Math.round(100 / props.images.length)}vw, calc(100vw - 2rem)`
    : '(min-width: 768px) 40vw, (min-width: 640px) 50vw, calc(100vw - 2rem)'
})
function show(i: number) {
  index.value = i
  open.value = true
}
/** After the lightbox closes: the photo shown last, in this gallery (a page may hold more than one). */
function focusPhoto(i: number) {
  list.value?.querySelectorAll<HTMLElement>(':scope > li > button')[i]?.focus()
}
</script>

<template>
  <div>
    <ul
      ref="list"
      :class="stack ? 'flex flex-col gap-8 md:gap-12' : few ? ['grid gap-2 break-inside-avoid md:gap-3', columns[props.images.length]] : 'flex flex-col gap-2 sm:flex-row sm:flex-wrap md:gap-3'"
    >
      <li
        v-for="(image, i) in props.images"
        :key="`${i}-${image.url}`"
        class="break-inside-avoid"
        :class="rows && 'sm:max-w-(--max) sm:grow-(--grow) sm:basis-(--basis) md:max-w-(--max-md) md:basis-(--basis-md)'"
        :style="rows ? {
          '--grow': ratio(image),
          '--ratio': String(ratio(image)),
          '--basis': `${ratio(image) * 160}px`,
          '--max': `${ratio(image) * 260}px`,
          '--basis-md': `${ratio(image) * 260}px`,
          '--max-md': `${ratio(image) * 420}px`,
        } : undefined"
      >
        <button
          type="button"
          aria-haspopup="dialog"
          :aria-label="t('open', { n: i + 1, count: props.images.length, alt: image.alt ?? '' })"
          class="block w-full overflow-hidden rounded-block bg-muted"
          @click="show(i)"
        >
          <GinkoImage
            :image="image"
            :sizes="sizes"
            :eager="stack && i === 0"
            class="w-full"
            :class="!stack && ['aspect-3/2 object-cover', rows && 'sm:aspect-(--ratio)']"
          />
        </button>
        <p v-if="captions && image.alt" class="pt-3 text-small text-muted-foreground" aria-hidden="true">{{ image.alt }}</p>
      </li>
      <li v-if="rows" class="max-sm:hidden sm:grow-[100]" aria-hidden="true" />
    </ul>
    <SiteLightbox v-model:open="open" v-model:index="index" :images="props.images" :focus-photo="focusPhoto" />
  </div>
</template>
