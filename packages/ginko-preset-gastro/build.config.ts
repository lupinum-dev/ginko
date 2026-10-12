import { defineBuildConfig } from 'unbuild'

// Published from dist/ (see publishConfig in package.json). The workspace imports src/*.ts.
export default defineBuildConfig({
  entries: [{ input: 'src/index', name: 'index' }],
  declaration: true,
  clean: true,
  externals: ['@lupinum/ginko'],
})
