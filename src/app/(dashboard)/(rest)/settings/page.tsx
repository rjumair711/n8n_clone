import { redirect } from "next/navigation";
import { FIRST_SETTINGS_SECTION, settingsHref } from "@/features/settings/lib/sections";

// Old links to /settings open the first section
const Page = () => {
    redirect(settingsHref(FIRST_SETTINGS_SECTION.slug));
};

export default Page;
