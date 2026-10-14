# @lupinum/ginko-preset-gastro

Restaurant bricks for [Ginko](https://github.com/lupinum-dev/ginko) sites, with the owner's quick tasks
built in: "Closed today", "Fully booked today", the lunch menu of the week, a price change.

- **Bricks:** `hours()`, `hourPlans()`, `notices()`, `lunch()`, `lunchPlans()`, `menu()`, `events({ route })`, `gallery()`.
- **Allergens:** the 14 EU allergens with the Austrian letter codes (`allergensEU`), and visitor names in
  German and English (`allergenNames`).
- **Opening hours:** `todayState({ hours, plans }, today)` says open (with the times), closed (with the owner's
  reason), closed for a public holiday, or rest day. `upcomingClosures({ hours, plans }, today, days)` lists the
  closures guests should know about soon. Public holiday names come in German and English (`holiday.de`, `holiday.en`).

## Install

```bash
npm install @lupinum/ginko @lupinum/ginko-preset-gastro
```

`@lupinum/ginko` is a peer dependency: the bricks are built by your site's copy of it.

## Options

Every factory takes `source`, plus its own options:

| Option | Default | What it does |
|---|---|---|
| `source` | the platform | `'files'` reads the brick from Markdown in `content/`, so it runs without the platform. |
| `allergens` (`menu`, `lunch`, `lunchPlans`) | `'EU'` | `'EU'`, `'none'` (no allergen field), or your own `[{ value, label }]`. |
| `weekOf` (`lunch`) | none | Required for a platform `lunch()`: the week the first menu starts (`YYYY-MM-DD`). Without it, `ginko check` rejects the new single. A platform `lunch()` also needs the main locale `de` or `en` (see [Outside Austria](#outside-austria)). |
| `lunchBrick` (`lunchPlans`) | `'lunch'` | The key of the `lunch()` brick that planned weeks belong to. |
| `route` (`events`, required) | none | The event page per locale, e.g. `{ en: '/events/[slug]' }`. |

These bricks read from the Ginko platform. Without a running platform the dev server answers 503: add
`source: 'files'` to each factory (`hours({ source: 'files' })`) to read Markdown from `content/` instead.

```ts
// ginko.config.ts
import { defineSite } from '@lupinum/ginko'
import { events, gallery, hours, lunch, menu, notices } from '@lupinum/ginko-preset-gastro'

export default defineSite({
  site: 'gasthaus',
  name: 'Gasthaus zur Linde',
  url: 'https://example.com',
  timeZone: 'Europe/Vienna',
  locales: ['de', 'en'],
  currency: 'EUR',
  pages: { home: { de: '/', en: '/en' } },
  bricks: {
    hours: hours(),
    notices: notices(),
    lunch: lunch({ weekOf: '2026-10-05' }),
    menu: menu(),
    events: events({ route: { de: '/veranstaltungen/[slug]', en: '/en/events/[slug]' } }),
    gallery: gallery(),
  },
})
```

## Exports

These are all the public names. Everything else in the package is internal and can change in any release.

**Brick factories.** `hours`, `hourPlans`, `notices`, `lunch`, `lunchPlans`, `menu`, `events`, `gallery`: see [Options](#options).
Their stored field names (`week`, `exceptions`, `closedOn`, `closedNote`, `holidayNoticeDays`, `holidays`, `from1` to `to2`,
`weekOf`, `days`, `nextPrice`, `priceFrom` and so on) are the data of your site. They do not change.

A day has at most two opening periods (`from1`–`to1` and `from2`–`to2`, labelled lunch and evening). This is a limit of
the stored data, the same in the week, in hour plans and in exceptions.

| Name | What it is |
|---|---|
| `allergensEU` | The 14 EU allergens as `{ value, label }` options (letter codes). |
| `allergenNames` | `{ de, en }`: the allergen name per code, for visitors. |
| `weekdayNames` | `{ de, en }`: the weekday name per `mo`, `tu`, `we`, `th`, `fr`, `sa`, `su`. |
| `hoursOn({ hours, plans?, calendar? }, date)` | What applies on a date (`YYYY-MM-DD`): `{ closed, times, reason?, source, field?, holiday? }`. The one rule every display builds on. |
| `todayState(ctx, today)` | `{ kind: 'open', times }`, `{ kind: 'closed', reason }`, `{ kind: 'holiday', holiday }` or `{ kind: 'restDay' }`. |
| `upcomingClosures(ctx, today, days)` | The owner's closing exceptions and the public holidays that close the house, in the next `days` days. |
| `upcomingHolidayClosures(ctx, today, days)` | Only the closing public holidays. |
| `upcomingPlans(plans, today, days)` | Hour plans that start in the next `days` days, with their start date. |
| `weekFor(ctx, date)` | The 7-day week that applies on a date: `{ week, plan? }`. |
| `weekdayOf(date)` | The weekday key (`'mo'` to `'su'`) of a date. |
| `timesOf(day, and)` | One day's opening times as text: `11:30–14:00 and 17:30–22:00` (empty when closed). |
| `spansOf(times)`, `spansText(spans, and)` | The time spans of a day, and the spans joined as text. |
| `lunchWeekOn(main, planned, today, week)` | The lunch week to show today: a planned week, the main `lunch` data, or nothing. `week` is the site's week info. |
| `priceOn(item, date)` | The price on a date. `nextPrice` counts from `priceFrom` on. |
| `upcomingPrice(item, today, days)` | `{ from, price }` for a price change in the next `days` days, else `undefined`. |
| `restaurantJsonLd(input)` | schema.org `Restaurant` data. Prices are in minor units (cents), so `1250` is `12.50`. |
| `eventJsonLd(input)` | schema.org `Event` data for one event. Same price rule. |

Types: `HoursData`, `HoursContext`, `DayHours`, `DayRule` (what `hoursOn` returns), `HoursSource`, `Span`, `Exception`, `HourPlan`,
`HolidayClosure`, `TodayState`, `Weekday`, `Holiday`,
`HolidayCalendar`, `HolidaysOption` (what `calendar` takes), `LunchWeekData`, `PricedItem`, `RestaurantJsonLdInput`, `EventJsonLdInput`, `JsonLdMenuSection`.

## Outside Austria

Defaults are Austrian (German and English labels, Austrian holidays, the 14 EU allergens). Change them per site:

- Labels and prefilled texts (such as the lunch placeholder) come in German and English. The site keeps the texts of its own locales when its main locale is `de` or `en`; otherwise it starts without the prefilled texts. A platform `lunch()` cannot start without them: its days need the placeholder dish, so with another main locale `ginko check` rejects the new single. Use `lunch({ source: 'files' })` there. A code with a region such as `de-CH` does not count as `de`.
- `calendar` in the context of the hours rules: `'AT'` (default), `'DE'` (nationwide days only, no regional ones), `'SG'`, `'none'` (no public holidays), or your own `(year) => Holiday[]`. This is code, not an owner setting, and not part of `hours()`. Pass it to every call that reads holidays: `hoursOn({ hours, calendar }, date)`, `todayState({ hours, calendar }, today)`, `upcomingClosures` and `upcomingHolidayClosures`. A call without it counts Austrian holidays. Keep the value in one constant of your site so all calls agree. The stored field `holidays` (the owner's choice for those days: like Sunday, closed, normal) is a different thing and keeps its name.
- Singapore's lunar, Islamic and Hindu holidays are a table for 2026 and 2027 (source: [MOM](https://www.mom.gov.sg/employment-practices/public-holidays)). Add a row each year; other years only know the fixed dates.
- `allergens` on `menu()`, `lunch()` and `lunchPlans()`: `'EU'` (default), `'none'` (no field), or your own `[{ value, label }]`.
- `restaurantJsonLd` has no default currency or country: pass `currency` and `address.country`.
- `eventJsonLd` writes an Event per event: dates from `when`, plus the optional `start` time (`HH:MM`, local, no offset) in `startDate`, and `offers` only with a price. It needs `currency` for prices that carry none.

```ts
import type { HolidaysOption } from '@lupinum/ginko-preset-gastro'

// One constant for the holiday calendar, passed to every hours rule.
export const calendar = 'SG' satisfies HolidaysOption

export default defineSite({
  site: 'kopi-corner',
  name: 'Kopi Corner',
  url: 'https://example.com',
  timeZone: 'Asia/Singapore',
  locales: ['en'],
  currency: 'SGD',
  pages: { home: '/' },
  bricks: {
    hours: hours(),
    notices: notices(),
    lunch: lunch({ weekOf: '2026-10-05', allergens: 'none' }),
    menu: menu({ allergens: 'none' }),
  },
})

// In a component, with the stored hours data:
todayState({ hours: hoursData, calendar }, today)
```

Components stay in your site, because their look belongs to the site's design. The demo restaurant in
[`sites/restaurant`](https://github.com/lupinum-dev/ginko/tree/main/sites/restaurant) shows a complete set. It runs
inside the Ginko repository against a fake platform, and its page files have German names.

To start a new site with this preset, run `npm create ginko@latest my-restaurant -- --preset gastro`.

## License

MIT © Lupinum OG
