import { LockIcon } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { getSettingsSection } from "../lib/sections";

/**
 * One section of Settings: its title and description (from the section
 * list), then its content.
 */
export const SettingsSection = ({
    slug,
    children,
}: {
    slug: string;
    children: React.ReactNode;
}) => {
    const section = getSettingsSection(slug);

    return (
        <section aria-labelledby={`settings-${slug}`} className="space-y-4">
            <div>
                <h2 id={`settings-${slug}`} className="text-lg font-semibold">
                    {section.title}
                </h2>
                <p className="text-sm text-muted-foreground">{section.description}</p>
            </div>
            {children}
        </section>
    );
};

/**
 * What a section shows when the user's role, the plan or a missing setting
 * keeps them from using it: a short reason instead of controls. The server
 * refuses the actions anyway; this only says so up front.
 */
export const SectionNote = ({
    title,
    children,
}: {
    title: string;
    children?: React.ReactNode;
}) => (
    <div className="flex items-start gap-3 rounded-lg border border-dashed p-4">
        <LockIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
        <div className="space-y-1">
            <p className="text-sm font-medium">{title}</p>
            {children && <div className="text-sm text-muted-foreground">{children}</div>}
        </div>
    </div>
);

/** A card-shaped placeholder while a section's data loads. */
export const SectionSkeleton = ({ rows = 3 }: { rows?: number }) => (
    <div className="space-y-4 rounded-xl border p-6" aria-busy="true" aria-label="Loading">
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-4 w-72 max-w-full" />
        <div className="space-y-3 pt-2">
            {Array.from({ length: rows }, (_, index) => (
                <Skeleton key={index} className="h-9 w-full" />
            ))}
        </div>
    </div>
);
