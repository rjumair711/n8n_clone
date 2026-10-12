"use client";

import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { HistoryIcon } from "lucide-react";
import { toast } from "sonner";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
    Sheet,
    SheetContent,
    SheetDescription,
    SheetHeader,
    SheetTitle,
    SheetTrigger,
} from "@/components/ui/sheet";
import { useTRPC } from "@/trpc/client";
import {
    WORKFLOW_VERSION_DAYS,
    WORKFLOW_VERSION_LIMIT,
    formatVersionSummary,
} from "../lib/versions";

/**
 * The editor's History button: the saved versions of the workflow, what
 * changed in each, and Restore.
 */
export const VersionHistory = ({ workflowId }: { workflowId: string }) => {
    const trpc = useTRPC();
    const [open, setOpen] = useState(false);
    // The version the user is asked to confirm restoring
    const [restoring, setRestoring] = useState<{ id: string; number: number } | null>(null);

    const { data: versions, isLoading } = useQuery({
        ...trpc.workflows.getVersions.queryOptions({ id: workflowId }),
        enabled: open,
    });

    const restore = useMutation(
        trpc.workflows.restoreVersion.mutationOptions({
            onSuccess: (result) => {
                toast.success(`Version ${result.restoredNumber} restored as version ${result.number}`);
                // The canvas holds the workflow it was opened with: load it again
                window.location.reload();
            },
            onError: (error) => {
                toast.error(error.message);
                setRestoring(null);
            },
        })
    );

    return (
        <>
            <Sheet open={open} onOpenChange={setOpen}>
                <SheetTrigger asChild>
                    <Button size="sm" variant="outline" title="Version history">
                        <HistoryIcon className="size-4" />
                        History
                    </Button>
                </SheetTrigger>
                <SheetContent className="flex w-full flex-col gap-0 sm:max-w-md">
                    <SheetHeader>
                        <SheetTitle>Version history</SheetTitle>
                        <SheetDescription>
                            A version is kept every time a save changes the workflow: the
                            newest {WORKFLOW_VERSION_LIMIT}, for {WORKFLOW_VERSION_DAYS} days. Each
                            execution says which version it ran.
                        </SheetDescription>
                    </SheetHeader>

                    <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
                        {isLoading ? (
                            <p className="text-sm text-muted-foreground">Loading versions...</p>
                        ) : !versions || versions.length === 0 ? (
                            <p className="text-sm text-muted-foreground">
                                No versions yet. The first one is kept the next time you save
                                or run this workflow.
                            </p>
                        ) : (
                            <ul className="divide-y">
                                {versions.map((version) => (
                                    <li key={version.id} className="space-y-1.5 py-3">
                                        <div className="flex items-center justify-between gap-3">
                                            <div className="flex items-center gap-2">
                                                <span className="text-sm font-medium">
                                                    Version {version.number}
                                                </span>
                                                {version.current && <Badge variant="secondary">Current</Badge>}
                                            </div>
                                            {!version.current && (
                                                <Button
                                                    size="sm"
                                                    variant="outline"
                                                    disabled={restore.isPending}
                                                    onClick={() =>
                                                        setRestoring({ id: version.id, number: version.number })
                                                    }
                                                >
                                                    Restore
                                                </Button>
                                            )}
                                        </div>
                                        <p className="text-xs text-muted-foreground">
                                            {new Date(version.createdAt).toLocaleString()}
                                            {version.restoredFromNumber
                                                ? ` · restored from version ${version.restoredFromNumber}`
                                                : ""}
                                        </p>
                                        <ul className="space-y-0.5 text-xs">
                                            {formatVersionSummary(version.summary).map((line) => (
                                                <li key={line} className="break-words">
                                                    {line}
                                                </li>
                                            ))}
                                        </ul>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>
                </SheetContent>
            </Sheet>

            <AlertDialog open={!!restoring} onOpenChange={(next) => !next && setRestoring(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Restore version {restoring?.number}?</AlertDialogTitle>
                        <AlertDialogDescription>
                            The workflow&apos;s nodes and connections go back to what they were
                            in that version, and that is kept as a new version, so you can
                            come back to today&apos;s. Changes on the canvas that you have not
                            saved are lost. The workflow&apos;s name, its Active switch and its
                            settings do not change. A credential that was deleted since is
                            not put back on its node.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={restore.isPending}>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                            disabled={restore.isPending}
                            onClick={(event) => {
                                // Stays open until the restore has answered
                                event.preventDefault();
                                if (restoring) {
                                    restore.mutate({ id: workflowId, versionId: restoring.id });
                                }
                            }}
                        >
                            {restore.isPending ? "Restoring..." : "Restore"}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </>
    );
};
