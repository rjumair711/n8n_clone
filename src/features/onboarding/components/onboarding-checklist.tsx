"use client";

import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2Icon, CircleIcon, XIcon } from "lucide-react";
import { useTRPC } from "@/trpc/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

/**
 * The getting-started checklist above the workflows list. Hidden once all
 * four steps are done or the person closes it.
 */
export const OnboardingChecklist = () => {
    const trpc = useTRPC();
    const queryClient = useQueryClient();
    const checklist = useQuery(trpc.onboarding.getChecklist.queryOptions());
    const dismiss = useMutation(trpc.onboarding.dismiss.mutationOptions({
        onSuccess: () => queryClient.invalidateQueries({ queryKey: trpc.onboarding.getChecklist.queryKey() }),
    }));

    const data = checklist.data;
    if (!data?.visible) return null;

    const next = data.steps.find((step) => !step.done);

    return (
        <Card className="shadow-none">
            <CardContent className="space-y-4">
                <div className="flex items-start justify-between gap-4">
                    <div>
                        <h2 className="font-semibold">Get started with RXJ</h2>
                        <p className="text-sm text-muted-foreground">
                            {data.completed} of {data.total} done
                        </p>
                    </div>
                    <Button
                        size="icon"
                        variant="ghost"
                        aria-label="Hide the checklist"
                        disabled={dismiss.isPending}
                        onClick={() => dismiss.mutate()}
                    >
                        <XIcon className="size-4" />
                    </Button>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden="true">
                    <div className="h-full bg-primary transition-all" style={{ width: `${(data.completed / data.total) * 100}%` }} />
                </div>
                <ol className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    {data.steps.map((step) => (
                        <li
                            key={step.id}
                            className={cn("rounded-lg border p-3", step.id === next?.id && "border-primary")}
                        >
                            <div className="flex items-center gap-2">
                                {step.done ? (
                                    <CheckCircle2Icon className="size-4 shrink-0 text-green-600" aria-label="Done" />
                                ) : (
                                    <CircleIcon className="size-4 shrink-0 text-muted-foreground" aria-label="Not done" />
                                )}
                                <span className={cn("text-sm font-medium", step.done && "text-muted-foreground line-through")}>
                                    {step.title}
                                </span>
                            </div>
                            <p className="mt-1 text-xs text-muted-foreground">{step.description}</p>
                            {!step.done && (
                                <Button asChild size="sm" variant={step.id === next?.id ? "default" : "outline"} className="mt-3">
                                    <Link href={step.href}>{step.action}</Link>
                                </Button>
                            )}
                        </li>
                    ))}
                </ol>
            </CardContent>
        </Card>
    );
};
