import { SettingsSection } from "@/features/settings/components/settings-section";
import { DataTablesSection } from "@/features/data-tables/components/data-tables-section";

const Page = () => (
    <SettingsSection slug="data-tables">
        <DataTablesSection />
    </SettingsSection>
);

export default Page;
