import { SettingsSection } from "@/features/settings/components/settings-section";
import { GitSyncSection } from "@/features/settings/components/sections/enterprise-sections";

const Page = () => (
    <SettingsSection slug="git-sync">
        <GitSyncSection />
    </SettingsSection>
);

export default Page;
