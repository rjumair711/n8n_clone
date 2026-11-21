import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AdminNav } from "@/features/admin/components/admin-nav";
import { isAdmin } from "@/lib/admin";
import { requireAuth } from "@/lib/auth-utils";

export const metadata: Metadata = { title: "Admin", robots: { index: false } };

// The platform's admin area. Anyone else gets "not found": the pages do not
// say they exist. The data is checked again on the server (adminRouter).
const Layout = async ({ children }: { children: React.ReactNode }) => {
    const session = await requireAuth();
    if (!isAdmin(session.user)) notFound();

    return (
        <div className="mx-auto w-full max-w-6xl space-y-4 p-4 md:space-y-6 md:p-8">
            <div>
                <h1 className="text-lg font-semibold md:text-xl">Admin</h1>
                <p className="text-sm text-muted-foreground">
                    The platform: support messages, customers and what goes wrong.
                </p>
            </div>
            <AdminNav />
            {children}
        </div>
    );
};

export default Layout;
