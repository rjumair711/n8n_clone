"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { CheckIcon, Loader2Icon, XIcon } from "lucide-react";
import { useTRPC } from "@/trpc/client";
import {
    CHATBOT_MAX_FILE_BYTES,
    getChatbotFileKind,
} from "../lib/chatbot";

// Adding documents and web pages to a chatbot, one request each, so a slow
// page or a large file does not hold up the others and each one says how
// it went.

export type SourceProgress = {
    name: string;
    status: "waiting" | "working" | "done" | "failed";
    note?: string;
};

const megabytes = (bytes: number) => `${Math.round(bytes / 1024 / 1024)} MB`;

/**
 * What is wrong with a file before it is sent, or null.
 */
export const getFileProblem = (file: File): string | null => {
    if (!getChatbotFileKind(file.name)) {
        return "not a PDF, Word (.docx) or text file (.txt, .md, .csv)";
    }

    if (file.size > CHATBOT_MAX_FILE_BYTES) {
        return `larger than ${megabytes(CHATBOT_MAX_FILE_BYTES)}`;
    }

    return file.size === 0 ? "empty" : null;
};

const readAsBase64 = (file: File) =>
    new Promise<string>((resolve, reject) => {
        const reader = new FileReader();

        reader.onload = () => resolve(String(reader.result).replace(/^data:[^,]*,/, ""));
        reader.onerror = () => reject(new Error("the file could not be read"));
        reader.readAsDataURL(file);
    });

export const useAddSources = () => {
    const trpc = useTRPC();
    const addFile = useMutation(trpc.chatbots.addFile.mutationOptions());
    const addUrl = useMutation(trpc.chatbots.addUrl.mutationOptions());

    const [progress, setProgress] = useState<SourceProgress[]>([]);
    const [busy, setBusy] = useState(false);

    /**
     * Adds the files and pages to the chatbot, in order. Returns how many
     * failed.
     */
    const run = async (id: string, files: File[], urls: string[]) => {
        const items: SourceProgress[] = [
            ...files.map((file) => ({ name: file.name, status: "waiting" as const })),
            ...urls.map((url) => ({ name: url, status: "waiting" as const })),
        ];

        if (items.length === 0) return 0;

        const update = (index: number, changes: Partial<SourceProgress>) => {
            items[index] = { ...items[index], ...changes };
            setProgress([...items]);
        };

        setBusy(true);
        setProgress([...items]);

        let failed = 0;

        for (let index = 0; index < items.length; index++) {
            update(index, { status: "working" });

            try {
                const file = files[index];
                const result = file
                    ? await addFile.mutateAsync({
                        id,
                        fileName: file.name,
                        contentBase64: await readAsBase64(file),
                    })
                    : await addUrl.mutateAsync({ id, url: urls[index - files.length] });

                update(index, {
                    status: "done",
                    note: !result.changed
                        ? "already there, unchanged"
                        : result.truncated
                            ? `${result.chunks} parts; it is long, so only the beginning was read`
                            : `${result.chunks} part${result.chunks === 1 ? "" : "s"}`,
                });
            } catch (error) {
                failed++;
                update(index, {
                    status: "failed",
                    note: error instanceof Error ? error.message : "it could not be added",
                });
            }
        }

        setBusy(false);

        return failed;
    };

    return { run, progress, busy, clear: () => setProgress([]) };
};

export const SourceProgressList = ({ items }: { items: SourceProgress[] }) =>
    items.length === 0 ? null : (
        <ul className="space-y-1.5 text-sm">
            {items.map((item, index) => (
                <li key={`${item.name}-${index}`} className="flex items-start gap-2">
                    <span className="mt-0.5 shrink-0">
                        {item.status === "done" ? (
                            <CheckIcon className="size-4 text-emerald-600" />
                        ) : item.status === "failed" ? (
                            <XIcon className="size-4 text-destructive" />
                        ) : item.status === "working" ? (
                            <Loader2Icon className="size-4 animate-spin text-muted-foreground" />
                        ) : (
                            <span className="block size-4" />
                        )}
                    </span>
                    <span className="min-w-0">
                        <span className="break-all">{item.name}</span>
                        {item.note && (
                            <span
                                className={`block text-xs ${item.status === "failed" ? "text-destructive" : "text-muted-foreground"}`}
                            >
                                {item.note}
                            </span>
                        )}
                    </span>
                </li>
            ))}
        </ul>
    );
