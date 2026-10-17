<script setup lang="ts">
/** A person without a photo: their initials on --muted. Never a stock face for a named person. */
const props = withDefaults(defineProps<{ name: string, size?: 'md' | 'lg' }>(), { size: 'md' })
// First and last name: "Anna Maria Huber" → "AH".
const initials = computed(() => {
  const parts = props.name.split(/\s+/).filter(Boolean)
  return [parts[0], parts.length > 1 ? parts.at(-1) : undefined].map((part) => (part ? [...part][0] : '')).join('').toLocaleUpperCase()
})
</script>

<template>
  <span
    class="inline-flex shrink-0 items-center justify-center rounded-full bg-muted font-medium text-foreground"
    :class="size === 'lg' ? 'size-20 text-h3' : 'size-12 text-body'"
    aria-hidden="true"
  >{{ initials }}</span>
</template>
