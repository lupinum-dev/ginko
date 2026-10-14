// Is this Node version inside an `engines.node` range of caret alternatives ("^22.18.0 || ^24.0.0")?
// Only that shape is supported: it is what all Ginko packages declare.
export function supportsNode(version, range) {
  const [major, minor, patch] = version.split('.').map(Number)
  return range.split('||').some((alternative) => {
    const [wantMajor, wantMinor = 0, wantPatch = 0] = alternative.trim().replace(/^\^/, '').split('.').map(Number)
    if (major !== wantMajor) return false
    return minor > wantMinor || (minor === wantMinor && patch >= wantPatch)
  })
}
