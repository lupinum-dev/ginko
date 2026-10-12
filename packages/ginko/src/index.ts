// @lupinum/ginko: the only package a customer site installs. It owns the contract
// between the hosted platform and a site (SPEC part 1): schema, validation, diff,
// bundle and Markdown. The platform imports the same functions; there is no second copy.
export * from './core/index.ts'
