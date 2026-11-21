import { SettingsSection } from "@/features/settings/components/settings-section";
import { ManagedServersSection } from "@/features/settings/components/sections/managed-servers-section";

const Page = () => (
    <SettingsSection slug="managed-servers">
        <ManagedServersSection />
    </SettingsSection>
);

export default Page;
