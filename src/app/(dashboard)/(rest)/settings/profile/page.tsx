import { SettingsSection } from "@/features/settings/components/settings-section";
import { ProfileSection } from "@/features/settings/components/sections/profile-section";

const Page = () => (
    <SettingsSection slug="profile">
        <ProfileSection />
    </SettingsSection>
);

export default Page;
