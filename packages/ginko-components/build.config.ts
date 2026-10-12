export default {
  // The registry is plain data without Vue, so ginko.config.ts can load it in Node.
  entries: [{ input: 'src/registry', name: 'registry' }],
}
