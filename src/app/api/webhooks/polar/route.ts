import prisma from "@/lib/db";
import { verifyPolarWebhook } from "@/lib/polar-webhook";
import { SubscriptionPlan } from "@prisma/client";
import { NextResponse } from "next/server";
import { getCreditPacks, readCreditOrder } from "@/config/ai-credits";
import { grantCreditPurchase } from "@/lib/ai-credits";
import { SELF_HOSTED } from "@/config/self-hosted";

import { getPlanForPolarProduct } from "@/config/plans";

export async function POST(req: Request) {
    // A self-hosted server has no billing, so nothing may change a plan
    if (SELF_HOSTED) {
        return NextResponse.json({ succeeded: false, error: "Not found" }, { status: 404 });
    }

    try {
        // This route changes a user's plan, so nothing is read from a
        // request that Polar did not sign. The signature covers the exact
        // bytes Polar sent: the raw body is read before it is parsed.
        const rawBody = await req.text();

        const check = verifyPolarWebhook({
            rawBody,
            headers: req.headers,
            secret: process.env.POLAR_WEBHOOK_SECRET,
        });

        if (!check.ok) {
            return NextResponse.json(
                { succeeded: false, error: check.error },
                { status: check.status }
            );
        }

        const body = JSON.parse(rawBody);

        // Polar payloads send the event type (e.g., 'subscription.created')
        const eventType = body.type;
        const eventData = body.data;

        console.log(`Received Polar webhook event: ${eventType}`);

        // A paid order of an AI credit pack adds its credits, once per order
        const creditOrder = readCreditOrder(eventType, eventData, getCreditPacks());
        if (creditOrder) {
            const added = await grantCreditPurchase(creditOrder);
            console.log(
                added
                    ? `Added ${creditOrder.pack.credits} AI credits to user ${creditOrder.userId}.`
                    : `Polar order ${creditOrder.orderId} was already counted.`
            );
        }

        if (eventType === "subscription.created" || eventType === "subscription.updated") {
            // Only the plan products change a plan. Any other subscription
            // (the managed private server) is answered with success, so
            // Polar does not retry it or count it as a failing endpoint
            const determinedPlan = getPlanForPolarProduct(eventData.product_id);

            if (!determinedPlan) {
                return NextResponse.json({ succeeded: true, skipped: "not a plan product" });
            }

            // Extract the userId you passed into the checkout metadata/custom fields
            const userId = eventData.metadata?.userId || eventData.custom_fields?.userId;

            if (!userId) {
                console.error(" No userId found in Polar webhook event metadata.");
                return new NextResponse("Missing userId metadata", { status: 400 });
            }

            // Update the user profile tier matching your Prisma configuration dynamically
            await prisma.user.update({
                where: { id: userId },
                data: {
                    plan: determinedPlan as SubscriptionPlan, // 💡 Dynamically saves "BEGINNER", "INTERMEDIATE", or "PRO"
                },
            });

            console.log(`Successfully upgraded user ${userId} to ${determinedPlan} plan.`);
        }

        return NextResponse.json({ succeeded: true });
    } catch (error) {
        console.error("Polar Webhook processing failure:", error);
        return new NextResponse("Internal Hook Error", { status: 500 });
    }
}