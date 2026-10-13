import { cronJobs } from 'convex/server'
import { internal } from './_generated/api'

const crons = cronJobs()
crons.daily('retention', { hourUTC: 2, minuteUTC: 0 }, internal.retention.daily, {})
crons.daily('stale personal data', { hourUTC: 3, minuteUTC: 0 }, internal.cleanup.daily, {})
crons.daily('upload sweep', { hourUTC: 2, minuteUTC: 30 }, internal.uploads.sweep, {})
// Hourly because sites live in different time zones: each run handles the sites whose 17:00 hour on the day before the week starts it is.
crons.cron('week reminders', '5 * * * *', internal.reminders.sweep, {})
export default crons
