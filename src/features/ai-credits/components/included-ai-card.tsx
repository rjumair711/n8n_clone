"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from "@/components/ui/card";
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
import {
    INCLUDED_CREDENTIAL_NAME,
    PLAN_AI_CREDITS,
    parseIncludedModels,
} from "@/config/ai-credits";
import { useTRPC } from "@/trpc/client";

type ProviderForm = {
    provider: string;
    apiKey: string;
    models: string;
    enabled: boolean;
};

const EMPTY_FORM: ProviderForm = { provider: "", apiKey: "", models: "", enabled: true };

/**
 * Settings, admins only: the provider keys behind "RXJ AI (included)" and
 * the models each one offers.
 */
export const IncludedAiCard = () => {
    const trpc = useTRPC();
    const queryClient = useQueryClient();

    const { data, isLoading, isError } = useQuery(trpc.aiCredits.getProviders.queryOptions());
    const [form, setForm] = useState<ProviderForm>(EMPTY_FORM);

    const refresh = () => {
        queryClient.invalidateQueries(trpc.aiCredits.getProviders.queryOptions());
        queryClient.invalidateQueries(trpc.aiCredits.getIncluded.queryOptions());
        queryClient.invalidateQueries(trpc.aiCredits.getStatus.queryOptions());
    };

    const saveProvider = useMutation(
        trpc.aiCredits.saveProvider.mutationOptions({
            onSuccess: (saved) => {
                toast.success(`Included AI provider ${saved.provider} saved`);
                setForm(EMPTY_FORM);
                refresh();
            },
            onError: (error) => toast.error(error.message),
        })
    );

    const deleteProvider = useMutation(
        trpc.aiCredits.deleteProvider.mutationOptions({
            onSuccess: () => {
                toast.success("Included AI provider removed");
                refresh();
            },
            onError: (error) => toast.error(error.message),
        })
    );

    // Not an admin: the card is not part of the page
    if (!data?.isAdmin) return null;

    const models = parseIncludedModels(form.models);
    const existing = data.providers.find((entry) => entry.provider === form.provider);
    const isValid =
        form.provider !== "" && models.length > 0 && (!!existing || form.apiKey.trim() !== "");
    const isPending = saveProvider.isPending || deleteProvider.isPending;

    return (
        <Card className="shadow-none">
            <CardHeader>
                <CardTitle className="text-base">{INCLUDED_CREDENTIAL_NAME}</CardTitle>
                <CardDescription>
                    Provider keys of the platform that every account can use without a key
                    of its own, on a Chat Model node and in Build with AI. A call costs the
                    user AI credits, worked out from the price table below: a model
                    without a price there cannot be used. Per month the plans include{" "}
                    {Object.entries(PLAN_AI_CREDITS)
                        .map(([plan, credits]) => `${plan} ${credits.toLocaleString("en-US")}`)
                        .join(", ")}{" "}
                    credits (1,000 credits are one US dollar). The platform pays the
                    provider: offer cheap models only.
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
                {data.needsTwoFactor ? (
                    <p className="text-sm text-muted-foreground">
                        Turn on two-factor authentication above to set up{" "}
                        {INCLUDED_CREDENTIAL_NAME}.
                    </p>
                ) : isLoading ? (
                    <p className="text-sm text-muted-foreground">Loading providers...</p>
                ) : isError ? (
                    <p className="text-sm text-destructive">The providers could not be loaded.</p>
                ) : (
                    <>
                        {data.providers.length === 0 ? (
                            <p className="text-sm text-muted-foreground">
                                No provider yet: users do not see {INCLUDED_CREDENTIAL_NAME}{" "}
                                until one is added.
                            </p>
                        ) : (
                            <ul className="divide-y text-sm">
                                {data.providers.map((entry) => (
                                    <li key={entry.id} className="space-y-1 py-3">
                                        <div className="flex items-center justify-between gap-4">
                                            <span className="font-medium">
                                                {entry.label}
                                                {!entry.enabled && (
                                                    <span className="ml-2 text-xs font-normal text-muted-foreground">
                                                        switched off
                                                    </span>
                                                )}
                                            </span>
                                            <span>
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    disabled={isPending}
                                                    onClick={() =>
                                                        setForm({
                                                            provider: entry.provider,
                                                            apiKey: "",
                                                            models: entry.models.join("\n"),
                                                            enabled: entry.enabled,
                                                        })
                                                    }
                                                >
                                                    Edit
                                                </Button>
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    disabled={isPending}
                                                    onClick={() => deleteProvider.mutate({ id: entry.id })}
                                                >
                                                    Remove
                                                </Button>
                                            </span>
                                        </div>
                                        <p className="font-mono text-xs text-muted-foreground">
                                            {entry.models.join(", ")}
                                        </p>
                                        {entry.unpricedModels.length > 0 && (
                                            <p className="text-xs text-amber-600 dark:text-amber-500">
                                                No price for {entry.unpricedModels.join(", ")} (provider{" "}
                                                <span className="font-mono">{entry.provider}</span>): add{" "}
                                                {entry.unpricedModels.length === 1 ? "it" : "them"} to the
                                                price table, or users cannot run{" "}
                                                {entry.unpricedModels.length === 1 ? "it" : "them"}.
                                            </p>
                                        )}
                                    </li>
                                ))}
                            </ul>
                        )}

                        <div className="grid gap-3 sm:grid-cols-2">
                            <div className="space-y-1.5">
                                <Label>Provider</Label>
                                <Select
                                    value={form.provider}
                                    onValueChange={(provider) => {
                                        const saved = data.providers.find(
                                            (entry) => entry.provider === provider
                                        );

                                        setForm({
                                            provider,
                                            apiKey: "",
                                            models: saved ? saved.models.join("\n") : "",
                                            enabled: saved ? saved.enabled : true,
                                        });
                                    }}
                                >
                                    <SelectTrigger className="w-full">
                                        <SelectValue placeholder="Select a provider" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {data.options.map((option) => (
                                            <SelectItem key={option.value} value={option.value}>
                                                {option.label}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-1.5">
                                <Label htmlFor="included-ai-key">API key</Label>
                                <Input
                                    id="included-ai-key"
                                    type="password"
                                    autoComplete="off"
                                    value={form.apiKey}
                                    onChange={(event) =>
                                        setForm((current) => ({ ...current, apiKey: event.target.value }))
                                    }
                                    placeholder={existing ? "Leave empty to keep the saved key" : "The provider's API key"}
                                />
                            </div>
                            <div className="space-y-1.5 sm:col-span-2">
                                <Label htmlFor="included-ai-models">Models</Label>
                                <Textarea
                                    id="included-ai-models"
                                    rows={3}
                                    value={form.models}
                                    onChange={(event) =>
                                        setForm((current) => ({ ...current, models: event.target.value }))
                                    }
                                    placeholder={"glm-4.7-flash\nglm-4.5-flash"}
                                />
                                <p className="text-xs text-muted-foreground">
                                    One model ID per line, exactly as the provider lists it. The
                                    key is stored encrypted and is never shown again.
                                </p>
                            </div>
                            <label className="flex items-center gap-2 text-sm">
                                <Switch
                                    checked={form.enabled}
                                    onCheckedChange={(enabled) =>
                                        setForm((current) => ({ ...current, enabled }))
                                    }
                                />
                                Offered to users
                            </label>
                            <div className="flex justify-end gap-2">
                                {form.provider && (
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        disabled={isPending}
                                        onClick={() => setForm(EMPTY_FORM)}
                                    >
                                        Cancel
                                    </Button>
                                )}
                                <Button
                                    size="sm"
                                    disabled={!isValid || isPending}
                                    onClick={() =>
                                        saveProvider.mutate({
                                            provider: form.provider,
                                            apiKey: form.apiKey.trim() || undefined,
                                            models,
                                            enabled: form.enabled,
                                        })
                                    }
                                >
                                    {existing ? "Save provider" : "Add provider"}
                                </Button>
                            </div>
                        </div>
                    </>
                )}
            </CardContent>
        </Card>
    );
};
