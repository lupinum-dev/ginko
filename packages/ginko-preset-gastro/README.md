# @lupinum/ginko-preset-gastro

Restaurant bricks for [Ginko](https://github.com/lupinum-dev/ginko) sites, with the owner's quick tasks
built in: "Heute geschlossen", "Heute ausgebucht", the lunch menu of the week, a price change.

- **Bricks:** `hours()`, `notices()`, `lunch()`, `menu()`, `events({ route })`, `gallery()`.
- **Allergens:** the 14 LMIV allergens with the Austrian letter codes (`allergensAT`), and visitor names in
  German and English (`allergenNames`).
- **Opening hours:** `todayState(hours, today, 'und')` says open, closed (with the owner's reason) or rest day;
  `upcomingClosures` lists closures guests should know about soon.

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
- `holidays` on `hours()`: `'AT'` (default), `'DE'` (nationwide days only, no regional ones), `'SG'`, `'none'`, or your own `(year) => Holiday[]`. This is code, not an owner setting. Give the same value to the site's hours rule as `calendar` in the `hoursOn` context (or as the last argument of `todayState`). `hoursCalendarOf(brick)` reads it back.
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
  currency: 'SGD', // the core accepts only EUR and CHF today; SGD needs core support first
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
[`sites/restaurant`](https://github.com/lupinum-dev/ginko/tree/main/sites/restaurant) shows a complete set.

## License

MIT © Lupinum OG
