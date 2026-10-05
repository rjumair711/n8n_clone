import { betterAuth } from "better-auth"
import { prismaAdapter } from "better-auth/adapters/prisma"
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

export const auth = betterAuth({
  database: prismaAdapter(prisma, {
    provider: "postgresql",
  }),

  databaseHooks: {
    user: {
      create: {
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