<script setup lang="ts">
import { formatMoney } from '@lupinum/ginko'
import { priceOn } from '@lupinum/ginko-preset-gastro'

const hours = useGinko('hours')
const menu = useGinko('menu')
const today = useGinkoToday()
const days = { mo: 'Monday', tu: 'Tuesday', we: 'Wednesday', th: 'Thursday', fr: 'Friday', sa: 'Saturday', su: 'Sunday' } as Record<string, string>
const times = (d: { from1?: string; to1?: string; from2?: string; to2?: string }) =>
  [[d.from1, d.to1], [d.from2, d.to2]].filter(([from, to]) => from && to).map(([from, to]) => `${from} to ${to}`).join(' and ')
const categories = [['starters', 'Starters'], ['soups', 'Soups'], ['mains', 'Mains'], ['desserts', 'Desserts'], ['drinks', 'Drinks']] as const
useGinkoSeo({ title: 'Menu and opening hours' })
</script>

<template>
  <main>
    <h1>Opening hours</h1>
    <table>
      <tbody>
        <tr v-for="d in hours.data.week" :key="d.day">
          <th scope="row">{{ days[d.day] }}</th>
          <td>{{ d.closed ? 'Closed' : times(d) }}</td>
        </tr>
      </tbody>
    </table>
    <h1>Menu</h1>
    <section v-for="[key, title] in categories.filter(([k]) => menu.items.some((i) => i.data.category === k))" :key="key">
      <h2>{{ title }}</h2>
      <ul>
        <li v-for="dish in menu.items.filter((i) => i.data.category === key)" :key="dish.id">
          <strong>{{ dish.data.name }}</strong>, {{ formatMoney(priceOn(dish.data, today), 'en') }}
          <br>{{ dish.data.description }}
        </li>
      </ul>
    </section>
  </main>
</template>
