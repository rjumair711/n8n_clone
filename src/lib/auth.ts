import { betterAuth, type BetterAuthPlugin } from "better-auth"
import { getAuthAuditEvent } from "./audit-actions"
import { recordAudit } from "./audit-log"
import { prismaAdapter } from "better-auth/adapters/prisma"
import { APIError, createAuthMiddleware, getIp } from "better-auth/api"
import { captcha, twoFactor } from "better-auth/plugins"
import { DISPOSABLE_EMAIL_MESSAGE, isDisposableEmail } from "./disposable-email"
import { getTurnstileConfig } from "./turnstile"
import {
  SIGN_IN_RATE_LIMIT,
  clearFailedLogins,
  getLoginLockSeconds,
  loginLockedMessage,
  recordFailedLogin,
} from "./login-lockout"
import { consumeRateLimit } from "./rate-limit"
import prisma from "./db"
// 💡 Added 'webhooks' to the import line below
import { checkout, polar, portal, webhooks } from "@polar-sh/better-auth"
import { polarClient } from "./polar"
import { SubscriptionPlan } from "@prisma/client"
import { Resend } from "resend"

// Where the app may be opened from. Set NEXT_PUBLIC_APP_URL (and
// TRUSTED_ORIGINS, comma-separated, for any extra domains) per environment
// instead of listing addresses in the code.
const getTrustedOrigins = () => {
  const origins = new Set<string>()

  const add = (value?: string) => {
    const trimmed = value?.trim().replace(/\/+$/, "")
    if (!trimmed) return

    origins.add(/^https?:\/\//.test(trimmed) ? trimmed : `https://${trimmed}`)
  }

  add(process.env.NEXT_PUBLIC_APP_URL)
  add(process.env.BETTER_AUTH_URL)

  for (const origin of (process.env.TRUSTED_ORIGINS || "").split(",")) {
    add(origin)
  }

  // Set by Vercel: this deployment, and the project's production domain
  add(process.env.VERCEL_URL)
  add(process.env.VERCEL_PROJECT_PRODUCTION_URL)

  if (process.env.NODE_ENV !== "production") {
    origins.add("http://localhost:3000")
    // The tunnel started by "npm run ngrok:dev"
    add(process.env.NGROK_URL)
  }

  return [...origins]
}

// Verification emails are sent with Resend. Without a key they cannot be
// sent, so the requirement is only switched on when one is configured.
const emailVerificationEnabled =
  !!process.env.RESEND_API_KEY &&
  process.env.REQUIRE_EMAIL_VERIFICATION !== "false"

// Verification and password-reset mail. Returns false when it was not sent.
const sendAuthEmail = async ({
  to,
  subject,
  intro,
  linkText,
  url,
}: {
  to: string
  subject: string
  intro: string
  linkText: string
  url: string
}) => {
  if (!process.env.RESEND_API_KEY) {
    console.error(`Cannot send "${subject}": RESEND_API_KEY is not set`)
    return false
  }

  const resend = new Resend(process.env.RESEND_API_KEY)
  const footer = "If you did not ask for this, you can ignore this email."

  const { error } = await resend.emails.send({
    // Must be an address on a domain verified in Resend
    from: process.env.EMAIL_FROM || "RXJ <onboarding@resend.dev>",
    to,
    subject,
    text: `${intro}

${linkText}:
${url}

${footer}`,
    html: `<p>${escapeHtml(intro)}</p><p><a href="${escapeHtml(url)}">${escapeHtml(linkText)}</a></p><p>${footer}</p>`,
  })

  if (error) {
    console.error(`Failed to send "${subject}":`, error)
    return false
  }

  return true
}

const escapeHtml = (text: string) =>
  text.replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`)

const PASSWORD_SIGN_IN = "/sign-in/email"
const PASSWORD_SIGN_UP = "/sign-up/email"

// Both keys set, or the check is off
const turnstile = getTurnstileConfig()

// Where a password or a two-factor code is being guessed at
const isSignInAttempt = (path?: string) =>
  path === PASSWORD_SIGN_IN || !!path?.startsWith("/two-factor/verify")

const emailOf = (body: unknown) => {
  const email = (body as { email?: unknown } | undefined)?.email

  return typeof email === "string" && email.trim() ? email : null
}

// Records sign-ins and two-factor changes in the audit log. A plugin rather
// than `hooks.after` below, because plugin hooks run after the options'
// hook and in plugin order: this one has to see what twoFactor decided.
const auditLogPlugin = {
  id: "rxj-audit-log",
  hooks: {
    after: [
      {
        matcher: () => true,
        handler: createAuthMiddleware(async (ctx) => {
          const event = getAuthAuditEvent({
            path: ctx.path,
            returned: ctx.context.returned,
            newSession: ctx.context.newSession,
            priorSession: ctx.context.session,
            provider: (ctx.params as { id?: string } | undefined)?.id,
          })

          if (!event) return

          await recordAudit({
            ...event,
            ipAddress: ctx.request ? getIp(ctx.request, ctx.context.options) : null,
          })
        }),
      },
    ],
  },
} satisfies BetterAuthPlugin

export const auth = betterAuth({
  database: prismaAdapter(prisma, {
    provider: "postgresql",
  }),

  databaseHooks: {
    user: {
      create: {
        // Every way an account is made, Google and GitHub sign-ins too
        before: async (user) => {
          if (isDisposableEmail(user.email)) {
            throw new APIError("BAD_REQUEST", { message: DISPOSABLE_EMAIL_MESSAGE })
          }
        },
        after: async (user) => {
          await prisma.user.update({
            where: {
              id: user.id,
            },
            data: {
              plan: "FREE",
              trialEndsAt: new Date(
                Date.now() + 7 * 24 * 60 * 60 * 1000
              ),
            },
          });
        },
      },
    },
  },

  trustedOrigins: getTrustedOrigins(),

  hooks: {
    before: createAuthMiddleware(async (ctx) => {
      // Refused before anything else happens, so the form gets this message
      if (ctx.path === PASSWORD_SIGN_UP) {
        const email = emailOf(ctx.body)

        if (email && isDisposableEmail(email)) {
          throw new APIError("BAD_REQUEST", { message: DISPOSABLE_EMAIL_MESSAGE })
        }
      }

      if (!isSignInAttempt(ctx.path)) return

      // Per IP address: slows down guessing across many accounts
      const ip = ctx.request ? getIp(ctx.request, ctx.context.options) : null

      if (ip) {
        const { allowed, retryAfterSeconds } = await consumeRateLimit(
          `sign-in-ip:${ip}`,
          SIGN_IN_RATE_LIMIT
        )

        if (!allowed) {
          throw new APIError("TOO_MANY_REQUESTS", {
            message: `Too many sign-in attempts. Try again in ${retryAfterSeconds} seconds.`,
          })
        }
      }

      // Per account: locked after too many wrong passwords, whatever the
      // address they come from. Checked before the password is.
      const email = ctx.path === PASSWORD_SIGN_IN ? emailOf(ctx.body) : null

      if (email) {
        const secondsLeft = await getLoginLockSeconds(email)

        if (secondsLeft > 0) {
          throw new APIError("TOO_MANY_REQUESTS", {
            message: loginLockedMessage(secondsLeft),
          })
        }
      }
    }),
    after: createAuthMiddleware(async (ctx) => {
      if (ctx.path !== PASSWORD_SIGN_IN) return

      const email = emailOf(ctx.body)
      if (!email) return

      const statusCode = (ctx.context.returned as { statusCode?: number } | undefined)
        ?.statusCode

      // 401 is a wrong email or password. Anything that is not an error, and
      // "email not verified" (403), means the password was right.
      if (statusCode === 401) {
        await recordFailedLogin(email)
      } else if (!statusCode || statusCode === 403) {
        await clearFailedLogins(email)
      }
    }),
  },

  emailAndPassword: {
    enabled: true,
    autoSignIn: true,
    // Password sign-in only works once the address is confirmed. Google and
    // GitHub sign-ins arrive already verified.
    requireEmailVerification: emailVerificationEnabled,
    // "Forgot your password?": the link opens /reset-password
    resetPasswordTokenExpiresIn: 60 * 60,
    sendResetPassword: async ({ user, url }) => {
      // A failure is only logged: the form answers the same either way, so
      // it does not reveal which addresses have an account
      await sendAuthEmail({
        to: user.email,
        subject: "Reset your RXJ password",
        intro: "We received a request to reset the password of your RXJ account. The link works for one hour.",
        linkText: "Choose a new password",
        url,
      })
    },
  },

  emailVerification: {
    sendOnSignUp: emailVerificationEnabled,
    // A sign-in attempt with an unverified address sends the link again
    sendOnSignIn: emailVerificationEnabled,
    autoSignInAfterVerification: true,
    sendVerificationEmail: async ({ user, url }) => {
      const sent = await sendAuthEmail({
        to: user.email,
        subject: "Confirm your email address",
        intro: "Welcome to RXJ. Confirm your email address to finish creating your account.",
        linkText: "Confirm your email address",
        url,
      })

      // The sign-up form shows this, so the user is not left waiting for
      // an email that will not arrive
      if (!sent) throw new Error("The verification email could not be sent")
    },
  },
  socialProviders: {
    github: {
      clientId: process.env.GITHUB_CLIENT_ID as string,
      clientSecret: process.env.GITHUB_CLIENT_SECRET as string,
    },
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID as string,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET as string,
    },
  },
  plugins: [
    // Authenticator-app codes (TOTP) and backup codes. Asked for after the
    // password; Google and GitHub sign-ins rely on the provider's own.
    twoFactor({
      issuer: "RXJ",
      // Accounts that only sign in with Google or GitHub have no password
      // to confirm with, and admins among them still have to enable it
      allowPasswordless: true,
    }),
    // Cloudflare Turnstile on password sign-up, when its keys are set. The
    // form sends the widget's answer in the x-captcha-response header.
    ...(turnstile
      ? [
          captcha({
            provider: "cloudflare-turnstile",
            secretKey: turnstile.secretKey,
            endpoints: [PASSWORD_SIGN_UP],
          }),
        ]
      : []),
    // After twoFactor on purpose: its hook has then already turned a
    // password sign-in that still needs a code into a "twoFactorRedirect"
    auditLogPlugin,
    polar({
      client: polarClient,
      createCustomerOnSignUp: true,
      use: [
        checkout({
          products: [
            {
              productId: process.env.POLAR_BEGINNER_PRODUCT_ID!,
              slug: "beginner",
            },
            {
              productId: process.env.POLAR_INTERMEDIATE_PRODUCT_ID!,
              slug: "intermediate",
            },
            {
              productId: process.env.POLAR_PRO_PRODUCT_ID!,
              slug: "pro",
            },
          ],
          successUrl: process.env.POLAR_SUCCESS_URL,
          authenticatedUsersOnly: true,
        }),
        portal(),
        // 💡 ADDED: The Webhooks sub-plugin configuration
        // The Webhooks sub-plugin configuration
        webhooks({
          secret: process.env.POLAR_WEBHOOK_SECRET!,
          onPayload: async ({ data, type }) => {
            console.log(`📦 Received Polar Event Type: ${type}`);

            // 1. Upgrade user when they subscribe or modify their plan
            if (type === "subscription.created" || type === "subscription.updated") {
              const customerEmail = data.customer?.email;
              const productId = data.product?.id; // 💡 Use the type-safe native ID property

              if (customerEmail && productId) {
                let dynamicPlan: SubscriptionPlan = "FREE";

                // Map the product ID to your respective Prisma plan enum string
                if (productId === process.env.POLAR_BEGINNER_PRODUCT_ID) {
                  dynamicPlan = "BEGINNER";
                } else if (productId === process.env.POLAR_INTERMEDIATE_PRODUCT_ID) {
                  dynamicPlan = "INTERMEDIATE";
                } else if (productId === process.env.POLAR_PRO_PRODUCT_ID) {
                  dynamicPlan = "PRO";
                }

                await prisma.user.update({
                  where: { email: customerEmail },
                  data: { plan: dynamicPlan },
                });

                console.log(`Database synced: Updated ${customerEmail} to ${dynamicPlan}.`);
              }
            }

            // 2. Downgrade user back to FREE if their plan expires or is revoked
            if (type === "subscription.revoked") {
              const customerEmail = data.customer?.email;
              if (customerEmail) {
                await prisma.user.update({
                  where: { email: customerEmail },
                  data: { plan: "FREE" },
                });
                console.log(`Database synced: Reverted ${customerEmail} to FREE.`);
              }
            }
          },
        }),
      ],
    }),
  ],
})