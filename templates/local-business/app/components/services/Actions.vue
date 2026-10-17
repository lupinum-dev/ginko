<script setup lang="ts">
// A treatment page's actions (the services feature shows this file in place of its own email-first row): who gives
// the treatment (the entry's `contact`, a person of content/people/), then booking as on the home and contact pages,
// with the treatment in the email's subject.
defineProps<{ subject: string, email?: string, phone?: string, contact?: string }>()
const { t } = useI18n()
const path = useGinkoPath()
</script>

<template>
  <div class="flex flex-col gap-5">
    <p v-if="contact" class="text-muted-foreground">
      {{ t('visit.treatedBy') }}
      <NuxtLink :to="path('team')" class="inline-flex min-h-11 items-center font-medium text-foreground underline underline-offset-4 hover:text-primary">{{ contact }}</NuxtLink>
    </p>
    <VisitBook :subject="subject" :email="email" :phone="phone" />
  </div>
</template>
