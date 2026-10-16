import { Skeleton } from "@/components/ui/skeleton";

const Loading = () => (
    <div className="mx-auto w-full max-w-6xl space-y-6 p-4 md:p-8" aria-busy="true">
        <div className="space-y-2">
            <Skeleton className="h-6 w-40" />
            <Skeleton className="h-4 w-80 max-w-full" />
        </div>
        <Skeleton className="h-9 w-full" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }, (_, index) => (
                <Skeleton key={index} className="h-40 w-full rounded-xl" />
            ))}
        </div>
    </div>
);

export default Loading;
