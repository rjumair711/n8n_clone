"use client";

// "Build with AI" on the workflows list: describe a workflow, get a new one

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { LoaderCircle, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { useUpgradeModal } from "@/hooks/use-upgrade-modal";
import { useTRPC } from "@/trpc/client";
import { MAX_DESCRIPTION_LENGTH } from "../lib/prompt";
import { ModelPicker, Problems, loadCatalogue, useModelChoice } from "./builder-shared";

export const BuildWithAiButton = () => {
    const trpc = useTRPC();
    const router = useRouter();
    const queryClient = useQueryClient();
    const { handleError, modal } = useUpgradeModal();

    const [open, setOpen] = useState(false);
    const [description, setDescription] = useState("");
    const [errors, setErrors] = useState<string[]>([]);

    const model = useModelChoice(open);
    const createWorkflow = useMutation(trpc.aiBuilder.createWorkflow.mutationOptions());

    const handleBuild = async () => {
        setErrors([]);

        try {
            const result = await createWorkflow.mutateAsync({
                description,
                catalogue: await loadCatalogue(),
                model: model.input,
            });

            if (!result.ok) {
                setErrors(result.errors);
                return;
            }

            queryClient.invalidateQueries(trpc.workflows.getMany.queryOptions({}));
            toast.success(`Workflow "${result.name}" created. It is inactive until you activate it.`, {
                description: result.todo.length
                    ? `Still to set up: ${result.todo.join(" · ")}`
                    : result.summary || undefined,
                duration: 12000,
            });
            setOpen(false);
            setDescription("");
            router.push(`/workflows/${result.id}`);
        } catch (error) {
            // The plan's workflow limit opens the upgrade dialog
            if (handleError(error)) {
                setOpen(false);
                return;
            }

            toast.error(error instanceof Error ? error.message : "Could not build the workflow");
        }
    };

    return (
        <>
            {modal}
            <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
                <Sparkles className="size-4" />
                Build with AI
            </Button>
            <Dialog open={open} onOpenChange={(next) => !createWorkflow.isPending && setOpen(next)}>
                <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
                    <DialogHeader>
                        <DialogTitle>Build with AI</DialogTitle>
                        <DialogDescription>
                            Describe what the workflow should do. It is created inactive, with
                            its credentials left for you to pick.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4">
                        <Textarea
                            value={description}
                            onChange={(event) => setDescription(event.target.value)}
                            maxLength={MAX_DESCRIPTION_LENGTH}
                            rows={5}
                            placeholder="When someone submits a form with their name and email, add a row to a Google Sheet and send them a welcome email."
                        />
                        <ModelPicker state={model} />
                        <Problems errors={errors} />
                    </div>
                    <DialogFooter>
                        <Button
                            onClick={handleBuild}
                            disabled={
                                createWorkflow.isPending ||
                                description.trim().length < 3 ||
                                !model.ready
                            }
                        >
                            {createWorkflow.isPending ? (
                                <LoaderCircle className="size-4 animate-spin" />
                            ) : (
                                <Sparkles className="size-4" />
                            )}
                            {createWorkflow.isPending ? "Building (up to a minute)..." : "Build workflow"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    );
};
