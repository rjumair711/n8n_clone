import { SettingsNav } from "@/features/settings/components/settings-nav";
import { requireAuth } from "@/lib/auth-utils";

// Settings: its own menu, and one route per section under it, so only the
// open section loads (see src/features/settings/lib/sections.ts)
const Layout = async ({ children }: { children: React.ReactNode }) => {
    await requireAuth();

    return (
        <div className="mx-auto w-full max-w-6xl space-y-4 p-4 md:space-y-6 md:p-8">
            <div>
                <h1 className="text-lg font-semibold md:text-xl">Settings</h1>
                <p className="text-sm text-muted-foreground">
                    Your account, the workspace you work in, AI and enterprise features.
                </p>
            </div>
            <div className="flex flex-col gap-4 md:flex-row md:gap-10">
                <SettingsNav />
                <div className="min-w-0 max-w-3xl flex-1">{children}</div>
            </div>
        </div>
    );
};

export default Layout;
