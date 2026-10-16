// Synced from templates/_features/jobs/app/composables/useJobs.ts by `pnpm templates sync`. Edit the source, not this copy.
import { plainText, safeHref, type MarkdownTree } from '@lupinum/ginko'
import { jobJsonLd } from '@lupinum/ginko/basics'

/** What the jobs feature reads of an entry of the `jobs` brick (`jobs()` of `@lupinum/ginko/basics`). */
export interface JobFacts {
  title: string
  location: string
  employmentType: string
  remote?: string | null
  validUntil: string
  applyEmail?: string | null
  applyUrl?: string | null
}

/**
 * Texts of a job in the page's language: the kind of employment, the work place, the last day to apply, and the
 * facts line of the list ("Musterstadt · Full time · Hybrid"). Unknown stored values show as stored.
 */
export function useJobText() {
  const { t, format } = useI18n('jobs')
  const employment = (job: JobFacts) => {
    const labels: Record<string, string> = {
      fullTime: t('employment.fullTime'),
      partTime: t('employment.partTime'),
      freelance: t('employment.freelance'),
      internship: t('employment.internship'),
      apprenticeship: t('employment.apprenticeship'),
    }
    return labels[job.employmentType] ?? job.employmentType
  }
  const workplace = (job: JobFacts) => {
    const labels: Record<string, string> = { onsite: t('workplace.onsite'), hybrid: t('workplace.hybrid'), remote: t('workplace.remote') }
    const value = job.remote ?? 'onsite'
    return labels[value] ?? value
  }
  /** "31 January 2027", with no-break spaces: the date never breaks across two lines. */
  const deadline = (job: JobFacts) => format.date(job.validUntil, { day: 'numeric', month: 'long', year: 'numeric' }).replace(/\s/g, '\u00a0')
  /** Place, employment and, when not on site, the work place: "Musterstadt · Full time · Hybrid". */
  const facts = (job: JobFacts) => [job.location, employment(job), job.remote && job.remote !== 'onsite' ? workplace(job) : undefined].filter(Boolean).join(' · ')
  return { employment, workplace, deadline, facts }
}

/** The open jobs (the brick hides a job after its `validUntil` day), in the brick's order. */
export function useOpenJobs() {
  const jobs = useGinko('jobs')
  const { t } = useI18n('jobs')
  const { facts, deadline } = useJobText()
  return computed(() => jobs.value.items.map((job) => ({
    key: job.id,
    title: job.data.title,
    to: job.url,
    text: job.data.description,
    meta: `${facts(job.data)} · ${t('applyBy', { date: deadline(job.data) })}`,
  })))
}

/**
 * How to apply: an email to the job's `applyEmail` with the job title in the subject; without one, the job's
 * `applyUrl` (an application page elsewhere); without both, an email to the business (content/site.md). No form on
 * this site. Undefined when there is no address at all.
 */
export function useApplyLink(job: () => JobFacts | undefined) {
  const site = useGinko('site')
  const { t } = useI18n('jobs')
  return computed(() => {
    const j = job()
    const email = j?.applyEmail || (j && safeHref(j.applyUrl ?? undefined) ? undefined : site.value.data.email)
    if (email) {
      const subject = j ? t('subject', { title: j.title }) : t('openSubject')
      return { href: `mailto:${email}?subject=${encodeURIComponent(subject)}`, email }
    }
    const url = safeHref(j?.applyUrl ?? undefined)
    return url ? { href: url, email: undefined } : undefined
  })
}

/**
 * schema.org JobPosting for a job page: title, the text as plain text, `validThrough` from `validUntil`, employment,
 * place, remote work and the business as employer. `datePosted` is the day the entry last changed in the site's time
 * zone (Ginko keeps no separate posting date, so an edit moves it), else today. A job after its `validUntil` has no
 * page, so it has no JSON-LD either.
 */
export function useJobJsonLd(job: () => JobFacts & { url: string, updatedAt?: string, description: string }, body: () => MarkdownTree | null | undefined) {
  const { name, url, timeZone } = useGinkoSite()
  const config = useSiteAppConfig()
  const today = useGinkoToday()
  // en-CA writes dates as YYYY-MM-DD. `updatedAt` is in UTC, which near midnight is another day in the site's zone.
  const dayInSite = (iso: string) => new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(iso))
  const country: string = useRuntimeConfig().public.ginko.country
  const absolute = (path: string) => new URL(path, url).href
  return computed(() => {
    const j = job()
    const tree = body()
    return jobJsonLd({
      title: j.title,
      url: absolute(j.url),
      description: [j.description, tree ? plainText(tree) : ''].filter(Boolean).join('\n\n'),
      datePosted: j.updatedAt ? dayInSite(j.updatedAt) : today.value,
      validUntil: j.validUntil,
      employmentType: j.employmentType,
      remote: j.remote ?? undefined,
      location: j.location,
      organization: { name, url, logo: config.logo ? absolute(config.logo.src) : undefined },
      country: country || undefined,
    })
  })
}
