import { SettingsSection } from "@/features/settings/components/settings-section";
import { ModelPricesSection } from "@/features/settings/components/sections/model-prices-section";

const Page = () => (
    <SettingsSection slug="model-prices">
        <ModelPricesSection />
    </SettingsSection>
);

export default Page;
