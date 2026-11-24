// POC T2: the starter template's own bricks written in v2, as plain objects. The v1 forms are in ginko.config.ts
// (home) and in pages.ts (a function with options). German and French labels are in i18n/studio/.
import { collection, f, single } from '@lupinum/ginko/v2'

// The home page: title, lead and a short text (content/home.md).
export const home = single({
  label: 'Home page',
  fields: {
    title: f.text('Title', { max: 80, default: 'Welcome' }),
    lead: f.longtext('Lead', { max: 300, default: 'A short introduction: who you are and what you offer.' }),
    body: f.markdown('Text', { profile: 'page', optional: true }),
  },
})

// About, Contact and any other page (content/pages/). v1: the function `pages({ route, source })`.
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
