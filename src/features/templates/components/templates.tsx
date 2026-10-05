"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { SubscriptionPlan } from "@prisma/client";
import {
    EyeOffIcon,
    LayoutTemplateIcon,
    LockIcon,
    PencilIcon,
    PlusIcon,
    SearchIcon,
    TrashIcon,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { useTRPC } from "@/trpc/client";
import { getNodeLabel } from "@/config/node-labels";
import { UpgradeModal } from "@/components/upgrade-modal";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
    Card,
    CardContent,
    CardDescription,
    CardFooter,
    CardHeader,
    CardTitle,
} from "@/components/ui/card";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { PLAN_NAMES } from "../lib/template-data";

// Triggers and plumbing say little about what a template does
const HIDDEN_BADGE_TYPES = new Set(["MANUAL_TRIGGER", "INITIAL", "SET_VARIABLE", "MERGE"]);
const MAX_BADGES = 5;

type TemplateForm = {
    id?: string;
    workflowId: string;
    name: string;
    description: string;
    category: string;
    minPlan: SubscriptionPlan;
    published: boolean;
};

const emptyForm: TemplateForm = {
    workflowId: "",
    name: "",
    description: "",
    category: "General",
    minPlan: SubscriptionPlan.FREE,
    published: true,
};

export const Templates = () => {
    const trpc = useTRPC();
    const queryClient = useQueryClient();
    const router = useRouter();

    const { data, isLoading } = useQuery(trpc.templates.getMany.queryOptions());
    const isAdmin = !!data?.isAdmin;

    const [search, setSearch] = useState("");
    const [category, setCategory] = useState("All");
    const [upgradeOpen, setUpgradeOpen] = useState(false);
    const [form, setForm] = useState<TemplateForm | null>(null);

    // Only fetched for admins, when the dialog is open
    const { data: sourceWorkflows } = useQuery({
        ...trpc.templates.getSourceWorkflows.queryOptions(),
        enabled: isAdmin && !!form,
    });

    const refresh = () =>
        queryClient.invalidateQueries(trpc.templates.getMany.queryOptions());

    const applyTemplate = useMutation(
        trpc.templates.use.mutationOptions({
            onSuccess: (workflow) => {
                toast.success(`"${workflow.name}" added to your workflows`);
                queryClient.invalidateQueries(trpc.workflows.getMany.queryOptions({}));
                router.push(`/workflows/${workflow.id}`);
            },
            onError: (error) => toast.error(error.message),
        })
    );

    const saved = {
        onSuccess: () => {
            toast.success("Template saved");
            setForm(null);
            refresh();
        },
        onError: (error: { message: string }) => toast.error(error.message),
    };

    const createTemplate = useMutation(trpc.templates.create.mutationOptions(saved));
    const updateTemplate = useMutation(trpc.templates.update.mutationOptions(saved));

    const removeTemplate = useMutation(
        trpc.templates.remove.mutationOptions({
            onSuccess: () => {
                toast.success("Template deleted");
                refresh();
            },
            onError: (error) => toast.error(error.message),
        })
    );

    const items = data?.items ?? [];

    const categories = useMemo(
        () => ["All", ...new Set(items.map((item) => item.category))],
        [items]
    );

    const visible = items.filter((item) => {
        const query = search.trim().toLowerCase();

        return (
            (category === "All" || item.category === category) &&
            (!query ||
                item.name.toLowerCase().includes(query) ||
                item.description.toLowerCase().includes(query) ||
                item.nodeTypes.some((type) => getNodeLabel(type).toLowerCase().includes(query)))
        );
    });

    const submitForm = () => {
        if (!form) return;

        const fields = {
            name: form.name,
            description: form.description,
            category: form.category,
            minPlan: form.minPlan,
            published: form.published,
        };

        if (form.id) {
            updateTemplate.mutate({
                id: form.id,
                ...fields,
                // Empty: keep the template's current content
                ...(form.workflowId ? { workflowId: form.workflowId } : {}),
            });
        } else {
            createTemplate.mutate({ workflowId: form.workflowId, ...fields });
        }
    };

    const formValid =
        !!form &&
        !!form.name.trim() &&
        !!form.description.trim() &&
        !!form.category.trim() &&
        (!!form.id || !!form.workflowId);

    return (
        <div className="mx-auto w-full max-w-6xl space-y-6 p-4 md:p-8">
            <UpgradeModal open={upgradeOpen} onOpenChange={setUpgradeOpen} />

            <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                    <h1 className="text-lg font-semibold md:text-xl">Templates</h1>
                    <p className="text-sm text-muted-foreground">
                        Ready-made workflows. Pick one, connect your own accounts, and run it.
                    </p>
                </div>
                {isAdmin && (
                    <Button onClick={() => setForm({ ...emptyForm })}>
                        <PlusIcon className="size-4" />
                        New template
                    </Button>
                )}
            </div>

            <div className="flex flex-wrap items-center gap-3">
                <div className="relative w-full max-w-xs">
                    <SearchIcon className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                        className="pl-9"
                        placeholder="Search templates"
                        value={search}
                        onChange={(event) => setSearch(event.target.value)}
                    />
                </div>
                <div className="flex flex-wrap gap-2">
                    {categories.map((name) => (
                        <Button
                            key={name}
                            size="sm"
                            variant={category === name ? "default" : "outline"}
                            onClick={() => setCategory(name)}
                        >
                            {name}
                        </Button>
                    ))}
                </div>
            </div>

            {isLoading ? (
                <p className="text-sm text-muted-foreground">Loading templates...</p>
            ) : visible.length === 0 ? (
                <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed py-16 text-center">
                    <LayoutTemplateIcon className="size-8 text-muted-foreground/40" />
                    <p className="text-sm text-muted-foreground">
                        {items.length === 0
                            ? isAdmin
                                ? "No templates yet. Build a workflow, then publish it with New template."
                                : "No templates yet. Check back soon."
                            : "No templates match your search."}
                    </p>
                </div>
            ) : (
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {visible.map((template) => {
                        const badges = template.nodeTypes.filter(
                            (type) => !HIDDEN_BADGE_TYPES.has(type)
                        );

                        return (
                            <Card key={template.id} className="flex flex-col shadow-none">
                                <CardHeader>
                                    <div className="flex items-start justify-between gap-2">
                                        <CardTitle className="text-base">{template.name}</CardTitle>
                                        <Badge variant={template.minPlan === "FREE" ? "secondary" : "default"}>
                                            {template.locked && <LockIcon className="size-3" />}
                                            {PLAN_NAMES[template.minPlan]}
                                        </Badge>
                                    </div>
                                    <CardDescription>{template.category}</CardDescription>
                                </CardHeader>
                                <CardContent className="flex-1 space-y-3">
                                    <p className="text-sm text-muted-foreground">{template.description}</p>
                                    <div className="flex flex-wrap gap-1.5">
                                        {badges.slice(0, MAX_BADGES).map((type) => (
                                            <Badge key={type} variant="outline" className="font-normal">
                                                {getNodeLabel(type)}
                                            </Badge>
                                        ))}
                                        {badges.length > MAX_BADGES && (
                                            <Badge variant="outline" className="font-normal">
                                                +{badges.length - MAX_BADGES}
                                            </Badge>
                                        )}
                                    </div>
                                    {isAdmin && (
                                        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                                            {!template.published && (
                                                <>
                                                    <EyeOffIcon className="size-3" /> Hidden &bull;{" "}
                                                </>
                                            )}
                                            Used {template.useCount} time{template.useCount === 1 ? "" : "s"}
                                        </p>
                                    )}
                                </CardContent>
                                <CardFooter className="gap-2">
                                    <Button
                                        className="flex-1"
                                        variant={template.locked ? "outline" : "default"}
                                        disabled={applyTemplate.isPending}
                                        onClick={() =>
                                            template.locked
                                                ? setUpgradeOpen(true)
                                                : applyTemplate.mutate({ id: template.id })
                                        }
                                    >
                                        {template.locked ? (
                                            <>
                                                <LockIcon className="size-4" />
                                                Upgrade to use
                                            </>
                                        ) : (
                                            "Use template"
                                        )}
                                    </Button>
                                    {isAdmin && (
                                        <>
                                            <Button
                                                size="icon"
                                                variant="ghost"
                                                title="Edit template"
                                                onClick={() =>
                                                    setForm({
                                                        id: template.id,
                                                        workflowId: "",
                                                        name: template.name,
                                                        description: template.description,
                                                        category: template.category,
                                                        minPlan: template.minPlan,
                                                        published: template.published,
                                                    })
                                                }
                                            >
                                                <PencilIcon className="size-4" />
                                            </Button>
                                            <Button
                                                size="icon"
                                                variant="ghost"
                                                title="Delete template"
                                                disabled={removeTemplate.isPending}
                                                onClick={() => removeTemplate.mutate({ id: template.id })}
                                            >
                                                <TrashIcon className="size-4" />
                                            </Button>
                                        </>
                                    )}
                                </CardFooter>
                            </Card>
                        );
                    })}
                </div>
            )}

            <Dialog open={!!form} onOpenChange={(open) => !open && setForm(null)}>
                <DialogContent className="max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle>{form?.id ? "Edit template" : "New template"}</DialogTitle>
                        <DialogDescription>
                            A template is a copy of one of your workflows. Credentials,
                            webhook secrets and Slack or Discord webhook URLs are removed
                            from the copy. Check the workflow for anything else private,
                            such as keys typed into headers or prompts, before publishing.
                        </DialogDescription>
                    </DialogHeader>

                    {form && (
                        <div className="space-y-4">
                            <div className="space-y-2">
                                <Label>{form.id ? "Replace content with workflow (optional)" : "Workflow"}</Label>
                                <Select
                                    value={form.workflowId}
                                    onValueChange={(workflowId) => {
                                        const picked = sourceWorkflows?.find((workflow) => workflow.id === workflowId);

                                        setForm({
                                            ...form,
                                            workflowId,
                                            // A new template starts with the workflow's name
                                            name: form.name || picked?.name || "",
                                        });
                                    }}
                                >
                                    <SelectTrigger className="w-full">
                                        <SelectValue
                                            placeholder={
                                                form.id ? "Keep the current content" : "Select one of your workflows"
                                            }
                                        />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {sourceWorkflows?.map((workflow) => (
                                            <SelectItem key={workflow.id} value={workflow.id}>
                                                {workflow.name}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                                <p className="text-xs text-muted-foreground">
                                    The saved version of the workflow is used. Later changes to
                                    the workflow do not change the template.
                                </p>
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="template-name">Name</Label>
                                <Input
                                    id="template-name"
                                    placeholder="WhatsApp support bot"
                                    value={form.name}
                                    onChange={(event) => setForm({ ...form, name: event.target.value })}
                                />
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="template-description">Description</Label>
                                <Textarea
                                    id="template-description"
                                    placeholder="What it does, and what the user has to connect to make it work."
                                    value={form.description}
                                    onChange={(event) => setForm({ ...form, description: event.target.value })}
                                />
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label htmlFor="template-category">Category</Label>
                                    <Input
                                        id="template-category"
                                        placeholder="AI Agents"
                                        value={form.category}
                                        onChange={(event) => setForm({ ...form, category: event.target.value })}
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label>Available From Plan</Label>
                                    <Select
                                        value={form.minPlan}
                                        onValueChange={(minPlan) =>
                                            setForm({ ...form, minPlan: minPlan as SubscriptionPlan })
                                        }
                                    >
                                        <SelectTrigger className="w-full">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {Object.values(SubscriptionPlan).map((plan) => (
                                                <SelectItem key={plan} value={plan}>
                                                    {PLAN_NAMES[plan]}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                            </div>

                            <div className="flex items-center justify-between gap-4 rounded-md border p-3">
                                <div>
                                    <Label htmlFor="template-published">Published</Label>
                                    <p className="text-xs text-muted-foreground">
                                        Hidden templates are only visible to you.
                                    </p>
                                </div>
                                <Switch
                                    id="template-published"
                                    checked={form.published}
                                    onCheckedChange={(published) => setForm({ ...form, published })}
                                />
                            </div>
                        </div>
                    )}

                    <DialogFooter>
                        <Button
                            disabled={!formValid || createTemplate.isPending || updateTemplate.isPending}
                            onClick={submitForm}
                        >
                            {form?.id ? "Save changes" : "Publish template"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
};
