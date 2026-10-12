import { defineBuildConfig } from 'unbuild'

export default defineBuildConfig({
  entries: [{ input: 'src/index', outDir: 'dist', name: 'index' }],
  declaration: true,
})
