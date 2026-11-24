// POC T2: Gasthaus zur Linde written in v2, beside ginko.config.ts. Both must produce the same stored model
// (packages/ginko/test/v2/on-v1.test.ts). The lunch menu and this house's own bricks are v2 objects (bricks.v2.ts);
// the other bricks still come from the v1 functions of the gastro preset (POC T3 makes them plain objects).
import { defineSite } from '@lupinum/ginko/v2'
import { events, gallery, hourPlans, hours, lunchPlans, menu, notices } from '@lupinum/ginko-preset-gastro'
import { contact, legal, lunch, seo } from './bricks.v2.ts'
import en from './i18n/studio/en.json' with { type: 'json' }

export default defineSite({
  name: 'Gasthaus zur Linde',
  url: 'https://ginko-demo-restaurant.vercel.app',
  timeZone: 'Europe/Vienna',
  locales: ['de', 'en'],
  languages: { de: 'de-AT', en: 'en-GB' },
  currency: 'EUR',
  // Austrian public holidays for the opening hours.
  country: 'AT',

  bricks: {
    // Today lists bricks in this order, so each plan sits right after the brick it plans.
    hours: hours({ plans: 'hourPlans' }),
    hourPlans: hourPlans(),
    notices: notices(),
    lunch,
    lunchPlans: lunchPlans(),
    menu: menu(),
    // The preset's v1 function wants the address as an option; with a plain object (T3) it moves to `entries`.
    events: events({ route: { de: '/veranstaltungen/[slug]', en: '/en/events/[slug]' } }),
    gallery: gallery(),
    contact,
    legal,
    seo,
  },

  pages: {
    home: '/',
    menu: { de: '/speisekarte', en: '/menu' },
    lunch: { de: '/mittagsmenue', en: '/lunch' },
    events: { de: '/veranstaltungen', en: '/events' },
    gallery: { de: '/galerie', en: '/gallery' },
    imprint: { de: '/impressum', en: '/imprint' },
    privacy: { de: '/datenschutz', en: '/privacy' },
  },

  studio: { id: 'restaurant', bricks: 'all' },
  texts: { en },
})
