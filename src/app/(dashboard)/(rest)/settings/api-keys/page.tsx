import { SettingsSection } from "@/features/settings/components/settings-section";
import { ApiKeysSection } from "@/features/settings/components/sections/api-keys-section";

const Page = () => (
    <SettingsSection slug="api-keys">
        <ApiKeysSection />
    </SettingsSection>
);

export default Page;
