// @lupinum/ginko/internal: everything the core exports, for Ginko's own packages (platform, Studio, editor,
// content, components, docs, presets). No stability promise: a name here can change in any release.
// Site code imports from '@lupinum/ginko'.
export * from './core/index.ts'
// The export folder's layout, shared by `ginko export` and the Studio's backup download.
export { defaultDir, pathOf } from './cli/model.ts'
// Builders of the patterns' stored bricks with a preset's own texts (the gastro preset pins its restaurant wording with
// them), and the docs theme's posts, authors and changelog, which it stores with English labels.
export { hoursBrick, hourPlansBrick, type HoursTexts, type WeekDefault } from './patterns/hours-bricks.ts'
export { noticesBrick, type NoticeTask } from './patterns/notices.ts'
export { eventsBrick } from './patterns/events.ts'
export { posts as postsBrick, authors as authorsBrick, changelog as changelogBrick } from './patterns/posts.ts'
// A stored brick turned into the written form, so a preset's bricks work with `extend` (the gastro preset).
export { defOf } from './authoring/from-stored.ts'
export { offerPrice, postalAddress, type PostalAddressInput } from './patterns/offer.ts'
// The line of the opening-hours status rule, as the Studio and the weekly mail render it.
export type { HoursToday, TodayLine } from './patterns/rules.ts'
// The one zone-offset reading: core writes event times with it, the Studio reads drafts' times with it.
export { zoneOffset } from './core/time.ts'
