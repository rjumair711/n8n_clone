"use client";

import { CheckCircle2, LoaderCircle, XCircle, Clock3, ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { useEffect, useRef, useState } from "react";

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
    }, [logs]);

    return (
        <div 
            className={cn(
                "relative h-full shrink-0 bg-background flex flex-col transition-all duration-300 ease-in-out",
                isOpen ? "w-[380px] border-l" : "w-0 border-l-0"
            )}
        >
            {/* Premium, High-Visibility Interaction Tab */}
            <button
                onClick={() => setIsOpen(!isOpen)}
                className={cn(
                    "absolute top-1/2 -translate-y-1/2 z-50 flex h-14 w-5 items-center justify-center shadow-md transition-all duration-200 ease-in-out group",
                    isOpen 
                        ? "-left-5 rounded-l-md border border-r-0 border-orange-200 bg-orange-50/80 text-orange-600 hover:bg-orange-100 hover:text-orange-700" 
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
            <div className="flex h-full w-[380px] flex-col overflow-hidden">
                {/* Header */}
                <div className="border-b p-4 shrink-0">
                    <h2 className="text-sm font-semibold">Execution Logs</h2>
                    <p className="text-xs text-muted-foreground">Live workflow execution</p>
                </div>

                {/* NEW: Bounding Wrapper to prevent page scroll */}
                <div className="flex-1 overflow-hidden">
                    {/* Logs Container */}
                    <div
                        ref={containerRef}
                        className="relative h-full overflow-y-auto px-3 py-4"
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
                    </div>
                </div>
            </div>
        </div>
    );
};