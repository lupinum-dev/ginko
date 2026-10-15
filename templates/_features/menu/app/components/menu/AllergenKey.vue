<script setup lang="ts">
/** The key to the allergen codes used on the page: code and name, the EU letters in alphabetical order. A code the
 *  menu texts do not name stands alone. */
const props = defineProps<{ codes: readonly string[] }>()
const nameOf = useAllergenName()
const codes = computed(() => allergenList(props.codes))
</script>

<template>
  <dl v-if="codes.length" class="grid grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-3 print:grid-cols-4">
    <div v-for="code in codes" :key="code" class="flex items-baseline gap-3">
      <dt class="min-w-4 font-semibold tabular-nums">{{ code }}</dt>
      <dd v-if="nameOf(code) !== code" class="text-muted-foreground">{{ nameOf(code) }}</dd>
    </div>
  </dl>
</template>
