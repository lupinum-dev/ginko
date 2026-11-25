// Number 1 of slice 3 (a change with an end): one entry, two changes without an end and three exceptions with overlaps,
// and the values a page gets on each day. The file read (ginko-content) and the platform read (ginko-server) are both
// tested against this one table, so both homes give the same values on every day.
import type { Change, Json } from '../../src/core/index.ts'

/** The stored values (storage form: money in cents). `onMenu` is a switch that defaults to true. */
export const stored: Record<string, Json> = { price: { amount: 1290 }, onMenu: true }

/** In the order a person would plan them; the read must not depend on it. */
export const changes: Change[] = [
  // "Aktionspreis bis Jahresende".
  { from: '2026-10-20', until: '2026-12-31', set: { price: { amount: 990 } } },
  // A new normal price inside the offer: it shows only once the offer ends (spec 5.5, the 1 November case).
  { from: '2026-11-01', set: { price: { amount: 1390 } } },
  // A second offer over the first: the later start wins on the days both hold.
  { from: '2026-12-24', until: '2027-01-02', set: { price: { amount: 790 } } },
  // Another field, over the end of the second offer and a later normal price.
  { from: '2027-01-02', until: '2027-01-12', set: { onMenu: false } },
  { from: '2027-01-10', set: { price: { amount: 1490 } } },
]

/** [day, price in cents, onMenu] as a page reads them on that day. */
export const days: [string, number, boolean][] = [
  ['2026-10-19', 1290, true],
  ['2026-10-20', 990, true],
  ['2026-11-01', 990, true],
  ['2026-12-23', 990, true],
  ['2026-12-24', 790, true],
  ['2026-12-31', 790, true],
  ['2027-01-01', 790, true],
  ['2027-01-02', 790, false],
  ['2027-01-03', 1390, false],
  ['2027-01-10', 1490, false],
  ['2027-01-12', 1490, false],
  ['2027-01-13', 1490, true],
]
