import { hash, verify } from '@node-rs/argon2';
import { betterAuth } from 'better-auth';
import { mongodbAdapter } from 'better-auth/adapters/mongodb';
import { APIError, createAuthMiddleware } from 'better-auth/api';
import type { Db } from 'mongodb';
import { APP_NAME, type Config } from '../config.js';
import type { Mailer } from '../mail/mailer.js';
import { isInvited } from '../models/invite.js';
import { ROLES } from '../models/role.js';

interface AuthDeps {
  db: Db;
  config: Config['auth'];
  mailer: Mailer;
}

/**
 * Error code of a sign-up refused because the email is not in `invites`. A refused Google
 * login comes back to the client as `/sign-in?error=not_invited`.
 */
export const NOT_INVITED = 'not_invited';

function notInvited() {
  return new APIError('FORBIDDEN', {
    code: NOT_INVITED,
    message: 'This email has not been invited',
  });
}

export function createAuth({ db, config, mailer }: AuthDeps) {
  return betterAuth({
    appName: APP_NAME,
    baseURL: config.baseUrl,
    basePath: '/api/auth',
    secret: config.secret,
    // Collections: users, sessions, accounts, verifications
    database: mongodbAdapter(db, { usePlural: true }),

    user: {
      additionalFields: {
        // Not required here because Google may not return a family name;
        // email sign-up enforces it in the hook below.
        surname: { type: 'string', required: false, defaultValue: '' },
        // Name of a document in the `roles` collection
        role: { type: 'string', required: false, defaultValue: ROLES.user, input: false },
      },
    },

    // Invite-only: every new user (email sign-up or first Google login) goes through here.
    // Email sign-up is also checked in the hook below, because Better Auth answers a refusal
    // from here with a fake success when email verification is on (anti-enumeration).
    databaseHooks: {
      user: {
        create: {
          before: async (user) => {
            if (!(await isInvited(user.email))) throw notInvited();
          },
        },
      },
    },

    emailAndPassword: {
      enabled: true,
      requireEmailVerification: true,
      minPasswordLength: 10,
      revokeSessionsOnPasswordReset: true,
      password: {
        hash: (password) => hash(password),
        verify: ({ hash, password }) => verify(hash, password),
      },
      sendResetPassword: async ({ user, url }) => {
        await mailer({
          to: user.email,
          subject: `Reset your ${APP_NAME} password`,
          text: `Open this link to choose a new password:\n\n${url}\n\nIf you did not ask for this, ignore this email.`,
        });
      },
    },

    emailVerification: {
      sendOnSignUp: true,
      sendOnSignIn: true,
      autoSignInAfterVerification: true,
      sendVerificationEmail: async ({ user, url }) => {
        await mailer({
          to: user.email,
          subject: `Verify your ${APP_NAME} email`,
          text: `Open this link to verify your email address:\n\n${url}`,
        });
      },
    },

    socialProviders: config.google
      ? {
          google: {
            clientId: config.google.clientId,
            clientSecret: config.google.clientSecret,
            prompt: 'select_account',
            mapProfileToUser: (profile) => ({
              name: profile.given_name || profile.name,
              surname: profile.family_name ?? '',
            }),
          },
        }
      : {},

    // Rate limiting and sessions use the client IP from X-Forwarded-For (the default),
    // which Caddy sets to the address of the connecting client.

    account: {
      encryptOAuthTokens: true,
      // Same email = same account; only linked when the email is verified on both sides
      accountLinking: { enabled: true },
    },

    hooks: {
      before: createAuthMiddleware(async (ctx) => {
        if (ctx.path !== '/sign-up/email') return;
        if (!String(ctx.body?.surname ?? '').trim()) {
          throw new APIError('BAD_REQUEST', { message: 'Surname is required' });
        }
        if (!(await isInvited(String(ctx.body?.email ?? '')))) throw notInvited();
      }),
    },
  });
}

export type Auth = ReturnType<typeof createAuth>;
export type AuthUser = Auth['$Infer']['Session']['user'];
