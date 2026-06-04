import prisma from "@/lib/db";
import { SubscriptionPlan } from "@prisma/client";
import { NextResponse } from "next/server";

// 💡 Dynamically map the incoming Polar product IDs to your database plan strings
const WEBHOOK_PLAN_MAP: Record<string, string> = {
  [process.env.POLAR_BEGINNER_PRODUCT_ID ?? ""]: "BEGINNER",
  [process.env.POLAR_INTERMEDIATE_PRODUCT_ID ?? ""]: "INTERMEDIATE",
  [process.env.POLAR_PRO_PRODUCT_ID ?? ""]: "PRO",
};

export async function POST(req: Request) {
    try {
        const body = await req.json();

        // Polar payloads send the event type (e.g., 'subscription.created')
        const eventType = body.type;
        const eventData = body.data;

        console.log(`Received Polar webhook event: ${eventType}`);

        if (eventType === "subscription.created" || eventType === "subscription.updated") {
            // Extract the userId you passed into the checkout metadata/custom fields
            const userId = eventData.metadata?.userId || eventData.custom_fields?.userId;

            if (!userId) {
                console.error(" No userId found in Polar webhook event metadata.");
                return new NextResponse("Missing userId metadata", { status: 400 });
            }

            // 💡 1. Grab the product_id from Polar's event data payload
            const polarProductId = eventData.product_id;

            // 💡 2. Resolve the plan string name from our map
            const determinedPlan = WEBHOOK_PLAN_MAP[polarProductId];

            if (!determinedPlan) {
                console.error(`⚠️ Unknown or unmapped product ID received from Polar: ${polarProductId}`);
                return new NextResponse("Unknown product configuration mapping", { status: 400 });
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