import { Skeleton } from "@/components/ui/skeleton";

const Loading = () => (
    <div className="mx-auto w-full max-w-3xl space-y-6 p-4 md:p-8" aria-busy="true">
        <div className="space-y-2">
            <Skeleton className="h-6 w-32" />
            <Skeleton className="h-4 w-96 max-w-full" />
        </div>
        {Array.from({ length: 4 }, (_, index) => (
            <Skeleton key={index} className="h-48 w-full rounded-xl" />
        ))}
    </div>
);

export default Loading;
