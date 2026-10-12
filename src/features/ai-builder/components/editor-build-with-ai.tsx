"use client";

// "Build with AI" in the editor: build on an empty canvas, or change the
// workflow that is there

import { useEffect, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useReactFlow, type Edge, type Node } from "@xyflow/react";
import { LoaderCircle, Sparkles, Undo2 } from "lucide-react";
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
import { useTRPC } from "@/trpc/client";
import { MAX_DESCRIPTION_LENGTH, MAX_HISTORY } from "../lib/prompt";
import {
    ModelPicker,
    Problems,
    Todo,
    loadCatalogue,
    useModelChoice,
} from "./builder-shared";

type Turn = {
    request: string;
    summary: string;
    todo: string[];
};

const isEmptyCanvas = (nodes: Node[]) =>
    nodes.every((node) => node.type === "INITIAL");

export const EditorBuildWithAi = () => {
    const trpc = useTRPC();
    const { getNodes, getEdges, setNodes, setEdges, fitView } = useReactFlow();

    const [open, setOpen] = useState(false);
    const [description, setDescription] = useState("");
    const [errors, setErrors] = useState<string[]>([]);
    // What was asked in this session, for follow-ups ("send it on WhatsApp
    // instead"); gone when the page is left
    const [turns, setTurns] = useState<Turn[]>([]);
    // The canvas as it was before the last change, for Undo
    const [previous, setPrevious] = useState<{ nodes: Node[]; edges: Edge[] } | null>(null);
    const [editing, setEditing] = useState(false);

    const model = useModelChoice(open);
    const generate = useMutation(trpc.aiBuilder.generate.mutationOptions());

    useEffect(() => {
        if (open) setEditing(!isEmptyCanvas(getNodes()));
    }, [open, getNodes]);

    const handleBuild = async () => {
        setErrors([]);

        const before = { nodes: getNodes(), edges: getEdges() };

        try {
            const result = await generate.mutateAsync({
                description,
                catalogue: await loadCatalogue(),
                model: model.input,
                current: {
                    nodes: before.nodes.flatMap((node) =>
                        node.type
                            ? [{
                                id: node.id,
                                type: node.type,
                                position: node.position,
                                data: node.data ?? {},
                            }]
                            : []
                    ),
                    edges: before.edges.map((edge) => ({
                        source: edge.source,
                        target: edge.target,
                        sourceHandle: edge.sourceHandle,
                        targetHandle: edge.targetHandle,
                    })),
                },
                history: turns.slice(-MAX_HISTORY).map((turn) => turn.request),
            });

            if (!result.ok) {
                setErrors(result.errors);
                return;
            }

            const { graph } = result;

            // A node that was kept stays the same node on the canvas, with
            // whatever the editor holds for it (its stored credential)
            setNodes(
                graph.nodes.map((node) => ({
                    ...before.nodes.find((existing) => existing.id === node.id),
                    ...node,
                }))
            );
            setEdges(graph.edges);
            setTimeout(() => fitView({ padding: 0.2, duration: 300 }), 50);

            setPrevious(before);
            setTurns((current) => [
                ...current,
                { request: description.trim(), summary: graph.summary, todo: graph.todo },
            ]);
            setDescription("");
            setEditing(true);
            toast.success(
                editing ? "Workflow changed. Review it, then Save." : "Workflow built. Review it, then Save.",
                { description: graph.summary || undefined, duration: 10000 }
            );
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "Could not build the workflow");
        }
    };

    const handleUndo = () => {
        if (!previous) return;

        setNodes(previous.nodes);
        setEdges(previous.edges);
        setPrevious(null);
        setTurns((current) => current.slice(0, -1));
        setEditing(!isEmptyCanvas(previous.nodes));
        toast.success("Last AI change undone");
    };

    const lastTurn = turns[turns.length - 1];

    return (
        <>
            <Button
                onClick={() => setOpen(true)}
                size="sm"
                variant="outline"
                className="bg-background"
                title="Build or change this workflow by describing it"
            >
                <Sparkles className="size-4" />
                Build with AI
            </Button>
            <Dialog open={open} onOpenChange={(next) => !generate.isPending && setOpen(next)}>
                <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
                    <DialogHeader>
                        <DialogTitle>Build with AI</DialogTitle>
                        <DialogDescription>
                            {editing
                                ? "Describe the change. Nodes you do not mention keep their settings and credentials. Nothing is saved until you click Save."
                                : "Describe what the workflow should do. Nothing is saved until you click Save, and the workflow stays inactive."}
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4">
                        {lastTurn && (
                            <div className="space-y-2 rounded-md border bg-muted/40 p-3 text-sm">
                                <p>
                                    <span className="font-medium">Last request:</span> {lastTurn.request}
                                </p>
                                {lastTurn.summary && (
                                    <p className="text-muted-foreground">{lastTurn.summary}</p>
                                )}
                                <Todo items={lastTurn.todo} />
                                {previous && (
                                    <Button
                                        size="sm"
                                        variant="outline"
                                        onClick={handleUndo}
                                        disabled={generate.isPending}
                                    >
                                        <Undo2 className="size-4" />
                                        Undo this change
                                    </Button>
                                )}
                            </div>
                        )}
                        <Textarea
                            value={description}
                            onChange={(event) => setDescription(event.target.value)}
                            maxLength={MAX_DESCRIPTION_LENGTH}
                            rows={4}
                            placeholder={
                                editing
                                    ? "Send it on WhatsApp instead of email."
                                    : "Every morning at 9, read an RSS feed and post the new items to Slack."
                            }
                        />
                        <ModelPicker state={model} />
                        <Problems errors={errors} />
                    </div>
                    <DialogFooter>
                        <Button
                            onClick={handleBuild}
                            disabled={
                                generate.isPending ||
                                description.trim().length < 3 ||
                                !model.ready
                            }
                        >
                            {generate.isPending ? (
                                <LoaderCircle className="size-4 animate-spin" />
                            ) : (
                                <Sparkles className="size-4" />
                            )}
                            {generate.isPending
                                ? "Working (up to a minute)..."
                                : editing
                                    ? "Change workflow"
                                    : "Build workflow"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    );
};
