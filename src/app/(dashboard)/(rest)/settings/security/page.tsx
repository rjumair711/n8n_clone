import { SettingsSection } from "@/features/settings/components/settings-section";
import { SecuritySection } from "@/features/settings/components/sections/security-section";

const Page = () => (
    <SettingsSection slug="security">
        <SecuritySection />
    </SettingsSection>
);

export default Page;
