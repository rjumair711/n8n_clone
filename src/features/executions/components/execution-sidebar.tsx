"use client";

import { CheckCircle2, LoaderCircle, XCircle, Clock3 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useEffect, useRef } from "react";

export interface ExecutionLog {
    id: string;
    nodeName: string;
    status: "loading" | "success" | "error";
    createdAt?: string;
    duration?: string;
    error?: string;
    output?: string;
}

interface ExecutionSidebarProps {
    logs: ExecutionLog[];
}

export const ExecutionSidebar = ({ logs }: ExecutionSidebarProps) => {
    // 1. Referece the container itself instead of a bottom element
    const containerRef = useRef<HTMLDivElement>(null);

    // 2. Safely scroll only this specific container
    useEffect(() => {
        if (containerRef.current) {
            containerRef.current.scrollTo({
                top: containerRef.current.scrollHeight,
                behavior: "smooth",
            });
        }
    }, [logs]);

    return (
        <div className="h-full w-[380px] shrink-0 border-l bg-background flex flex-col overflow-hidden">
            {/* Header */}
            <div className="border-b p-4">
                <h2 className="text-sm font-semibold">Execution Logs</h2>
                <p className="text-xs text-muted-foreground">Live workflow execution</p>
            </div>

            {/* Logs Container */}
            <div
                ref={containerRef} // 3. Attach the ref here
                className="relative flex-1 overflow-y-auto px-3 py-4"
                style={{ scrollbarWidth: "thin" }}
            >
                <div className="absolute left-[22px] top-0 h-full w-px bg-border" />

                {logs.length === 0 && (
                    <div className="py-10 text-center text-sm text-muted-foreground">
                        No execution logs yet
                    </div>
                )}
                
                <div className="flex flex-col gap-2">
                    {logs.map((log) => {
                        const Icon = {
                            loading: LoaderCircle,
                            success: CheckCircle2,
                            error: XCircle,
                        }[log.status];

                        return (
                            <div
                                key={log.id}
                                className={cn(
                                    "rounded-lg border p-3 transition-all hover:scale-[1.01]",
                                    log.status === "loading" && "border-blue-500/40 bg-blue-500/5",
                                    log.status === "success" && "border-green-500/40 bg-green-500/5",
                                    log.status === "error" && "border-red-500/40 bg-red-500/5"
                                )}
                            >
                                <div className="flex items-start gap-3">
                                    <Icon
                                        className={cn(
                                            "mt-0.5 size-4 shrink-0",
                                            log.status === "loading" && "animate-spin text-blue-600",
                                            log.status === "success" && "text-green-600",
                                            log.status === "error" && "text-red-600"
                                        )}
                                    />
                                    <div className="min-w-0 flex-1">
                                        <div className="flex items-center justify-between gap-2">
                                            <p className="truncate text-sm font-medium">
                                                {log.nodeName}
                                            </p>
                                            {log.duration && (
                                                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                                                    <Clock3 className="size-3" />
                                                    {log.duration}
                                                </div>
                                            )}
                                        </div>
                                        <p className="mt-1 text-xs capitalize text-muted-foreground">
                                            {log.status}
                                        </p>
                                        {log.error && (
                                            <div className="mt-2 rounded-md bg-red-500/10 p-2 text-xs text-red-600">
                                                {log.error}
                                            </div>
                                        )}
                                        {log.output && (
                                            <details className="mt-2 overflow-hidden rounded-md border bg-muted/40">
                                                <summary className="cursor-pointer px-3 py-2 text-xs font-medium">
                                                    View Output
                                                </summary>
                                                <pre className="overflow-x-auto border-t p-3 text-[11px] leading-relaxed text-muted-foreground">
                                                    <code>{log.output}</code>
                                                </pre>
                                            </details>
                                        )}
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
                {/* Removed bottomRef div */}
            </div>
        </div>
    );
};