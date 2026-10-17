import { SettingsSection } from "@/features/settings/components/settings-section";
import { AiBudgetsSection } from "@/features/settings/components/sections/ai-budgets-section";

const Page = () => (
    <SettingsSection slug="ai-budgets">
        <AiBudgetsSection />
    </SettingsSection>
);

export default Page;
