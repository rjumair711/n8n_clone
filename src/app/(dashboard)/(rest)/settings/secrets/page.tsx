import { SettingsSection } from "@/features/settings/components/settings-section";
import { SecretsSection } from "@/features/settings/components/sections/enterprise-sections";

const Page = () => (
    <SettingsSection slug="secrets">
        <SecretsSection />
    </SettingsSection>
);

export default Page;
