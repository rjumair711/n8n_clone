"use client";

import {
    Check,
    CheckCircle2,
    ChevronDown,
    ChevronLeft,
    ChevronRight,
    CircleDashed,
    Copy,
    ListTree,
    LoaderCircle,
    Trash2,
    XCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

export interface ExecutionLog {
    id: string;
    // Friendly node label, e.g. "HTTP Request"
    nodeName: string;
    // The node's variable name, shown as secondary text
    detail?: string;
    status: "waiting" | "loading" | "success" | "error";
    createdAt?: string;
    duration?: string;
    error?: string;
    // Pretty-printed JSON
    output?: string;
}

interface ExecutionSidebarProps {
    logs: ExecutionLog[];
    // Empties the panel and the canvas status badges; nothing is deleted
    onClear?: () => void;
}

const STATUS_STYLES = {
    waiting: { icon: CircleDashed, border: "border-l-muted-foreground/40", text: "text-muted-foreground", label: "Waiting" },
    loading: { icon: LoaderCircle, border: "border-l-blue-500", text: "text-blue-600 dark:text-blue-400", label: "Running" },
    success: { icon: CheckCircle2, border: "border-l-green-500", text: "text-green-600 dark:text-green-400", label: "Success" },
    error: { icon: XCircle, border: "border-l-red-500", text: "text-red-600 dark:text-red-400", label: "Error" },
} as const;

// Above this size the output is shown without colours to keep the panel fast
const MAX_HIGHLIGHT_CHARS = 60_000;

// One match per JSON token: a string (optionally followed by ":" when it is
// a key), a literal, or a number
const JSON_TOKEN = /("(?:\\.|[^"\\])*")(\s*:)?|\b(true|false)\b|\b(null)\b|(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/g;

const highlightJson = (json: string): ReactNode[] => {
    const parts: ReactNode[] = [];
    let last = 0;

    for (const match of json.matchAll(JSON_TOKEN)) {
        const index = match.index ?? 0;
        if (index > last) parts.push(json.slice(last, index));

        const [text, string, colon, boolean, nil] = match;

        const className = string
            ? colon
                ? "text-sky-700 dark:text-sky-300"
                : "text-emerald-700 dark:text-emerald-300"
            : boolean
                ? "text-violet-700 dark:text-violet-300"
                : nil
                    ? "text-muted-foreground italic"
                    : "text-amber-700 dark:text-amber-300";

        parts.push(
            string && colon ? (
                <span key={index}>
                    <span className={className}>{string}</span>
                    {colon}
                </span>
            ) : (
                <span key={index} className={className}>{text}</span>
            )
        );

        last = index + text.length;
    }

    if (last < json.length) parts.push(json.slice(last));

    return parts;
};

const CopyButton = ({ text, className }: { text: string; className?: string }) => {
    const [copied, setCopied] = useState(false);

    useEffect(() => {
        if (!copied) return;

        const timer = setTimeout(() => setCopied(false), 2000);
        return () => clearTimeout(timer);
    }, [copied]);

    const handleCopy = async () => {
        try {
            await navigator.clipboard.writeText(text);
            setCopied(true);
        } catch {
            toast.error("Could not copy to the clipboard");
        }
    };

    return (
        <button
            type="button"
            onClick={handleCopy}
            className={cn(
                "flex items-center gap-1 rounded border bg-background/90 px-1.5 py-1 text-[10px] font-medium text-muted-foreground shadow-xs transition-colors hover:text-foreground",
                className
            )}
            aria-label="Copy"
        >
            {copied ? (
                <>
                    <Check className="size-3 text-green-600" />
                    Copied
                </>
            ) : (
                <Copy className="size-3" />
            )}
        </button>
    );
};

const OutputViewer = ({ output }: { output: string }) => {
    const [open, setOpen] = useState(false);

    // Only build the coloured tokens once the block is opened
    const content = useMemo(
        () =>
            !open
                ? null
                : output.length > MAX_HIGHLIGHT_CHARS
                    ? output
                    : highlightJson(output),
        [open, output]
    );

    return (
        <div className="mt-2">
            <button
                type="button"
                onClick={() => setOpen((current) => !current)}
                className="flex items-center gap-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
                {open ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
                View Output
            </button>

            {open && (
                <div className="relative mt-1.5 overflow-hidden rounded-md border bg-muted/40">
                    <CopyButton text={output} className="absolute right-1.5 top-1.5 z-10" />
                    <pre className="max-h-80 overflow-auto p-3 pr-12 font-mono text-[11px] leading-relaxed text-foreground/80">
                        <code>{content}</code>
                    </pre>
                </div>
            )}
        </div>
    );
};

export const ExecutionSidebar = ({ logs, onClear }: ExecutionSidebarProps) => {
    const [isOpen, setIsOpen] = useState(true);
    const containerRef = useRef<HTMLDivElement>(null);

    // Safely scroll only this specific container
    useEffect(() => {
        if (containerRef.current) {
            containerRef.current.scrollTo({
                top: containerRef.current.scrollHeight,
                behavior: "smooth",
            });
        }
    }, [logs.length]);

    return (
        <div
            className={cn(
                "relative h-full min-h-0 shrink-0 bg-background flex flex-col transition-all duration-300 ease-in-out",
                isOpen ? "w-[380px] border-l" : "w-0 border-l-0"
            )}
        >
            {/* Premium, High-Visibility Interaction Tab */}
            <button
                onClick={() => setIsOpen(!isOpen)}
                className={cn(
                    "absolute top-1/2 -translate-y-1/2 z-50 flex h-14 w-5 items-center justify-center shadow-md transition-all duration-200 ease-in-out group",
                    isOpen
                        ? "-left-5 rounded-l-md border border-r-0 border-orange-200 bg-orange-50/80 text-orange-600 hover:bg-orange-100 hover:text-orange-700 dark:border-orange-900 dark:bg-orange-950/80 dark:text-orange-400 dark:hover:bg-orange-900"
                        : "right-0 rounded-l-md bg-orange-600 text-white hover:bg-orange-700 shadow-[0_0_15px_rgba(234,88,12,0.3)] hover:w-6"
                )}
                title={isOpen ? "Collapse Logs" : "Expand Logs"}
            >
                {isOpen ? (
                    <ChevronRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
                ) : (
                    <ChevronLeft className="size-4 transition-transform group-hover:-translate-x-0.5" />
                )}
            </button>

            {/* Inner Content Wrapper (Prevents text distortion during animation) */}
            <div className="flex h-full min-h-0 w-[380px] flex-col overflow-hidden">
                {/* Header */}
                <div className="flex shrink-0 items-center justify-between gap-2 border-b px-4 py-3">
                    <div className="min-w-0">
                        <div className="flex items-center gap-2">
                            <h2 className="text-sm font-semibold">Execution Logs</h2>
                            {logs.length > 0 && (
                                <Badge
                                    variant="secondary"
                                    className="border-orange-200 bg-orange-50 px-1.5 py-0 text-[10px] font-medium text-orange-700 dark:border-orange-900 dark:bg-orange-950 dark:text-orange-300"
                                >
                                    {logs.length} {logs.length === 1 ? "node" : "nodes"}
                                </Badge>
                            )}
                        </div>
                        <p className="text-xs text-muted-foreground">Latest run of this workflow</p>
                    </div>
                    {onClear && (
                        <Tooltip>
                            <TooltipTrigger asChild>
                                {/* The span keeps the tooltip working while the button is disabled */}
                                <span>
                                    <Button
                                        size="icon"
                                        variant="ghost"
                                        className="size-8 text-muted-foreground hover:text-foreground"
                                        onClick={onClear}
                                        disabled={logs.length === 0}
                                        aria-label="Clear logs"
                                    >
                                        <Trash2 className="size-4" />
                                    </Button>
                                </span>
                            </TooltipTrigger>
                            <TooltipContent>Clear logs</TooltipContent>
                        </Tooltip>
                    )}
                </div>

                {/* Logs Container: the only part of the editor that scrolls */}
                <div
                    ref={containerRef}
                    className="min-h-0 flex-1 overflow-y-auto p-3"
                    style={{ scrollbarWidth: "thin" }}
                >
                    {logs.length === 0 && (
                        <div className="flex flex-col items-center gap-2 px-4 py-12 text-center">
                            <div className="flex size-9 items-center justify-center rounded-full bg-muted">
                                <ListTree className="size-4 text-muted-foreground" />
                            </div>
                            <p className="text-sm text-muted-foreground">
                                No runs yet. Execute the workflow to see logs here.
                            </p>
                        </div>
                    )}

                    <div className="flex flex-col gap-2">
                        {logs.map((log) => {
                            const style = STATUS_STYLES[log.status];
                            const Icon = style.icon;

                            return (
                                <div
                                    key={log.id}
                                    className={cn(
                                        "rounded-md border border-l-[3px] bg-card px-3 py-2.5",
                                        style.border
                                    )}
                                >
                                    <div className="flex items-start gap-2.5">
                                        <Icon
                                            className={cn(
                                                "mt-0.5 size-4 shrink-0",
                                                style.text,
                                                log.status === "loading" && "animate-spin"
                                            )}
                                        />
                                        <div className="min-w-0 flex-1">
                                            <div className="flex items-baseline justify-between gap-2">
                                                <p className="truncate text-sm font-medium">
                                                    {log.nodeName}
                                                </p>
                                                {log.duration && (
                                                    <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
                                                        {log.duration}
                                                    </span>
                                                )}
                                            </div>
                                            <p className="truncate text-xs text-muted-foreground">
                                                <span className={style.text}>{style.label}</span>
                                                {log.detail && (
                                                    <>
                                                        {" · "}
                                                        <span className="font-mono">{log.detail}</span>
                                                    </>
                                                )}
                                            </p>

                                            {log.error && (
                                                <div className="relative mt-2 rounded-md border border-red-200 bg-red-50 p-2.5 pr-10 text-xs leading-relaxed text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
                                                    <CopyButton text={log.error} className="absolute right-1.5 top-1.5" />
                                                    <p className="max-h-40 overflow-auto whitespace-pre-wrap break-words">
                                                        {log.error}
                                                    </p>
                                                </div>
                                            )}

                                            {log.output && <OutputViewer output={log.output} />}
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>
        </div>
    );
};
