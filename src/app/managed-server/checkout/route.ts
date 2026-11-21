import { NextResponse } from "next/server";
import { SELF_HOSTED } from "@/config/self-hosted";
import {
    getManagedServerCheckoutUrl,
    withCustomerEmail,
} from "@/config/pricing-plans";
import { getRequestSession } from "@/lib/request-session";

// Per request: the answer depends on who is signed in
export const dynamic = "force-dynamic";

// The pricing page's "Get your private server" button. A signed-in buyer
// gets their RXJ email filled in at Polar's checkout, so the server is
// linked to their account. Anyone else goes to the checkout as it is.
export async function GET(request: Request) {
    const home = new URL("/", request.url);
    if (SELF_HOSTED) return NextResponse.redirect(home);

    const checkoutUrl = getManagedServerCheckoutUrl();
    if (!checkoutUrl) return NextResponse.redirect(new URL("/pricing", request.url));

    const session = await getRequestSession().catch(() => null);

    return NextResponse.redirect(withCustomerEmail(checkoutUrl, session?.user?.email));
}
