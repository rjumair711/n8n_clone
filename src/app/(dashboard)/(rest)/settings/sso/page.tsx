import { SettingsSection } from "@/features/settings/components/settings-section";
import { SsoSection } from "@/features/settings/components/sections/enterprise-sections";

const Page = () => (
    <SettingsSection slug="sso">
        <SsoSection />
    </SettingsSection>
);

export default Page;
