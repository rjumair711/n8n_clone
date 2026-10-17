import { Skeleton } from "@/components/ui/skeleton";
import { SectionSkeleton } from "@/features/settings/components/settings-section";

// Shown in the section area while a section's page loads: the menu next to
// it stays where it is
const Loading = () => (
    <div className="space-y-4" aria-busy="true">
        <div className="space-y-2">
            <Skeleton className="h-6 w-40" />
            <Skeleton className="h-4 w-80 max-w-full" />
        </div>
        <SectionSkeleton rows={4} />
    </div>
);

export default Loading;
