<script setup lang="ts">
const { t, format, locale, localePath } = useI18n()
const { t: libT } = useI18n('fakeLib')
// @ts-expect-error not in the default locale: the fixture renders a missing key on purpose
const missing = computed(() => t('does.not.exist'))
const count = ref(0)
</script>

<template>
  <div>
    <h1 data-test="title">
      {{ t('home.title') }}
    </h1>
    <p data-test="cart">
      {{ t('home.cart', { count }) }}
    </p>
    <button
      data-test="add"
      @click="count++"
    >
      {{ t('home.add') }}
    </button>
    <p data-test="consent">
      <I18nT k="home.consent">
        <template #link="{ text }">
          <NuxtLink :to="localePath('/about')">{{ text }}</NuxtLink>
        </template><template #b="{ text }">
          <strong>{{ text }}</strong>
        </template>
      </I18nT>
    </p>
    <p data-test="cta">
      {{ t('home.cta') }}
    </p>
    <p data-test="place">
      {{ t('home.place', { n: 3 }) }}
    </p>
    <p data-test="date">
      {{ t('home.date', { date: format.date('2026-01-15') }) }}
    </p>
    <p data-test="money">
      {{ format.currency(1234.5, 'EUR') }}
    </p>
    <p data-test="fallback">
      {{ t('onlyInDefault') }}
    </p>
    <p data-test="missing">
      {{ missing }}
    </p>
    <p data-test="lib">
      {{ libT('save') }} / {{ libT('saved', { time: '12:00' }) }}
    </p>
    <p data-test="locale">
      {{ locale }}
    </p>
  </div>
</template>
