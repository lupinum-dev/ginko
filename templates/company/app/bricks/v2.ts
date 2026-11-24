// POC T2: the company template's own bricks written in v2, as plain objects. The v1 forms are in ginko.config.ts
// (home, serviceLine) and in services.ts, pages.ts and logos-quotes.ts (functions with options). German and French
// labels are in i18n/studio/.
import { collection, f, single } from '@lupinum/ginko'

// The first screen of the home page (content/home.md).
export const home = single({
  label: 'Home page',
  fields: {
    title: f.text('Title', { max: 100, default: 'Welcome' }),
    lead: f.longtext('Lead', { max: 300, default: 'A short introduction: who you are and what you offer.' }),
    image: f.image('Image', { optional: true }),
  },
})

// The service line for a pump that stops: who answers it and when (content/serviceLine.md).
export const serviceLine = single({
  label: 'Service line',
  fields: {
    contact: f.ref('Who answers', { to: 'people', optional: true }),
    hours: f.text('Hours', { max: 80, default: 'Mon–Fri 8:00–17:00', hint: 'Short, for example “Mon–Fri 7:00–17:00, Sat 8:00–12:00”.' }),
  },
})

// Products and services (content/services/). v1: the function `services({ route, source, downloads })`.
export const services = collection({
  label: 'Services',
  item: 'Service',
  max: 50,
  fields: {
    title: f.text('Title', { max: 80 }),
    slug: f.slug('Address', { from: 'title' }),
    summary: f.longtext('Summary', { max: 300, hint: 'Shown on the card, below the title and in search results.' }),
    // An explicit choice, no default: a price is never left out by accident.
    pricing: f.choice('Pricing', {
      options: [{ value: 'price', label: 'A fixed price' }, { value: 'onRequest', label: 'On request' }],
      hint: 'A fixed price needs the amount too.',
    }),
    // Required while shown: a fixed price needs its amount; an entry on request has none.
    price: f.money('Amount', { showWhen: { field: 'pricing', is: 'price' } }),
    duration: f.number('Duration in minutes', { min: 5, max: 1440, step: 5, unit: 'min', optional: true }),
    specs: f.list('Key facts', {
      optional: true,
      max: 12,
      item: 'Fact',
      hint: 'Short, for example “Warranty” and “two years”.',
      fields: {
        label: f.text('Label', { max: 40 }),
        value: f.text('Value', { max: 80 }),
      },
    }),
    contact: f.ref('Contact person', {
      to: 'people',
      optional: true,
      hint: 'Receives the enquiries about this entry. Empty: the website’s email address and phone number.',
    }),
    image: f.image('Image', { optional: true }),
    // v1: the option `downloads`.
    sheet: f.ref('Product sheet', { to: 'downloads', optional: true }),
    body: f.markdown('Text', { profile: 'page' }),
  },
  tasks: [{ id: 'price', label: 'Change a price', fields: ['pricing', 'price'] }, 'edit', 'add'],
})

// About us and any other page (content/pages/). v1: the function `pages({ route, source })`.
export const pages = collection({
  label: 'Pages',
  item: 'Page',
  max: 50,
  fields: {
    title: f.text('Title', { max: 80 }),
    slug: f.slug('Address', { from: 'title' }),
    summary: f.longtext('Summary', { max: 300, optional: true, hint: 'Shown below the title and in search results.' }),
    image: f.image('Image', { optional: true }),
    actionLabel: f.text('Button text', { max: 40, optional: true, hint: 'One button below the title, for example “Donate online”. Needs the address too.' }),
    actionUrl: f.text('Button address', { format: 'url', optional: true, translate: false }),
    body: f.markdown('Text', { profile: 'page' }),
  },
  tasks: ['edit', 'add'],
})

// Customer logos on the home page (content/logos/).
export const logos = collection({
  label: 'Logos',
  item: 'Logo',
  max: 24,
  fields: {
    name: f.text('Name', { max: 80, translate: false }),
    image: f.image('Logo'),
    url: f.text('Website', { format: 'url', optional: true }),
  },
  tasks: ['add', 'remove'],
})

// What customers say (content/quotes/).
export const quotes = collection({
  label: 'Quotes',
  item: 'Quote',
  max: 24,
  fields: {
    text: f.longtext('Quote', { max: 300 }),
    name: f.text('Name', { max: 80, optional: true, translate: false }),
    role: f.text('Role', { max: 120, optional: true, hint: 'For example “Customer since 2021”.' }),
  },
  tasks: ['add', 'edit'],
})
