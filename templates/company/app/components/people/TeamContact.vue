<script setup lang="ts">
// Above the people on the contact page (the people feature shows this file when a template has it): the service line
// for a pump that has stopped, with its hours, and the office with the address, main phone and email from
// content/site.md. So the page is complete on its own, also on paper, where the footer is short.
const line = useServiceLine()
const site = useGinko('site')
const { name } = useGinkoSite()
const { t } = useI18n()
const office = computed(() => site.value.data)
const link = 'inline-flex min-h-11 items-center text-primary underline underline-offset-4'
</script>

<template>
  <div class="grid gap-x-10 gap-y-10 border-y py-8 break-inside-avoid sm:grid-cols-2 lg:grid-cols-3">
    <section v-if="line" aria-labelledby="contact-service" class="flex flex-col gap-2">
      <h2 id="contact-service" class="text-h3">{{ t('serviceLine.title') }}</h2>
      <p class="text-muted-foreground">{{ t('serviceLine.text') }}</p>
      <p class="font-medium tabular-nums"><template v-for="(group, index) in line.hourGroups" :key="group"><span class="whitespace-nowrap">{{ group }}{{ index < line.hourGroups.length - 1 ? ',' : '' }}</span>{{ ' ' }}</template></p>
      <ul class="flex flex-col text-small">
        <li><a :href="telHref(line.phone)" dir="ltr" :class="[link, 'tabular-nums']">{{ line.phone }}</a></li>
        <li v-if="line.email"><a :href="`mailto:${line.email}`" dir="ltr" :class="link">{{ line.email }}</a></li>
      </ul>
    </section>
    <section aria-labelledby="contact-office" class="flex flex-col gap-2">
      <h2 id="contact-office" class="text-h3">{{ t('serviceLine.office') }}</h2>
      <address class="flex flex-col text-muted-foreground not-italic">
        <span><bdi>{{ office.legalName || name }}</bdi></span>
        <span v-if="office.street"><bdi>{{ office.street }}</bdi></span>
        <span v-if="office.city"><bdi>{{ office.postalCode }} {{ office.city }}</bdi></span>
      </address>
      <ul v-if="office.phone || office.email" class="flex flex-col text-small">
        <li v-if="office.phone"><a :href="telHref(office.phone)" dir="ltr" :class="[link, 'tabular-nums']">{{ office.phone }}</a></li>
        <li v-if="office.email"><a :href="`mailto:${office.email}`" dir="ltr" :class="link">{{ office.email }}</a></li>
      </ul>
    </section>
  </div>
</template>
