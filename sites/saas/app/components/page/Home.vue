<script setup lang="ts">
import { priceText } from '../../utils/site'

const { lang, labels } = useSite()
const path = usePagePath()
const { t } = useI18n()
usePageSeo('home')
const hero = useGinko('hero')
const features = useGinko('features')
const pricing = useGinko('pricing')
const testimonials = useGinko('testimonials')
const cta = computed(() => ginkoSafeHref(hero.value.data.buttonUrl))
const quotes = computed(() => testimonials.value.items.slice(0, 3))
</script>

<template>
  <div>
    <section class="wrap hero" aria-labelledby="hero-title">
      <div class="intro">
        <h1 id="hero-title" :lang="ginkoLangOf(hero, 'headline')">{{ hero.data.headline }}</h1>
        <p class="text" :lang="ginkoLangOf(hero, 'text')">{{ hero.data.text }}</p>
        <div class="actions">
          <a v-if="cta" class="button" :href="cta" rel="noopener" :lang="ginkoLangOf(hero, 'buttonText')">{{ hero.data.buttonText }}</a>
          <NuxtLink class="button secondary" :to="path('pricing')">{{ t('seePricing') }}</NuxtLink>
        </div>
      </div>
      <Stempeluhr class="clock" />
    </section>

    <section id="funktionen" class="wrap section" aria-labelledby="features-title">
      <div class="section-head">
        <h2 id="features-title" :lang="ginkoLangOf(features, 'headline')">{{ features.data.headline || labels.nav.features }}</h2>
      </div>
      <ul class="features" :class="{ four: features.data.items.length % 4 === 0 }">
        <li v-for="item in features.data.items" :key="item._id" class="feature">
          <h3 :lang="ginkoLangOf(features, `items.${item._id}.title`)">{{ item.title }}</h3>
          <p :lang="ginkoLangOf(features, `items.${item._id}.text`)">{{ item.text }}</p>
        </li>
      </ul>
    </section>

    <section v-if="pricing.items.length" class="wrap section" aria-labelledby="pricing-title">
      <div class="section-head">
        <h2 id="pricing-title">{{ labels.nav.pricing }}</h2>
        <NuxtLink :to="path('pricing')">{{ t('allPrices') }}</NuxtLink>
      </div>
      <ul class="plans">
        <li v-for="plan in pricing.items" :key="plan.id" class="plan">
          <span class="plan-name">{{ plan.data.name }}</span>
          <span class="plan-price mono">{{ priceText(plan.data.priceEur, lang) }}</span>
          <span class="plan-period">{{ t('perMonth') }}</span>
        </li>
      </ul>
    </section>

    <section v-if="quotes.length" class="wrap section" aria-labelledby="voices-title">
      <div class="section-head"><h2 id="voices-title">{{ t('testimonials') }}</h2></div>
      <ul class="quotes">
        <li v-for="item in quotes" :key="item.id">
          <figure class="quote">
            <blockquote :lang="ginkoLangOf(item, 'quote')">{{ item.data.quote }}</blockquote>
            <figcaption>
              <img v-if="ginkoSafeHref(item.data.logo?.url)" class="logo" :src="ginkoSafeHref(item.data.logo?.url)" :alt="item.data.logo!.alt" :lang="ginkoLangOf(item, 'logo.alt')" :width="item.data.logo!.width" :height="item.data.logo!.height" loading="lazy">
              <span class="name">{{ item.data.name }}</span>
              <span class="company">{{ item.data.company }}</span>
            </figcaption>
          </figure>
        </li>
      </ul>
    </section>

    <section class="wrap section" aria-labelledby="changelog-title">
      <div class="section-head">
        <h2 id="changelog-title">{{ labels.nav.changelog }}</h2>
        <NuxtLink :to="path('changelog')">{{ t('allEntries') }}</NuxtLink>
      </div>
      <ChangelogList :limit="3" level="h3" />
    </section>

    <section class="wrap section" aria-labelledby="faq-title">
      <div class="section-head">
        <h2 id="faq-title">{{ labels.pages.faq.title }}</h2>
        <NuxtLink :to="path('faq')">{{ t('allQuestions') }}</NuxtLink>
      </div>
      <FaqList :limit="4" />
    </section>
  </div>
</template>

<style scoped>
.hero { display: grid; gap: 40px; padding-block: 40px 0; align-items: center; }
.intro { display: grid; gap: 20px; justify-items: start; }
h1 { font-size: clamp(2.1rem, 1.4rem + 2.7vw, 4.2rem); }
.text { font-size: 1.15rem; color: var(--ink-2); max-width: 46ch; }
.actions { display: flex; flex-wrap: wrap; gap: 12px; margin-top: 4px; }
.clock { width: 100%; max-width: 520px; }

.features { list-style: none; margin: 0; padding: 0; display: grid; gap: 16px; }
.feature { background: var(--surface); border: var(--line) solid var(--ink); border-radius: var(--radius); padding: 24px; display: grid; gap: 8px; align-content: start; }
.feature h3 { font-weight: 700; font-stretch: 100%; font-variation-settings: normal; font-size: 1.2rem; line-height: 1.25; letter-spacing: 0; }
.feature p { color: var(--ink-2); }

.plans { list-style: none; margin: 0; padding: 0; display: grid; gap: 12px; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); }
.plan { background: var(--surface); border: var(--line) solid var(--rule); border-radius: var(--radius); padding: 18px 20px; display: grid; gap: 2px; }
.plan-name { font-family: var(--head); font-weight: 700; font-size: 1.1rem; }
.plan-price { font-size: 1.5rem; font-weight: 700; }
.plan-period { color: var(--ink-2); font-size: 0.9rem; }

.quotes { list-style: none; margin: 0; padding: 0; display: grid; gap: 16px; }
.quote { margin: 0; height: 100%; display: flex; flex-direction: column; gap: 20px; justify-content: space-between; background: var(--surface); border: var(--line) solid var(--ink); border-radius: var(--radius); padding: 24px; }
blockquote { margin: 0; font-size: 1.08rem; }
figcaption { display: grid; gap: 2px; justify-items: start; }
.logo { height: 28px; width: auto; max-width: 140px; object-fit: contain; margin-bottom: 8px; }
.name { font-weight: 700; }
.company { color: var(--ink-2); font-size: 0.93rem; }

@media (min-width: 720px) {
  .features { grid-template-columns: repeat(2, 1fr); }
  .quotes { grid-template-columns: repeat(3, 1fr); }
}
@media (min-width: 960px) {
  h1 { hyphens: manual; }
  .hero { grid-template-columns: 1.55fr 1fr; gap: 48px; padding-block: 64px 0; }
  .clock { justify-self: end; }
  .features { grid-template-columns: repeat(3, 1fr); }
  /* Four or eight features fill whole rows of four instead of leaving one card alone. */
  .features.four { grid-template-columns: repeat(4, 1fr); }
}
</style>
