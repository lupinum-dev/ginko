<script setup lang="ts">
import { formatMoney } from '@lupinum/ginko'
import { dishOn, priceOn, timesOf, weekdayNames, type Weekday } from '@lupinum/ginko-preset-gastro'

const hours = useGinko('hours')
const menu = useGinko('menu')
const today = useGinkoToday()
const { language } = useI18n()
// A dish turned off with "onMenu" is left out; one sold out today stays, marked (dishOn).
const dishes = computed(() => menu.value.items.map((i) => ({ ...i, ...dishOn(i.data, today.value) })).filter((i) => i.shown))
const categories = [['starters', 'Vorspeisen'], ['soups', 'Suppen'], ['mains', 'Hauptspeisen'], ['desserts', 'Nachspeisen'], ['drinks', 'Getränke']] as const
useGinkoSeo({ title: 'Speisekarte und Öffnungszeiten' })
</script>

<template>
  <main>
    <h1>Öffnungszeiten</h1>
    <table>
      <tbody>
        <tr v-for="d in hours.data.week" :key="d.day">
          <th scope="row">{{ weekdayNames.de[d.day as Weekday] }}</th>
          <td>{{ d.closed ? 'Ruhetag' : timesOf(d, 'und') }}</td>
        </tr>
      </tbody>
    </table>
    <h1>Speisekarte</h1>
    <section v-for="[key, title] in categories.filter(([k]) => dishes.some((i) => i.data.category === k))" :key="key">
      <h2>{{ title }}</h2>
      <ul>
        <li v-for="dish in dishes.filter((i) => i.data.category === key)" :key="dish.id">
          <strong>{{ dish.data.name }}</strong><template v-if="dish.soldOut"> (heute aus)</template>, {{ formatMoney(priceOn(dish.data, today), language) }}
          <br>{{ dish.data.description }}
        </li>
      </ul>
    </section>
  </main>
</template>
