/** A job is open through the day of `validUntil`; without a date it stays open. Same rule as `visible: { mode: 'active' }`. */
export function openJobs<T extends { validUntil?: string | null }>(items: readonly T[], today: string): T[] {
  return items.filter((job) => job.validUntil === undefined || job.validUntil === null || job.validUntil >= today)
}
