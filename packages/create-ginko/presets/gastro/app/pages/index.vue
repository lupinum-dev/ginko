<script setup lang="ts">
import { formatMoney } from '@lupinum/ginko'
import { priceOn, timesOf, weekdayNames, type Weekday } from '@lupinum/ginko-preset-gastro'

const hours = useGinko('hours')
const menu = useGinko('menu')
const today = useGinkoToday()
const { language } = useI18n()
const categories = [['starters', 'Starters'], ['soups', 'Soups'], ['mains', 'Mains'], ['desserts', 'Desserts'], ['drinks', 'Drinks']] as const
useGinkoSeo({ title: 'Menu and opening hours' })
</script>

<template>
  <main>
    <h1>Opening hours</h1>
    <table>
      <tbody>
        <tr v-for="d in hours.data.week" :key="d.day">
          <th scope="row">{{ weekdayNames.en[d.day as Weekday] }}</th>
          <td>{{ d.closed ? 'Closed' : timesOf(d, 'and') }}</td>
        </tr>
      </tbody>
    </table>
    <h1>Menu</h1>
    <section v-for="[key, title] in categories.filter(([k]) => menu.items.some((i) => i.data.category === k))" :key="key">
      <h2>{{ title }}</h2>
      <ul>
        <li v-for="dish in menu.items.filter((i) => i.data.category === key)" :key="dish.id">
          <strong>{{ dish.data.name }}</strong>, {{ formatMoney(priceOn(dish.data, today), language) }}
          <br>{{ dish.data.description }}
        </li>
      </ul>
    </section>
  </main>
</template>
