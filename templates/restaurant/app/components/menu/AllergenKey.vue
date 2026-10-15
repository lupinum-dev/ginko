<!-- Synced from templates/_features/menu/app/components/menu/AllergenKey.vue by `pnpm templates sync`. Edit the source, not this copy. -->
<script setup lang="ts">
/** The key to the allergen letters used on the page: letter and name, in alphabetical order. */
const props = defineProps<{ codes: readonly string[] }>()
const { t } = useI18n('menu')
const codes = computed(() => allergenList(props.codes))
</script>

<template>
  <dl v-if="codes.length" class="grid grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-3 print:grid-cols-4">
    <div v-for="code in codes" :key="code" class="flex items-baseline gap-3">
      <dt class="min-w-4 font-semibold tabular-nums">{{ code }}</dt>
      <dd class="text-muted-foreground">{{ t(`allergens.${code}`) }}</dd>
    </div>
  </dl>
</template>
