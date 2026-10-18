// The docs layer's options (README of @lupinum/ginko-docs, "Configure"). Texts are not set here: the link texts are
// `docs.footer.<id>` in i18n/en.json and i18n/de.json, so each language has its own.
// The Git host of your project: used for "Edit this page" and the footer link.
const repository = 'https://git.example.com/orbit/sdk'

export default defineAppConfig({
  docs: {
    // Next to the name in the header; `logo-dark.svg` in dark mode.
    logo: { light: '/logo.svg', dark: '/logo-dark.svg' },
    // "Edit this page" under every page opens its file on the Git host. Set your own repository.
    repository: {
      url: repository,
      branch: 'main',
      issueUrl: '{url}/issues/new?title={title}&body={page}',
    },
    footer: {
      links: [
        { id: 'source', href: repository },
        { id: 'api', href: 'https://orbit.example.com' },
        // Link the imprint and privacy page of your main site; most sites in the EU need both on every page.
        { id: 'imprint', href: 'https://orbit.example.com/imprint' },
        { id: 'privacy', href: 'https://orbit.example.com/privacy' },
      ],
    },
  },
})
