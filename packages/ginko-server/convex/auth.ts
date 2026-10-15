// Better Auth (SPEC 10): email one-time codes, one `email` hook, sign-up only for admins and invitees,
// admin bootstrap on the first sign-in.
import {
  createBetterConvexAuth,
  type AuthFunctions,
  type BetterConvexAuth,
} from '@lupinum/better-convex-nuxt/better-auth/server'

import { components, internal } from './_generated/api'
import type { DataModel } from './_generated/dataModel'
import { normalizeEmail } from './members'

const authFunctions: AuthFunctions = internal.auth
type UserCreateDecision = { readonly allowed: false } | { readonly allowed: true; readonly user: { readonly email: string } }

// Return types are annotated: `internal` includes this module, so inference through it would be circular.
export const auth: BetterConvexAuth<DataModel> = createBetterConvexAuth<DataModel>(components.betterAuth, {
  authFunctions,
  // The session token carries the email for Convex identity; access checks read the live user row instead
  // (lib/access.ts currentUser), so a changed or unproven address never grants anything.
  defineSessionClaims: ({ user }) => ({ email: user.email }),
  emailOTP: { otpLength: 6, expiresIn: 5 * 60, allowedAttempts: 3 },
  // Codes are the only way in: a code proves the mailbox, which the sign-up gate below relies on. The library turns
  // email and password on unless it is switched off, and a password sign-up proves nothing about the address.
  emailAndPassword: false,
  // Sign-up is limited to admin addresses and pending invitations; anyone else gets no account (and no code, see mail.queueCode).
  beforeUserCreate: async ({ ctx, user }): Promise<UserCreateDecision> => {
    // Never decide access from an address the person has not proven. A code sign-in creates a verified user.
    if (!user.emailVerified) return { allowed: false }
    const email = normalizeEmail(user.email)
    const allowed: boolean = await ctx.runQuery(internal.invites.mayJoin, { email })
    return allowed ? { allowed: true, user: { email } } : { allowed: false }
  },
  // The one delivery hook. Without a mail way (GINKO_MAIL) the mail step fails, so no code is sent.
  email: async (ctx, message) => {
    if (message.type !== 'email-otp') throw new Error(`Unsupported auth email: ${message.type}`)
    await ctx.runMutation(internal.mail.queueCode, { to: message.to, otp: message.otp })
  },
  triggers: {
    user: {
      onCreate: async (ctx, doc) => {
        // The trigger document is the Better Auth user row; `id`, `email` and `emailVerified` are its fields.
        const user = doc as unknown as { id: string; email: string; emailVerified: boolean }
        if (!user.emailVerified) return
        await ctx.runMutation(internal.members.bootstrapAdmin, { user: user.id, email: normalizeEmail(user.email) })
      },
    },
    // Every sign-in creates a session, so an existing user listed in GINKO_ADMIN_EMAILS later becomes admin here.
    // bootstrapAdmin is idempotent. The session row holds only the user id, so the email is read from the user row.
    session: {
      onCreate: async (ctx, doc) => {
        const session = doc as unknown as { userId: string }
        const user = await ctx.runQuery(components.betterAuth.adapter.findOne, { model: 'user', where: [{ field: 'id', value: session.userId }] })
        if (!user?.emailVerified) return
        await ctx.runMutation(internal.members.bootstrapAdmin, { user: session.userId, email: normalizeEmail(String(user.email)) })
      },
    },
  },
})
export const createAuth = auth.createAuth
export const { ensureSigningKey, pruneSigningKeys, rotateSigningKey } = auth.jwksOperatorFunctions()
export const { onCreate, onUpdate, onDelete } = auth.triggerFunctions()
