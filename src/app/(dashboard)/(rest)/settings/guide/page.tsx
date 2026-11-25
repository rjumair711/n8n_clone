import { SELF_HOSTED } from "@/config/self-hosted";
import { NODE_COUNT } from "@/features/marketing/lib/content";
import { SettingsSection } from "@/features/settings/components/settings-section";
import { GuideSection } from "@/features/settings/components/sections/guide-section";
import { buildGuide } from "@/features/settings/lib/guide-content";

// The guide is built here, on the server, so the node count (from the
// schema) and what this server offers are read once
const Page = () => (
    <SettingsSection slug="guide">
        <GuideSection chapters={buildGuide({ nodeCount: NODE_COUNT, selfHosted: SELF_HOSTED })} />
    </SettingsSection>
);

export default Page;
