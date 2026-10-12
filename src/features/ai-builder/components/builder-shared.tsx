"use client";

// What the two "Build with AI" dialogs share: the model picker and how a
// result is shown. The dialogs are build-with-ai-button.tsx (workflows
// list) and editor-build-with-ai.tsx (editor).

import { useEffect, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { CHAT_MODEL_PROVIDERS } from "@/features/executions/lib/chat-model-providers";
import { useTRPC } from "@/trpc/client";
import {
    getBuilderDefaultModel,
    isBuilderCredentialType,
} from "../lib/builder-models";

// Which model builds the workflow: one of the user's own credentials

type ModelChoice = {
    credentialId: string;
    model: string;
    // Only for an OpenAI-compatible credential
    provider: string;
    baseUrl: string;
};

const EMPTY_CHOICE: ModelChoice = {
    credentialId: "",
    model: "",
    provider: "openrouter",
    baseUrl: "",
};

// Remembered in this browser, so the model is picked once
const STORAGE_KEY = "rxj:build-with-ai-model";

const readStoredChoice = (): ModelChoice => {
    try {
        const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}");

        return {
            credentialId: typeof stored.credentialId === "string" ? stored.credentialId : "",
            model: typeof stored.model === "string" ? stored.model : "",
            provider: typeof stored.provider === "string" ? stored.provider : "openrouter",
            baseUrl: typeof stored.baseUrl === "string" ? stored.baseUrl : "",
        };
    } catch {
        return EMPTY_CHOICE;
    }
};

export const useModelChoice = (open: boolean) => {
    const trpc = useTRPC();
    const { data: credentials, isLoading } = useQuery({
        ...trpc.aiBuilder.getModelCredentials.queryOptions(),
        enabled: open,
    });

    const [choice, setChoice] = useState<ModelChoice>(EMPTY_CHOICE);

    useEffect(() => {
        if (open) setChoice(readStoredChoice());
    }, [open]);

    const update = (changes: Partial<ModelChoice>) =>
        setChoice((current) => {
            const next = { ...current, ...changes };

            try {
                localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
            } catch {
                // Private windows may refuse: the choice just is not kept
            }

            return next;
        });

    // The remembered credential may have been deleted since
    const credential =
        credentials?.find((item) => item.id === choice.credentialId) ?? credentials?.[0];

    const type =
        credential && isBuilderCredentialType(credential.type) ? credential.type : null;
    const isCompatible = type === "OPENAI_COMPATIBLE";
    const defaultModel = type
        ? getBuilderDefaultModel(type, isCompatible ? choice.provider : undefined)
        : "";

    return {
        credentials: credentials ?? [],
        isLoading,
        credential,
        isCompatible,
        defaultModel,
        choice,
        update,
        // What the server gets
        input: {
            credentialId: credential?.id ?? "",
            model: choice.model.trim() || undefined,
            ...(isCompatible
                ? {
                    provider: choice.provider,
                    baseUrl: choice.baseUrl.trim() || undefined,
                }
                : {}),
        },
        ready: !!credential && (!!choice.model.trim() || !!defaultModel),
    };
};

export const ModelPicker = ({ state }: { state: ReturnType<typeof useModelChoice> }) => {
    const { credentials, isLoading, credential, isCompatible, defaultModel, choice, update } = state;

    if (!isLoading && credentials.length === 0) {
        return (
            <p className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">
                Build with AI uses one of your own model credentials (OpenAI, Anthropic,
                Gemini, DeepSeek, Kimi, Qwen or any OpenAI-compatible provider).{" "}
                <Link href="/credentials/new" className="underline">
                    Add a credential
                </Link>{" "}
                first.
            </p>
        );
    }

    const provider = CHAT_MODEL_PROVIDERS.find((item) => item.value === choice.provider);

    return (
        <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
                <Label>Model credential</Label>
                <Select
                    value={credential?.id ?? ""}
                    onValueChange={(credentialId) => update({ credentialId, model: "" })}
                    disabled={isLoading}
                >
                    <SelectTrigger className="w-full">
                        <SelectValue placeholder={isLoading ? "Loading..." : "Select a credential"} />
                    </SelectTrigger>
                    <SelectContent>
                        {credentials.map((item) => (
                            <SelectItem key={item.id} value={item.id}>
                                {item.name}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>
            <div className="space-y-1.5">
                <Label htmlFor="build-with-ai-model">Model</Label>
                <Input
                    id="build-with-ai-model"
                    value={choice.model}
                    onChange={(event) => update({ model: event.target.value })}
                    placeholder={defaultModel || provider?.modelPlaceholder || "model-name"}
                />
            </div>
            {isCompatible && (
                <>
                    <div className="space-y-1.5">
                        <Label>Provider</Label>
                        <Select
                            value={choice.provider}
                            onValueChange={(value) => update({ provider: value, model: "" })}
                        >
                            <SelectTrigger className="w-full">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                {CHAT_MODEL_PROVIDERS.map((item) => (
                                    <SelectItem key={item.value} value={item.value}>
                                        {item.label}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="space-y-1.5">
                        <Label htmlFor="build-with-ai-base-url">Base URL</Label>
                        <Input
                            id="build-with-ai-base-url"
                            value={choice.baseUrl}
                            onChange={(event) => update({ baseUrl: event.target.value })}
                            placeholder={provider?.baseUrl || "https://api.example.com/v1"}
                        />
                    </div>
                </>
            )}
            <p className="text-xs text-muted-foreground sm:col-span-2">
                The description and the list of node types are sent to this model, with
                your credential. Stored credentials and secrets of your nodes are never sent.
                {defaultModel ? ` Leave Model empty for ${defaultModel}.` : ""}
            </p>
        </div>
    );
};

export const Problems = ({ errors }: { errors: string[] }) =>
    errors.length === 0 ? null : (
        <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm">
            <p className="font-medium">
                The model did not produce a valid workflow, also after a second try:
            </p>
            <ul className="mt-1 list-disc space-y-0.5 pl-5 text-muted-foreground">
                {errors.slice(0, 6).map((error) => (
                    <li key={error}>{error}</li>
                ))}
            </ul>
            <p className="mt-2 text-muted-foreground">
                Try again, describe it in more detail, or use a stronger model.
            </p>
        </div>
    );

export const Todo = ({ items }: { items: string[] }) =>
    items.length === 0 ? null : (
        <div className="text-xs text-muted-foreground">
            <p className="font-medium text-foreground">Still to set up (marked Not Configured):</p>
            <ul className="list-disc pl-5">
                {items.map((item) => (
                    <li key={item}>{item}</li>
                ))}
            </ul>
        </div>
    );

// Every node type, described for the model. Loaded on demand: it pulls in
// all the node components.
export const loadCatalogue = async () => (await import("./node-catalogue")).getNodeCatalogue();
