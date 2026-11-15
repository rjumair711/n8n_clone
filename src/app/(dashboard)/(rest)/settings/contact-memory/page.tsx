import { SettingsSection } from "@/features/settings/components/settings-section";
import { ContactMemorySection } from "@/features/memory/components/contact-memory-section";

const Page = () => (
    <SettingsSection slug="contact-memory">
        <ContactMemorySection />
    </SettingsSection>
);

export default Page;
