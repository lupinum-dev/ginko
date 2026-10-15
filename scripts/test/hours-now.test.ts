import { describe, expect, it } from 'vitest'
import { hoursNow } from '../../templates/_features/hours/app/composables/useHours.ts'

const open = (ranges: [string, string][]) => ({ state: 'open', ranges }) as unknown as Parameters<typeof hoursNow>[0]
const closed = { state: 'closed' } as unknown as Parameters<typeof hoursNow>[0]

// The "open now" line of the hours feature (templates/_features/hours), which bars and local businesses reuse.
describe('hoursNow', () => {
  // Wrong behaviour caught: after midnight, the rest of yesterday's span (Sat 18:00–02:00) was not seen, so at 01:00
  // on Sunday the line said "Closed today" or "Opens today at …" while the place was open.
  it.each([
    ['01:00 after a span past midnight, today closed', '01:00', closed, [{ from: '18:00', to: '02:00' }], { kind: 'open', until: '02:00' }],
    ['01:00 after a span past midnight, today opening later', '01:00', open([['18:00', '02:00']]), [{ from: '18:00', to: '02:00' }], { kind: 'open', until: '02:00' }],
    ['03:00, yesterday’s span is over', '03:00', open([['18:00', '02:00']]), [{ from: '18:00', to: '02:00' }], { kind: 'later', at: '18:00', again: false }],
    ['01:00 after a span that ended before midnight', '01:00', closed, [{ from: '11:30', to: '22:00' }], { kind: 'closed', reason: undefined, holiday: undefined }],
  ])('%s', (_, clock, line, yesterday, expected) => {
    expect(hoursNow(line, clock, 'en', yesterday)).toEqual(expected)
  })
})
