import { betterAuth } from "better-auth"
import { prismaAdapter } from "better-auth/adapters/prisma"
import prisma from "./db"
// 💡 Added 'webhooks' to the import line below
import { checkout, polar, portal, webhooks } from "@polar-sh/better-auth"
import { polarClient } from "./polar"
import { SubscriptionPlan } from "@prisma/client"

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

  trustedOrigins: [
    "http://localhost:3000",
    "https://n8n-clone-nine.vercel.app",
    "https://cringe-overhaul-marsupial.ngrok-free.dev",
  ],

  emailAndPassword: {
    enabled: true,
    autoSignIn: true,
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