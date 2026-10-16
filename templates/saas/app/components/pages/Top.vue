<script setup lang="ts">
// Shown by the pages feature at the top of a page of content/pages/ (below its title): the contact details of
// content/site.md on the Contact page, so the address is written once; on the About page the people of
// content/people/ (initials, never a stock face; name, role and one sentence), so a visitor sees who builds the
// product and answers support. Other pages get nothing.
defineProps<{ id: string }>()
const people = useGinko('people')
const { t } = useI18n()
</script>

<template>
  <div v-if="id === 'pages/contact'" class="mx-auto max-w-page px-gutter pb-10">
    <SiteContact />
  </div>
  <div v-else-if="id === 'pages/about' && people.items.length" class="mx-auto max-w-page px-gutter pb-10">
    <section aria-labelledby="about-team" class="flex flex-col gap-6 border-y py-8 break-inside-avoid">
      <h2 id="about-team" class="text-h3">{{ t('about.team') }}</h2>
      <ul class="grid gap-x-10 gap-y-8 sm:grid-cols-2 lg:grid-cols-3">
        <li v-for="person in people.items" :key="person.id" class="flex gap-4">
          <InitialsAvatar :name="person.data.name" />
          <div class="flex flex-col gap-1">
            <h3 class="font-semibold">{{ person.data.name }}</h3>
            <p v-if="person.data.role" class="text-small text-muted-foreground">{{ person.data.role }}</p>
            <p v-if="person.data.bio" class="text-small">{{ person.data.bio }}</p>
          </div>
        </li>
      </ul>
    </section>
  </div>
</template>
