"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { SubscriptionPlan } from "@prisma/client";
import {
    EyeOffIcon,
    LanguagesIcon,
    LayoutTemplateIcon,
    LockIcon,
    PencilIcon,
    PlusIcon,
    SearchIcon,
    TrashIcon,
} from "lucide-react";
import Link from "next/link";
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
import { Checkbox } from "@/components/ui/checkbox";
import { PLAN_NAMES } from "../lib/template-data";
import {
    DEFAULT_TEMPLATE_LANGUAGE,
    TEMPLATE_LANGUAGES,
    getTemplateLanguage,
    isTemplateLanguage,
    type TemplateLanguage,
} from "../lib/template-languages";
import type { TemplateSecretFinding } from "../lib/template-secrets";

// Triggers and plumbing say little about what a template does
const HIDDEN_BADGE_TYPES = new Set(["MANUAL_TRIGGER", "INITIAL", "SET_VARIABLE", "MERGE"]);
const MAX_BADGES = 5;

type TemplateForm = {
    id?: string;
    workflowId: string;
    name: string;
    description: string;
    category: string;
    language: TemplateLanguage;
    minPlan: SubscriptionPlan;
    published: boolean;
};

const emptyForm: TemplateForm = {
    workflowId: "",
    name: "",
    description: "",
    category: "General",
    language: DEFAULT_TEMPLATE_LANGUAGE,
    minPlan: SubscriptionPlan.FREE,
    published: true,
};

export const Templates = () => {
    const trpc = useTRPC();
    const queryClient = useQueryClient();
    const router = useRouter();

    const { data, isLoading } = useQuery(trpc.templates.getMany.queryOptions());
    // An admin without two-factor gets a note instead of the admin buttons:
    // the server refuses those actions until it is turned on
    const needsTwoFactor = !!data?.needsTwoFactor;
    const isAdmin = !!data?.isAdmin && !needsTwoFactor;

    const [search, setSearch] = useState("");
    const [category, setCategory] = useState("All");
    // "all", or the language of the templates shown
    const [language, setLanguage] = useState("all");
    // ADMIN: the starter templates dialog, what is ticked in it, and whether
    // they are added published
    const [startersOpen, setStartersOpen] = useState(false);
    const [starterIds, setStarterIds] = useState<string[]>([]);
    const [startersPublished, setStartersPublished] = useState(false);
    const [upgradeOpen, setUpgradeOpen] = useState(false);
    const [form, setForm] = useState<TemplateForm | null>(null);
    // What the secret scan found when the last save was blocked, and whether
    // the admin ticked "I checked this, publish anyway"
    const [findings, setFindings] = useState<TemplateSecretFinding[] | null>(null);
    const [confirmSecrets, setConfirmSecrets] = useState(false);

    const clearFindings = () => {
        setFindings(null);
        setConfirmSecrets(false);
    };

    const openForm = (next: TemplateForm | null) => {
        clearFindings();
        setForm(next);
    };

    // Only fetched for admins, when the dialog is open
    const { data: sourceWorkflows } = useQuery({
        ...trpc.templates.getSourceWorkflows.queryOptions(),
        enabled: isAdmin && !!form,
    });

    const refresh = () =>
        queryClient.invalidateQueries(trpc.templates.getMany.queryOptions());

    const { data: starters } = useQuery({
        ...trpc.templates.getStarters.queryOptions(),
        enabled: isAdmin && startersOpen,
    });

    const addStarters = useMutation(
        trpc.templates.addStarters.mutationOptions({
            onSuccess: (result) => {
                toast.success(
                    `${result.added} starter template${result.added === 1 ? "" : "s"} added${result.skipped ? `, ${result.skipped} already there` : ""}`
                );
                setStartersOpen(false);
                setStarterIds([]);
                refresh();
                queryClient.invalidateQueries(trpc.templates.getStarters.queryOptions());
            },
            onError: (error) => toast.error(error.message),
        })
    );

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
        onSuccess: (
            result: { saved: true } | { saved: false; findings: TemplateSecretFinding[] }
        ) => {
            // Blocked by the secret scan: the dialog stays open and lists why
            if (!result.saved) {
                setFindings(result.findings);
                setConfirmSecrets(false);
                return;
            }

            toast.success("Template saved");
            openForm(null);
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

    // Only the languages the gallery has templates in
    const languages = TEMPLATE_LANGUAGES.filter((entry) =>
        items.some((item) => getTemplateLanguage(item.language).value === entry.value)
    );

    const visible = items.filter((item) => {
        const query = search.trim().toLowerCase();

        return (
            (category === "All" || item.category === category) &&
            (language === "all" || getTemplateLanguage(item.language).value === language) &&
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
            language: form.language,
            minPlan: form.minPlan,
            published: form.published,
            ...(findings && confirmSecrets ? { confirmSecrets: true } : {}),
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
                    <div className="flex flex-wrap gap-2">
                        <Button variant="outline" onClick={() => setStartersOpen(true)}>
                            <LanguagesIcon className="size-4" />
                            Starter templates
                        </Button>
                        <Button onClick={() => openForm({ ...emptyForm })}>
                            <PlusIcon className="size-4" />
                            New template
                        </Button>
                    </div>
                )}
            </div>

            {needsTwoFactor && (
                <div className="rounded-md border border-amber-500/50 bg-amber-500/5 p-3 text-sm">
                    Turn on two-factor authentication to publish, edit and delete templates.{" "}
                    <Link href="/settings" className="underline underline-offset-4">
                        Open Settings
                    </Link>
                </div>
            )}

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
                {languages.length > 1 && (
                    <Select value={language} onValueChange={setLanguage}>
                        <SelectTrigger className="w-44" aria-label="Language">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">All languages</SelectItem>
                            {languages.map((entry) => (
                                <SelectItem key={entry.value} value={entry.value}>
                                    {entry.label}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                )}
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
                        // Urdu and Arabic read right to left
                        const written = getTemplateLanguage(template.language);

                        return (
                            <Card key={template.id} className="flex flex-col shadow-none">
                                <CardHeader>
                                    <div className="flex items-start justify-between gap-2">
                                        <CardTitle className="text-base" lang={written.value} dir={written.dir}>
                                            {template.name}
                                        </CardTitle>
                                        <Badge variant={template.minPlan === "FREE" ? "secondary" : "default"}>
                                            {template.locked && <LockIcon className="size-3" />}
                                            {PLAN_NAMES[template.minPlan]}
                                        </Badge>
                                    </div>
                                    <CardDescription>
                                        {template.category}
                                        {written.value !== DEFAULT_TEMPLATE_LANGUAGE && ` · ${written.label}`}
                                    </CardDescription>
                                </CardHeader>
                                <CardContent className="flex-1 space-y-3">
                                    <p
                                        className="text-sm text-muted-foreground"
                                        lang={written.value}
                                        dir={written.dir}
                                    >
                                        {template.description}
                                    </p>
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
                                                    openForm({
                                                        id: template.id,
                                                        workflowId: "",
                                                        name: template.name,
                                                        description: template.description,
                                                        category: template.category,
                                                        language: getTemplateLanguage(template.language).value,
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

            <Dialog open={!!form} onOpenChange={(open) => !open && openForm(null)}>
                <DialogContent className="max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle>{form?.id ? "Edit template" : "New template"}</DialogTitle>
                        <DialogDescription>
                            A template is a copy of one of your workflows. Credentials,
                            webhook secrets and Slack or Discord webhook URLs are removed
                            from the copy. The rest is scanned for keys, tokens and
                            passwords typed into fields: if any are found, the template
                            is not saved until you remove them or confirm.
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

                                        // Found in the workflow picked before
                                        clearFindings();

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
                                    dir="auto"
                                    onChange={(event) => setForm({ ...form, name: event.target.value })}
                                />
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="template-description">Description</Label>
                                <Textarea
                                    id="template-description"
                                    placeholder="What it does, and what the user has to connect to make it work."
                                    value={form.description}
                                    dir="auto"
                                    onChange={(event) => setForm({ ...form, description: event.target.value })}
                                />
                            </div>

                            <div className="space-y-2">
                                <Label>Language</Label>
                                <Select
                                    value={form.language}
                                    onValueChange={(value) =>
                                        isTemplateLanguage(value) && setForm({ ...form, language: value })
                                    }
                                >
                                    <SelectTrigger className="w-full">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {TEMPLATE_LANGUAGES.map((entry) => (
                                            <SelectItem key={entry.value} value={entry.value}>
                                                {entry.label}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                                <p className="text-xs text-muted-foreground">
                                    The language the name, the description and the texts inside the
                                    workflow are written in. The gallery can be filtered by it.
                                </p>
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

                            {findings && (
                                <div className="space-y-3 rounded-md border border-destructive/50 bg-destructive/5 p-3">
                                    <div>
                                        <p className="text-sm font-medium text-destructive">
                                            Not saved: this looks like it contains secrets
                                        </p>
                                        <p className="text-xs text-muted-foreground">
                                            Everyone who uses the template gets a copy of these
                                            fields. Remove the values from the workflow, save it,
                                            and try again.
                                        </p>
                                    </div>
                                    <ul className="max-h-40 space-y-1 overflow-y-auto text-xs">
                                        {findings.map((finding) => (
                                            <li key={`${finding.nodeId}-${finding.field}-${finding.reason}`}>
                                                <span className="font-medium">
                                                    {getNodeLabel(finding.nodeType)}
                                                    {finding.nodeName ? ` (${finding.nodeName})` : ""}
                                                </span>
                                                {", field "}
                                                <code className="break-all">{finding.field}</code>
                                                {`: ${finding.reason}`}
                                            </li>
                                        ))}
                                    </ul>
                                    <div className="flex items-center gap-2">
                                        <Checkbox
                                            id="template-confirm-secrets"
                                            checked={confirmSecrets}
                                            onCheckedChange={(checked) => setConfirmSecrets(checked === true)}
                                        />
                                        <Label htmlFor="template-confirm-secrets">
                                            I checked this, publish anyway
                                        </Label>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    <DialogFooter>
                        <Button
                            disabled={
                                !formValid ||
                                (!!findings && !confirmSecrets) ||
                                createTemplate.isPending ||
                                updateTemplate.isPending
                            }
                            onClick={submitForm}
                        >
                            {findings ? "Publish anyway" : form?.id ? "Save changes" : "Publish template"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <Dialog open={startersOpen} onOpenChange={setStartersOpen}>
                <DialogContent className="max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle>Starter templates</DialogTitle>
                        <DialogDescription>
                            Templates that ship with the app, each in English, Urdu and
                            Arabic. Tick the ones to add to the gallery. One that is already
                            there is not changed. Afterwards they can be edited, hidden and
                            deleted like any template.
                        </DialogDescription>
                    </DialogHeader>

                    {!starters ? (
                        <p className="text-sm text-muted-foreground">Loading...</p>
                    ) : (
                        <div className="space-y-4">
                            <div className="flex gap-2">
                                <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() =>
                                        setStarterIds(
                                            starters.filter((starter) => !starter.inGallery).map((starter) => starter.id)
                                        )
                                    }
                                >
                                    Select all
                                </Button>
                                <Button size="sm" variant="ghost" onClick={() => setStarterIds([])}>
                                    Clear
                                </Button>
                            </div>

                            <ul className="divide-y text-sm">
                                {starters.map((starter) => {
                                    const written = getTemplateLanguage(starter.language);

                                    return (
                                        <li key={starter.id} className="flex items-center gap-3 py-2">
                                            <Checkbox
                                                id={`starter-${starter.id}`}
                                                disabled={starter.inGallery}
                                                checked={starter.inGallery || starterIds.includes(starter.id)}
                                                onCheckedChange={(checked) =>
                                                    setStarterIds((current) =>
                                                        checked === true
                                                            ? [...current.filter((id) => id !== starter.id), starter.id]
                                                            : current.filter((id) => id !== starter.id)
                                                    )
                                                }
                                            />
                                            <Label
                                                htmlFor={`starter-${starter.id}`}
                                                className="flex-1 font-normal"
                                                lang={written.value}
                                                dir={written.dir}
                                            >
                                                {starter.name}
                                            </Label>
                                            <span className="shrink-0 text-xs text-muted-foreground">
                                                {starter.inGallery
                                                    ? "In the gallery"
                                                    : `${written.label} · ${PLAN_NAMES[starter.minPlan] ?? starter.minPlan}`}
                                            </span>
                                        </li>
                                    );
                                })}
                            </ul>

                            <div className="flex items-center justify-between gap-4 rounded-md border p-3">
                                <div>
                                    <Label htmlFor="starters-published">Publish right away</Label>
                                    <p className="text-xs text-muted-foreground">
                                        Off: they are added hidden, so you can read them first and
                                        publish each one from its edit dialog.
                                    </p>
                                </div>
                                <Switch
                                    id="starters-published"
                                    checked={startersPublished}
                                    onCheckedChange={setStartersPublished}
                                />
                            </div>
                        </div>
                    )}

                    <DialogFooter>
                        <Button
                            disabled={starterIds.length === 0 || addStarters.isPending}
                            onClick={() =>
                                addStarters.mutate({ ids: starterIds, published: startersPublished })
                            }
                        >
                            {starterIds.length === 0
                                ? "Add to the gallery"
                                : `Add ${starterIds.length} to the gallery`}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
};
