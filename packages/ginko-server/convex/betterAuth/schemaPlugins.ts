import { jwt } from 'better-auth/plugins'

// Only plugins that change the auth schema. Email OTP adds no tables, so it is not listed.
// The organization plugin is not used: memberships and invites are Ginko tables (SPEC 3).
export function createAuthSchemaPlugins(authIssuer: string) {
  return [
    jwt({
      disableSettingJwtHeader: true,
      jwks: { disablePrivateKeyEncryption: false, gracePeriod: 21 * 60, keyPairConfig: { alg: 'RS256' } },
      jwt: { audience: authIssuer, expirationTime: '10m', issuer: authIssuer },
    }),
  ]
}
