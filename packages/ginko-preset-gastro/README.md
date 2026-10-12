# @lupinum/ginko-preset-gastro

Restaurant bricks for [Ginko](https://github.com/lupinum-dev/ginko) sites, with the owner's quick tasks
built in: "Closed today", "Fully booked today", the lunch menu of the week, a price change.

- **Bricks:** `hours()`, `hourPlans()`, `notices()`, `lunch()`, `lunchPlans()`, `menu()`, `events({ route })`, `gallery()`.
- **Allergens:** the 14 EU allergens with the Austrian letter codes (`allergensEU`), and visitor names in
  German and English (`allergenNames`).
- **Opening hours:** `todayState(today, { hours, plans })` says open (with the times), closed (with the owner's
  reason), closed for a public holiday, or rest day. `upcomingClosures({ hours, plans }, today, days)` lists the
  closures guests should know about soon. Public holiday names come in German and English (`holiday.de`, `holiday.en`).

## Options

Every factory takes the same two options, plus its own:

| Option | Default | What it does |
|---|---|---|
| `lang` | `'de'` | The site's main language. Picks only default content (the lunch placeholder, the "fully booked" text), for `de` or `en`. Labels are always German and English. |
| `source` | the platform | `'files'` reads the brick from Markdown in `content/`, so it runs without the platform. |
| `holidays` (`hours`) | `'AT'` | The public holidays the hours rules use: `'AT'`, `'DE'`, `'SG'`, `'none'`, or your own `(year) => Holiday[]`. |
| `allergens` (`menu`, `lunch`, `lunchPlans`) | `'EU'` | `'EU'`, `'none'` (no allergen field), or your own `[{ value, label }]`. |
| `weekOf` (`lunch`) | none | The default week of the lunch menu. |
| `lunchBrick` (`lunchPlans`) | `'lunch'` | The key of the `lunch()` brick that planned weeks belong to. |
| `route` (`events`, required) | none | The event page per locale, e.g. `{ en: '/events/[slug]' }`. |

```ts
// ginko.config.ts
import { defineSite } from '@lupinum/ginko'
import { events, gallery, hours, lunch, menu, notices } from '@lupinum/ginko-preset-gastro'

export default defineSite({
  site: 'gasthaus',
  name: 'Gasthaus zur Linde',
  url: 'https://example.com',
  timezone: 'Europe/Vienna',
  locales: ['de', 'en'],
  currency: 'EUR',
  pages: { home: { de: '/', en: '/en' } },
  bricks: {
    hours: hours(),
    notices: notices(),
    lunch: lunch(),
    menu: menu(),
    events: events({ route: { de: '/veranstaltungen/[slug]', en: '/en/events/[slug]' } }),
    gallery: gallery(),
  },
})
```

## Outside Austria

Defaults are Austrian (German and English labels, Austrian holidays, the 14 EU allergens). Change them per site:

- Labels are always German and English. `lang: 'en'` on a factory only picks the default text (such as the lunch placeholder), so use it when the main locale is `en`.
- `holidays` on `hours()`: `'AT'` (default), `'DE'` (nationwide days only, no regional ones), `'SG'`, `'none'` (no public holidays), or your own `(year) => Holiday[]`. This is code, not an owner setting. Give the same value to the hours rules as `calendar` in their context (`hoursOn(date, { hours, calendar })`, `todayState(today, { hours, calendar })`). `hoursCalendarOf(brick)` reads it back.
- Singapore's lunar, Islamic and Hindu holidays are a table for 2026 and 2027 (source: [MOM](https://www.mom.gov.sg/employment-practices/public-holidays)). Add a row each year; other years only know the fixed dates.
- `allergens` on `menu()`, `lunch()` and `lunchPlans()`: `'EU'` (default), `'none'` (no field), or your own `[{ value, label }]`.
- `restaurantJsonLd` has no default currency or country: pass `currency` and `address.country`.
- `eventJsonLd` writes an Event per event: dates from `when`, plus the optional `start` time (`HH:MM`, local, no offset) in `startDate`, and `offers` only with a price. It needs `currency` for prices that carry none.

```ts
export default defineSite({
  site: 'kopi-corner',
  name: 'Kopi Corner',
  url: 'https://example.com',
  timezone: 'Asia/Singapore',
  locales: ['en'],
  currency: 'SGD',
  pages: { home: '/' },
  bricks: {
    hours: hours({ lang: 'en', holidays: 'SG' }),
    notices: notices({ lang: 'en' }),
    lunch: lunch({ lang: 'en', allergens: 'none' }),
    menu: menu({ lang: 'en', allergens: 'none' }),
  },
})
```

Components stay in your site, because their look belongs to the site's design. The demo restaurant in
[`sites/restaurant`](https://github.com/lupinum-dev/ginko/tree/main/sites/restaurant) shows a complete set. It runs
inside the Ginko repository against a fake platform, and its page files have German names.

To start a new site with this preset, run `npm create ginko@latest my-restaurant -- --preset gastro`.

## License

MIT © Lupinum OG
