import { SettingsSection } from "@/features/settings/components/settings-section";
import { WorkspaceMembersCard } from "@/features/workspaces/components/workspace-card";

const Page = () => (
    <SettingsSection slug="members">
        <WorkspaceMembersCard />
    </SettingsSection>
);

export default Page;
