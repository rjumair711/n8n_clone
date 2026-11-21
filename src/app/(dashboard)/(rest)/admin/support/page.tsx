import { Suspense } from "react";
import { SupportInbox } from "@/features/admin/components/support-inbox";

// ?message=<id> opens that message (the link in the owner's email)
const Page = () => (
    <Suspense>
        <SupportInbox />
    </Suspense>
);

export default Page;
