import { SettingsSection } from "@/features/settings/components/settings-section";
import { UsagePlanCard } from "@/features/subscription/components/usage-plan-card";

const Page = () => (
    <SettingsSection slug="usage">
        <UsagePlanCard />
    </SettingsSection>
);

export default Page;
