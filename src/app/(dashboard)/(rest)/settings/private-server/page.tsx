import { SettingsSection } from "@/features/settings/components/settings-section";
import { PrivateServerSection } from "@/features/settings/components/sections/private-server-section";

const Page = () => (
    <SettingsSection slug="private-server">
        <PrivateServerSection />
    </SettingsSection>
);

export default Page;
