import type { Metadata } from "next";
import { SupportPage } from "@/features/support/components/support-page";
import { requireAuth } from "@/lib/auth-utils";

export const metadata: Metadata = { title: "Support" };

const Page = async () => {
    await requireAuth();

    return <SupportPage />;
};

export default Page;
