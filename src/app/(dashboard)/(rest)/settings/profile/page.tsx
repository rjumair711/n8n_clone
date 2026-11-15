import { SettingsSection } from "@/features/settings/components/settings-section";
import { ProfileSection } from "@/features/settings/components/sections/profile-section";
import { NotificationsCard } from "@/features/settings/components/notifications-card";

const Page = () => (
    <SettingsSection slug="profile">
        <div className="space-y-6">
            <ProfileSection />
            <NotificationsCard />
        </div>
    </SettingsSection>
);

export default Page;
