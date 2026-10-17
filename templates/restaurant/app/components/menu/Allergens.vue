<!-- Synced from templates/_features/menu/app/components/menu/Allergens.vue by `pnpm templates sync`. Edit the source, not this copy. -->
<script setup lang="ts">
/**
 * The allergen codes of a dish as the menu stores them. Each code is shown, its name is read out and shown on hover;
 * the page also shows the key (MenuAllergenKey). A code the menu texts do not name shows as it is written. "No
 * allergens" only when the stored list is empty.
 */
const props = defineProps<{ codes: readonly string[] }>()
const { t } = useI18n('menu')
const nameOf = useAllergenName()
const codes = computed(() => allergenList(props.codes))
</script>

<template>
  <span v-if="codes.length" class="inline-flex flex-wrap gap-1">
    <abbr
      v-for="code in codes"
      :key="code"
      :title="nameOf(code)"
      class="inline-grid h-6 min-w-6 place-items-center rounded-sm border px-1 text-xs font-medium text-muted-foreground no-underline"
    ><span aria-hidden="true">{{ code }}</span><span class="sr-only">{{ nameOf(code) }}</span></abbr>
  </span>
  <span v-else class="text-small text-muted-foreground">{{ t(allergenState(props.codes) === 'none' ? 'allergens.none' : 'allergens.unknown') }}</span>
</template>
