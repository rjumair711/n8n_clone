import { notFound } from "next/navigation";
import { SELF_HOSTED } from "@/config/self-hosted";
import { ManagedServersSection } from "@/features/settings/components/sections/managed-servers-section";

// Moved here from Settings → Platform → Managed servers
const Page = () => {
    if (SELF_HOSTED) notFound();

    return <ManagedServersSection />;
};

export default Page;
