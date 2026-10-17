import { SettingsSection } from "@/features/settings/components/settings-section";
import { AuditLogCard } from "@/features/settings/components/audit-log-card";

const Page = () => (
    <SettingsSection slug="audit-log">
        <AuditLogCard />
    </SettingsSection>
);

export default Page;
