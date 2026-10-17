// @lupinum/ginko/internal: everything the core exports, for Ginko's own packages (platform, Studio, editor,
// content, components, docs, presets). No stability promise: a name here can change in any release.
// Site code imports from '@lupinum/ginko'.
export * from './core/index.ts'
// The export folder's layout, shared by `ginko export` and the Studio's backup download.
export { defaultDir, pathOf } from './cli/model.ts'
// Builders of the basics bricks with a preset's own texts (the gastro preset pins its restaurant wording with them).
export { hoursBrick, hourPlansBrick, weekdays, type HoursTexts, type WeekRow } from './basics/hours-bricks.ts'
export { noticesBrick, type NoticeTask } from './basics/notices.ts'
export { eventsBrick } from './basics/events.ts'
export { offerPrice, postalAddress, type PostalAddressInput } from './basics/offer.ts'
// Today's hours line for the Studio status (computed on the server).
export { hoursLine, type HourPlan, type HoursLine, type HoursLineContext } from './basics/hours.ts'
// The one zone-offset reading: core writes event times with it, the Studio reads drafts' times with it.
export { zoneOffset } from './core/time.ts'
