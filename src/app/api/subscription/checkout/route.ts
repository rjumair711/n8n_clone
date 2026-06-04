import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { Polar } from "@polar-sh/sdk";

// Initialize the Polar SDK client
const polar = new Polar({
  accessToken: process.env.POLAR_ACCESS_TOKEN ?? "",
  // 💡 Tip: If you are using a Polar Sandbox organization for local testing, 
  // uncomment the next line:
  server: "sandbox", 
});

// Map the plan slugs to your exact environment variables
const PLAN_PRODUCT_IDS: Record<string, string | undefined> = {
  beginner: process.env.POLAR_BEGINNER_PRODUCT_ID, 
  intermediate: process.env.POLAR_INTERMEDIATE_PRODUCT_ID,
  pro: process.env.POLAR_PRO_PRODUCT_ID,
};

export async function POST(req: Request) {
  try {
    // 1. Authenticate user session
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (!session?.user) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    // 2. Parse the plan payload from frontend
    const body = await req.json();
    const { planSlug } = body;

    const productId = PLAN_PRODUCT_IDS[planSlug?.toLowerCase()];

    if (!productId) {
      return NextResponse.json(
        { error: "Invalid plan selection or product configuration missing" },
        { status: 400 }
      );
    }

    // 3. Create a live checkout session using Polar API
    const checkoutSession = await polar.checkouts.create({
      products: [productId],
      successUrl: process.env.POLAR_SUCCESS_URL || "http://localhost:3000/workflows?redirect=polar",
      customerEmail: session.user.email,
      metadata: {
        userId: session.user.id, // 💡 Essential payload for your incoming webhook matching logic
      },
    });
    
    // 4. Send the authentic dynamic checkout link back to the pricing button
    return NextResponse.json({ url: checkoutSession.url });

  } catch (error) {
    console.error("Polar Checkout Creation Error:", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 }
    );
  }
}