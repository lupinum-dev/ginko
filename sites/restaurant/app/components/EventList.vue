<!-- Upcoming events as a dated list. `limit` shortens it on the home page. -->
<script setup lang="ts">
import { formatMoney } from '@lupinum/ginko'

const langOf = useGinkoLang()

const props = defineProps<{ limit?: number }>()
const { lang } = useSite()
const { t, language } = useI18n()
const eventWhen = useEventWhen()
const events = useGinko('events')
const items = computed(() => (props.limit ? events.value.items.slice(0, props.limit) : events.value.items))
const day = (date: string) => new Intl.DateTimeFormat(lang.value === 'de' ? 'de-AT' : 'en-GB', { timeZone: 'UTC', day: 'numeric' }).format(new Date(`${date}T12:00:00Z`))
const month = (date: string) => new Intl.DateTimeFormat(lang.value === 'de' ? 'de-AT' : 'en-GB', { timeZone: 'UTC', month: 'short' }).format(new Date(`${date}T12:00:00Z`)).replace('.', '')
</script>

<template>
  <ol v-if="items.length" class="events">
    <li v-for="e in items" :key="e.id" class="event">
      <p class="date" aria-hidden="true"><span class="d">{{ day(e.data.when.from) }}</span><span class="m">{{ month(e.data.when.from) }}</span></p>
      <div class="body">
        <h3 :lang="langOf(e, 'title')"><NuxtLink :to="e.url">{{ e.data.title }}</NuxtLink></h3>
        <p class="meta">
          <span>{{ eventWhen(e.data.when, e.data.start) }}</span>
          <span v-if="e.data.price" class="price">{{ formatMoney(e.data.price, language) }}</span>
          <span v-if="e.data.soldOut" class="booked" data-test="fully-booked">{{ t('fullyBooked') }}</span>
        </p>
      </div>
    </li>
  </ol>
  <p v-else class="lede">{{ t('noEvents') }}</p>
</template>

<style scoped>
.events { list-style: none; margin: 0; padding: 0; display: grid; border-top: 1px solid var(--rule); }
.event { display: grid; grid-template-columns: 4rem 1fr; gap: 16px; padding: 18px 0; border-bottom: 1px solid var(--rule); position: relative; }
.date { display: grid; justify-items: center; align-content: start; line-height: 1; padding-top: 2px; }
.d { font-family: var(--serif); font-weight: 700; font-size: 2.25rem; color: var(--linde-ink); }
.m { font-size: 0.9rem; font-weight: 700; color: var(--ink-2); margin-top: 4px; }
h3 { font-size: 1.4rem; }
h3 a { color: var(--ink); text-decoration: none; }
h3 a::after { content: ''; position: absolute; inset: 0; }
.event:hover h3 a { text-decoration: underline; text-decoration-thickness: 2px; }
.meta { display: flex; flex-wrap: wrap; gap: 4px 20px; margin-top: 6px; color: var(--ink-2); }
.booked { font-weight: 700; color: var(--ink); }
</style>
