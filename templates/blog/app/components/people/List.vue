<!-- Synced from templates/_features/people/app/components/people/List.vue by `pnpm templates sync`. Edit the source, not this copy. -->
<script setup lang="ts">
/** People as a grid: photo (4:5) or initials, name (a link to the person's page when people have pages), role, short
 *  bio and contact. Never a stock face for a named person: without a photo the initials stand in, on phones small and
 *  beside the name, so the bios stay close. */
defineProps<{ items: GinkoItem<'people'>[] }>()
const { t } = useI18n('people')
const locale = useGinkoLocale()
</script>

<template>
  <ul class="grid gap-x-10 gap-y-12 sm:grid-cols-2 lg:grid-cols-3">
    <li v-for="person in items" :id="person.id.split('/').pop()" :key="person.id" class="flex flex-col gap-4 break-inside-avoid">
      <GinkoImage
        v-if="person.data.photo"
        :image="person.data.photo"
        sizes="(min-width: 1024px) 384px, (min-width: 640px) 50vw, 100vw"
        class="aspect-4/5 w-full rounded-block bg-muted object-cover"
      />
      <div class="flex flex-col gap-4" :class="!person.data.photo && 'max-sm:flex-row max-sm:items-center'">
        <InitialsAvatar v-if="!person.data.photo" :name="person.data.name" size="lg" class="max-sm:size-12 max-sm:text-body" />
        <div class="flex min-w-0 flex-col gap-1">
          <h2 class="text-h3">
            <NuxtLink v-if="person.urls?.[locale]" :to="person.urls[locale]" class="underline-offset-4 hover:underline">{{ person.data.name }}</NuxtLink>
            <template v-else>{{ person.data.name }}</template>
          </h2>
          <p v-if="person.data.role" class="text-muted-foreground">{{ person.data.role }}</p>
        </div>
      </div>
      <p v-if="person.data.bio">{{ person.data.bio }}</p>
      <ul v-if="person.data.email || person.data.phone" class="flex flex-col text-small" :aria-label="t('contact', { name: person.data.name })">
        <li v-if="person.data.email">
          <a :href="`mailto:${person.data.email}`" dir="ltr" class="inline-flex min-h-11 items-center text-primary underline underline-offset-4">{{ person.data.email }}</a>
        </li>
        <li v-if="person.data.phone">
          <a :href="telHref(person.data.phone)" dir="ltr" class="inline-flex min-h-11 items-center tabular-nums text-primary underline underline-offset-4">{{ person.data.phone }}</a>
        </li>
      </ul>
    </li>
  </ul>
</template>
