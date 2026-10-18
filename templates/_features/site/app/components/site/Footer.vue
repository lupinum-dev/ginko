<script setup lang="ts">
import type { Component } from 'vue'
import { safeHref } from '@lupinum/ginko'

// Identity and contact from content/site.md, the tagline, navigation, more links and profiles from app.config.ts,
// the language switch, and the legal texts from content/legal/. On paper only the name, address, email and phone stay,
// so a printed page says whose it is and how to reach them. One muted background, no border: the bottom bar's
// line divides inside it. A feature may bring `app/components/site/FooterStatus.vue` (the hours feature: open now);
// the contact column then shows it first, on every page, without a copy of this footer per template.
const status = Object.values(import.meta.glob<Component>('./FooterStatus.vue', { eager: true, import: 'default' }))[0]
const config = useSiteAppConfig()
const { name } = useGinkoSite()
const site = useGinko('site')
const legal = useGinko('legal')
const locale = useGinkoLocale()
const pages = useSiteLinks(() => [...config.nav, ...config.footer])
const { t } = useI18n('site')
const contact = computed(() => site.value.data)
const tagline = computed(() => config.tagline?.[locale.value])
const year = useGinkoToday().value.slice(0, 4)
</script>

<template>
  <footer class="mt-section bg-muted print:mt-10 print:border-t print:bg-transparent">
    <div class="mx-auto grid max-w-page gap-8 px-gutter py-14 md:grid-cols-3 md:gap-10 print:gap-2 print:py-4">
      <div class="flex flex-col gap-3">
        <p class="font-display text-body font-semibold"><bdi>{{ name }}</bdi></p>
        <p v-if="tagline" class="max-w-xs text-small text-muted-foreground print:hidden">{{ tagline }}</p>
        <ul v-if="config.socials.length" class="flex flex-wrap gap-x-5 gap-y-1 text-small print:hidden" :aria-label="t('footer.links')">
          <li v-for="social in config.socials" :key="social.url">
            <a :href="safeHref(social.url)" rel="me noopener" class="inline-flex min-h-11 min-w-11 items-center text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">{{ social.label }}</a>
          </li>
        </ul>
      </div>

      <nav v-if="pages.length" aria-labelledby="footer-pages" class="flex flex-col gap-2 print:hidden">
        <h2 id="footer-pages" class="text-small font-semibold">{{ t('footer.pages') }}</h2>
        <ul class="flex flex-col text-small">
          <li v-for="link in pages" :key="link.key">
            <SiteNavLink :to="link.to" class="inline-flex min-h-11 min-w-11 items-center text-muted-foreground underline-offset-4 hover:text-foreground hover:underline aria-[current=page]:text-foreground aria-[current=page]:underline">{{ link.label }}</SiteNavLink>
          </li>
        </ul>
      </nav>

      <div v-if="status || contact.email || contact.phone || contact.city" class="flex flex-col gap-2">
        <h2 class="text-small font-semibold print:hidden">{{ t('footer.contact') }}</h2>
        <div v-if="status" class="py-2 print:hidden">
          <component :is="status" />
        </div>
        <address v-if="contact.email || contact.phone || contact.city" class="flex flex-col text-small text-muted-foreground not-italic">
          <!-- Each line keeps the direction of its own text (bdi), so a Latin address keeps its order and its full
               stops on a right-to-left page; email and phone are always left to right. -->
          <span v-if="contact.city" class="flex flex-col py-2">
            <span v-if="contact.legalName"><bdi>{{ contact.legalName }}</bdi></span>
            <span v-if="contact.street"><bdi>{{ contact.street }}</bdi></span>
            <span><bdi>{{ contact.postalCode }} {{ contact.city }}</bdi></span>
          </span>
          <a v-if="contact.email" :href="`mailto:${contact.email}`" dir="ltr" class="inline-flex min-h-11 items-center self-start underline-offset-4 hover:text-foreground hover:underline">{{ contact.email }}</a>
          <a v-if="contact.phone" :href="telHref(contact.phone)" dir="ltr" class="inline-flex min-h-11 items-center self-start tabular-nums underline-offset-4 hover:text-foreground hover:underline">{{ contact.phone }}</a>
        </address>
      </div>
    </div>

    <div class="border-t print:hidden">
      <div class="mx-auto flex max-w-page flex-col gap-2 px-gutter py-5 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
        <p>© {{ year }} <bdi>{{ contact.legalName || name }}</bdi></p>
        <div class="flex flex-col sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-8 print:hidden">
          <SiteLanguageSwitch names />
          <nav v-if="legal.items.length" :aria-label="t('footer.legal')">
            <ul class="flex flex-wrap gap-x-5">
              <li v-for="item in legal.items" :key="item.id">
                <SiteNavLink :to="item.urls?.[locale] ?? ''" class="inline-flex min-h-11 min-w-11 items-center underline-offset-4 hover:text-foreground hover:underline aria-[current=page]:text-foreground aria-[current=page]:underline">{{ item.data.title }}</SiteNavLink>
              </li>
            </ul>
          </nav>
        </div>
      </div>
    </div>
  </footer>
</template>
