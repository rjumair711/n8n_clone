import { SettingsSection } from "@/features/settings/components/settings-section";
import { WorkspaceGeneralCard } from "@/features/workspaces/components/workspace-card";

const Page = () => (
    <SettingsSection slug="workspace">
        <WorkspaceGeneralCard />
    </SettingsSection>
);

export default Page;
