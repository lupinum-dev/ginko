<script setup lang="ts">
import type { ImageValue } from '@lupinum/ginko'

/**
 * Photos and one lightbox for all of them. On phones one column at full width, each photo cropped to 3:2, so no photo
 * stands narrower than the page. Up to three photos: from `sm` one row of equal 3:2 tiles. More: from `sm` justified
 * rows, each row fills the width and every photo keeps its ratio, so nothing jumps while loading; an empty last item
 * takes the rest of a short last row, so its photos keep about the row height instead of growing past the rows above.
 * Each photo is a button that opens the lightbox at that photo.
 */
const props = defineProps<{ images: ImageValue[] }>()
const { t } = useI18n('gallery')
const list = useTemplateRef<HTMLUListElement>('list')
const open = ref(false)
const index = ref(0)
const ratio = (image: ImageValue) => (image.width && image.height ? image.width / image.height : 1.5)
const few = computed(() => props.images.length <= 3)
// Whole class names, so Tailwind finds them in the source.
const columns = ['', 'sm:grid-cols-1', 'sm:grid-cols-2', 'sm:grid-cols-3'] as const
const sizes = computed(() => (few.value
  ? `(min-width: 1216px) ${Math.round(1152 / props.images.length)}px, (min-width: 640px) ${Math.round(100 / props.images.length)}vw, calc(100vw - 2rem)`
  : '(min-width: 768px) 40vw, (min-width: 640px) 50vw, calc(100vw - 2rem)'))
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
    <ul ref="list" :class="few ? ['grid gap-2 break-inside-avoid md:gap-3', columns[props.images.length]] : 'flex flex-col gap-2 sm:flex-row sm:flex-wrap md:gap-3'">
      <li
        v-for="(image, i) in props.images"
        :key="image.url"
        class="break-inside-avoid"
        :class="!few && 'sm:max-w-(--max) sm:grow-(--grow) sm:basis-(--basis) md:max-w-(--max-md) md:basis-(--basis-md)'"
        :style="few ? undefined : {
          '--grow': ratio(image),
          '--ratio': String(ratio(image)),
          '--basis': `${ratio(image) * 160}px`,
          '--max': `${ratio(image) * 260}px`,
          '--basis-md': `${ratio(image) * 260}px`,
          '--max-md': `${ratio(image) * 420}px`,
        }"
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
            class="aspect-3/2 w-full object-cover"
            :class="!few && 'sm:aspect-(--ratio)'"
          />
        </button>
      </li>
      <li v-if="!few" class="max-sm:hidden sm:grow-[100]" aria-hidden="true" />
    </ul>
    <SiteLightbox v-model:open="open" v-model:index="index" :images="props.images" :focus-photo="focusPhoto" />
  </div>
</template>
