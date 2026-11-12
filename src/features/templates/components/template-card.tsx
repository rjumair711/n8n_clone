"use client";

import { memo, type KeyboardEvent, type ReactNode } from "react";
import { EyeOffIcon, LanguagesIcon, LockIcon } from "lucide-react";
import { getNodeLabel } from "@/config/node-labels";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
    Sheet,
    SheetContent,
    SheetDescription,
    SheetFooter,
    SheetHeader,
    SheetTitle,
} from "@/components/ui/sheet";
import { PLAN_NAMES } from "../lib/template-data";
import { getTemplateLanguage } from "../lib/template-languages";

// What the gallery needs of a template (templates.getMany)
export type GalleryTemplate = {
    id: string;
    name: string;
    description: string;
    summary: string;
    steps: string[];
    category: string;
    language: string;
    minPlan: string;
    published: boolean;
    nodeTypes: string[];
    useCount: number;
    locked: boolean;
};

// Triggers and plumbing say little about what a template does
const HIDDEN_CHIP_TYPES = new Set(["MANUAL_TRIGGER", "INITIAL", "SET_VARIABLE", "MERGE"]);
const MAX_CHIPS = 4;

// There are no plans: a badge only for a template that needs a server of
// your own (it has an SSH node, on the hosted app)
export const PlanBadge = ({ plan, locked }: { plan: string; locked: boolean }) =>
    locked ? (
        <Badge
            variant="outline"
            className="gap-1 border-amber-500/40 bg-amber-500/10 text-amber-800 dark:text-amber-300"
            title="Needs a self-hosted or managed RXJ server"
        >
            <LockIcon className="size-3" aria-label="Locked" />
            {PLAN_NAMES[plan] ?? "Own server"}
        </Badge>
    ) : null;

// "اردو (Urdu)" -> "Urdu"
const languageName = (language: string) => {
    const { label } = getTemplateLanguage(language);
    return /\(([^)]+)\)/.exec(label)?.[1] ?? label;
};

const LanguageBadge = ({ language }: { language: string }) => (
    <Badge variant="outline" className="gap-1 font-normal text-muted-foreground">
        <LanguagesIcon className="size-3" />
        {languageName(language)}
    </Badge>
);

const NodeChip = ({ type }: { type: string }) => (
    <Badge variant="secondary" className="max-w-36 font-normal">
        <span className="truncate">{getNodeLabel(type)}</span>
    </Badge>
);

const chipTypes = (nodeTypes: string[]) =>
    nodeTypes.filter((type) => !HIDDEN_CHIP_TYPES.has(type));

type UseButtonProps = {
    template: GalleryTemplate;
    pending: boolean;
    onUse: (id: string) => void;
    onUpgrade: () => void;
    className?: string;
};

// "Use template", or "Own server" when a node needs a server of your own
const UseButton = ({ template, pending, onUse, onUpgrade, className }: UseButtonProps) =>
    template.locked ? (
        <Button
            variant="outline"
            className={className}
            onClick={(event) => {
                event.stopPropagation();
                onUpgrade();
            }}
        >
            <LockIcon className="size-4" />
            Own server
        </Button>
    ) : (
        <Button
            className={className}
            disabled={pending}
            onClick={(event) => {
                event.stopPropagation();
                onUse(template.id);
            }}
        >
            Use template
        </Button>
    );

type TemplateCardProps = Omit<UseButtonProps, "className"> & {
    onOpen: (id: string) => void;
    // ADMIN: edit and delete buttons, use count, hidden marker
    adminActions?: ReactNode;
};

/**
 * One template in the grid. Compact and the same height as its neighbours:
 * the summary is clamped to two lines and the full text is in the details
 * panel, which opens on click.
 */
export const TemplateCard = memo(function TemplateCard({
    template,
    pending,
    onUse,
    onUpgrade,
    onOpen,
    adminActions,
}: TemplateCardProps) {
    const written = getTemplateLanguage(template.language);
    const chips = chipTypes(template.nodeTypes);

    const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
        if (event.target !== event.currentTarget) return;
        if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            onOpen(template.id);
        }
    };

    return (
        <div
            role="button"
            tabIndex={0}
            aria-label={`${template.name}: details`}
            onClick={() => onOpen(template.id)}
            onKeyDown={onKeyDown}
            className="group flex h-full cursor-pointer flex-col gap-3 rounded-lg border bg-card p-4 text-card-foreground transition-colors hover:border-foreground/20 hover:bg-accent/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
            <div className="flex items-center justify-between gap-2">
                <PlanBadge plan={template.minPlan} locked={template.locked} />
                <LanguageBadge language={template.language} />
            </div>

            <div className="min-w-0 space-y-1">
                <h3
                    className="line-clamp-1 text-sm font-semibold"
                    lang={written.value}
                    dir={written.dir}
                    title={template.name}
                >
                    {template.name}
                </h3>
                <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    {!template.published && (
                        <>
                            <EyeOffIcon className="size-3" /> Hidden ·
                        </>
                    )}
                    {template.category}
                </p>
            </div>

            {/* Two lines, always: cards in a row line up */}
            <p
                className="line-clamp-2 min-h-10 text-sm text-muted-foreground"
                lang={written.value}
                dir={written.dir}
            >
                {template.summary || template.description}
            </p>

            <div className="flex flex-wrap gap-1">
                {chips.slice(0, MAX_CHIPS).map((type) => (
                    <NodeChip key={type} type={type} />
                ))}
                {chips.length > MAX_CHIPS && (
                    <Badge variant="secondary" className="font-normal">
                        +{chips.length - MAX_CHIPS}
                    </Badge>
                )}
            </div>

            <div className="mt-auto flex items-center gap-2 pt-1">
                <UseButton
                    template={template}
                    pending={pending}
                    onUse={onUse}
                    onUpgrade={onUpgrade}
                    className="flex-1"
                />
                {adminActions}
            </div>
        </div>
    );
});

type TemplateDetailsProps = Omit<UseButtonProps, "template" | "className"> & {
    // Kept while the panel slides out, so it does not go blank
    template: GalleryTemplate | null;
    open: boolean;
    onOpenChange: (open: boolean) => void;
};

/**
 * The details panel: the whole description, the setup steps as a numbered
 * list, and every node the template uses.
 */
export const TemplateDetailsSheet = ({
    template,
    open,
    pending,
    onUse,
    onUpgrade,
    onOpenChange,
}: TemplateDetailsProps) => {
    const written = getTemplateLanguage(template?.language);
    const chips = template ? chipTypes(template.nodeTypes) : [];

    return (
        <Sheet open={open && !!template} onOpenChange={onOpenChange}>
            <SheetContent side="right" className="w-full gap-0 sm:max-w-lg">
                {template && (
                    <>
                        <SheetHeader className="border-b">
                            <div className="flex flex-wrap items-center gap-2 pr-8">
                                <PlanBadge plan={template.minPlan} locked={template.locked} />
                                <LanguageBadge language={template.language} />
                                <span className="text-xs text-muted-foreground">{template.category}</span>
                            </div>
                            <SheetTitle lang={written.value} dir={written.dir}>
                                {template.name}
                            </SheetTitle>
                            <SheetDescription lang={written.value} dir={written.dir}>
                                {template.summary || template.description}
                            </SheetDescription>
                        </SheetHeader>

                        <div className="flex-1 space-y-6 overflow-y-auto p-4">
                            {template.locked && (
                                <p className="rounded-md border border-amber-500/40 bg-amber-500/5 p-3 text-sm">
                                    This template uses a node that only runs on a self-hosted or
                                    managed RXJ server, such as SSH.
                                </p>
                            )}

                            {template.steps.length > 0 && (
                                <section className="space-y-2">
                                    <h4 className="text-sm font-medium">Setup</h4>
                                    <ol
                                        className="list-decimal space-y-2 ps-5 text-sm text-muted-foreground marker:text-foreground"
                                        lang={written.value}
                                        dir={written.dir}
                                    >
                                        {template.steps.map((step, index) => (
                                            <li key={index}>{step}</li>
                                        ))}
                                    </ol>
                                </section>
                            )}

                            <section className="space-y-2">
                                <h4 className="text-sm font-medium">Nodes used</h4>
                                <div className="flex flex-wrap gap-1">
                                    {chips.map((type) => (
                                        <NodeChip key={type} type={type} />
                                    ))}
                                </div>
                            </section>
                        </div>

                        <SheetFooter className="border-t">
                            <UseButton
                                template={template}
                                pending={pending}
                                onUse={onUse}
                                onUpgrade={onUpgrade}
                                className="w-full"
                            />
                        </SheetFooter>
                    </>
                )}
            </SheetContent>
        </Sheet>
    );
};
