<script setup lang="ts">
// The help center's start page (/help): the docs frame of @lupinum/ginko-docs (navigation, search, the phone bar) with
// every help page as a card. A new file in content/docs/ shows up here and in the navigation by itself.
const { t } = useI18n()
const docs = useGinko('docs')
const cards = computed(() => docs.value.items.map((item) => ({ key: item.id, title: item.data.title, text: item.data.description ?? undefined, to: item.url })))
usePageSeo(() => ({ title: t('help.title'), description: t('help.lead') }))
</script>

<template>
  <DocsShell>
    <div class="flex flex-col gap-10">
      <header class="flex max-w-3xl flex-col gap-4">
        <h1 class="text-h1">{{ t('help.title') }}</h1>
        <p class="text-lead text-muted-foreground">{{ t('help.lead') }}</p>
      </header>
      <BlockCards :items="cards" :columns="3" heading-level="h2" />
      <HelpContact />
    </div>
  </DocsShell>
</template>
