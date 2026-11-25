// Number 1 of slice 4 (a change that comes back every year): one entry with a normal value, a change without an end, a
// yearly change across the turn of the year, a one-off change inside it and a yearly change with 29 February as its last
// day, and the values a page gets on days of three years (2028 is a leap year). The file read (ginko-content), the
// platform read (ginko-server) and the core read are all tested against this one table. The platform saves the changes
// on `savedOn`, so every first day lies within a year of it.
import type { Change, Json } from '../../src/core/index.ts'

/** The day the platform test saves the changes. The table starts on it. */
export const savedOn = '2027-10-08'

/** The stored values (storage form: money in cents). `onMenu` is a switch that defaults to true. */
export const stored: Record<string, Json> = { price: { amount: 1290 }, onMenu: true }

/** In the order a person would plan them; the read must not depend on it. */
export const changes: Change[] = [
  // "Winter, jedes Jahr 1. Dezember bis 31. Jänner": over the turn of the year.
  { from: '2027-12-01', until: '2028-01-31', yearly: true, name: 'Winter', set: { price: { amount: 990 } } },
  // A one-off change inside the first winter: its later start wins on its days; it does not come back.
  { from: '2027-12-24', until: '2027-12-26', name: 'Weihnachten', set: { price: { amount: 790 } } },
  // A new normal price inside the first winter: it shows only once the winter ends (as slice 3).
  { from: '2028-01-10', set: { price: { amount: 1390 } } },
  // Another field, to the end of February: 29 February in 2028, 28 February in 2029 and 2030.
  { from: '2028-02-20', until: '2028-02-29', yearly: true, set: { onMenu: false } },
]

/** [day, price in cents, onMenu] as a page reads them on that day. */
export const days: [string, number, boolean][] = [
  ['2027-10-08', 1290, true],
  ['2027-11-30', 1290, true],
  ['2027-12-01', 990, true],
  ['2027-12-23', 990, true],
  ['2027-12-24', 790, true],
  ['2027-12-26', 790, true],
  ['2027-12-27', 990, true],
  ['2028-01-10', 990, true],
  ['2028-01-31', 990, true],
  ['2028-02-01', 1390, true],
  ['2028-02-19', 1390, true],
  ['2028-02-20', 1390, false],
  ['2028-02-29', 1390, false],
  ['2028-03-01', 1390, true],
  ['2028-11-30', 1390, true],
  ['2028-12-01', 990, true],
  ['2028-12-24', 990, true],
  ['2029-01-31', 990, true],
  ['2029-02-01', 1390, true],
  ['2029-02-20', 1390, false],
  ['2029-02-28', 1390, false],
  ['2029-03-01', 1390, true],
  ['2029-12-01', 990, true],
  ['2030-01-31', 990, true],
  ['2030-02-01', 1390, true],
  ['2030-02-28', 1390, false],
  ['2030-03-01', 1390, true],
]
