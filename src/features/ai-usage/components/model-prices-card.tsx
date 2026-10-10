"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { toast } from "sonner";
import { useTRPC } from "@/trpc/client";
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
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";

type PriceForm = {
    provider: string;
    model: string;
    inputPerM: string;
    outputPerM: string;
    cachedInputPerM: string;
};

const EMPTY_FORM: PriceForm = {
    provider: "",
    model: "",
    inputPerM: "",
    outputPerM: "",
    cachedInputPerM: "",
};

// A price per million tokens typed into the form, or undefined
const toRate = (value: string) => {
    const number = Number(value.trim());

    return value.trim() !== "" && Number.isFinite(number) && number >= 0 ? number : undefined;
};

const formatRate = (value: number | null) => (value === null ? "same as input" : `$${value}`);

/**
 * Settings, admins only: what each model costs per million tokens. Costs
 * and budgets are worked out from this table.
 */
export const ModelPricesCard = () => {
    const trpc = useTRPC();
    const queryClient = useQueryClient();

    const { data: security } = useQuery(trpc.settings.getSecurity.queryOptions());
    const canEdit = security?.isAdmin === true && security.twoFactorEnabled;

    const { data, isLoading, isError } = useQuery({
        ...trpc.aiUsage.getPrices.queryOptions(),
        enabled: canEdit,
    });

    const [form, setForm] = useState<PriceForm>(EMPTY_FORM);
    const set = (field: keyof PriceForm) => (event: React.ChangeEvent<HTMLInputElement>) =>
        setForm((current) => ({ ...current, [field]: event.target.value }));

    const refresh = () => queryClient.invalidateQueries(trpc.aiUsage.getPrices.queryOptions());

    const savePrice = useMutation(
        trpc.aiUsage.savePrice.mutationOptions({
            onSuccess: (price) => {
                toast.success(`Price of ${price.provider} / ${price.model} saved`);
                setForm(EMPTY_FORM);
                refresh();
            },
            onError: (error) => toast.error(error.message),
        })
    );

    const deletePrice = useMutation(
        trpc.aiUsage.deletePrice.mutationOptions({
            onSuccess: () => {
                toast.success("Price removed");
                refresh();
            },
            onError: (error) => toast.error(error.message),
        })
    );

    // Not an admin: the card is not part of the page
    if (!security?.isAdmin) return null;

    const inputPerM = toRate(form.inputPerM);
    const outputPerM = toRate(form.outputPerM);
    const cachedInputPerM = form.cachedInputPerM.trim() === "" ? null : toRate(form.cachedInputPerM);

    const isValid =
        form.provider.trim() !== "" &&
        form.model.trim() !== "" &&
        inputPerM !== undefined &&
        outputPerM !== undefined &&
        cachedInputPerM !== undefined;

    const isPending = savePrice.isPending || deletePrice.isPending;

    return (
        <Card className="shadow-none">
            <CardHeader>
                <CardTitle className="text-base">AI model prices</CardTitle>
                <CardDescription>
                    US dollars per million tokens, for every account. The cost of a model
                    call is worked out from this table when the call is made: changing a
                    price does not change calls already recorded. A model without a price
                    shows as &quot;No price&quot; and does not count towards budgets.
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
                {!canEdit ? (
                    <p className="text-sm text-muted-foreground">
                        Turn on two-factor authentication above to change model prices.
                    </p>
                ) : isLoading ? (
                    <p className="text-sm text-muted-foreground">Loading prices...</p>
                ) : isError || !data ? (
                    <p className="text-sm text-destructive">The prices could not be loaded.</p>
                ) : (
                    <>
                        {data.prices.length === 0 ? (
                            <p className="text-sm text-muted-foreground">
                                No prices yet. Until a model has one, its calls are recorded
                                with their tokens but without a cost.
                            </p>
                        ) : (
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Provider</TableHead>
                                        <TableHead>Model</TableHead>
                                        <TableHead className="text-right">Input</TableHead>
                                        <TableHead className="text-right">Output</TableHead>
                                        <TableHead className="text-right">Cached input</TableHead>
                                        <TableHead>Updated</TableHead>
                                        <TableHead />
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {data.prices.map((price) => (
                                        <TableRow key={price.id}>
                                            <TableCell className="font-mono text-xs">{price.provider}</TableCell>
                                            <TableCell className="font-mono text-xs">{price.model}</TableCell>
                                            <TableCell className="text-right tabular-nums">
                                                {formatRate(price.inputPerM)}
                                            </TableCell>
                                            <TableCell className="text-right tabular-nums">
                                                {formatRate(price.outputPerM)}
                                            </TableCell>
                                            <TableCell className="text-right tabular-nums">
                                                {formatRate(price.cachedInputPerM)}
                                            </TableCell>
                                            <TableCell className="text-xs text-muted-foreground">
                                                {format(price.updatedAt, "PP")}
                                            </TableCell>
                                            <TableCell className="text-right">
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    disabled={isPending}
                                                    onClick={() =>
                                                        setForm({
                                                            provider: price.provider,
                                                            model: price.model,
                                                            inputPerM: String(price.inputPerM),
                                                            outputPerM: String(price.outputPerM),
                                                            cachedInputPerM:
                                                                price.cachedInputPerM === null
                                                                    ? ""
                                                                    : String(price.cachedInputPerM),
                                                        })
                                                    }
                                                >
                                                    Edit
                                                </Button>
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    disabled={isPending}
                                                    onClick={() => deletePrice.mutate({ id: price.id })}
                                                >
                                                    Remove
                                                </Button>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        )}

                        {data.unpriced.length > 0 && (
                            <div className="space-y-2">
                                <p className="text-sm font-medium">
                                    Used in the last {data.unpricedDays} days without a price
                                </p>
                                <div className="flex flex-wrap gap-1.5">
                                    {data.unpriced.map((entry) => (
                                        <button
                                            key={`${entry.provider}|${entry.model}`}
                                            type="button"
                                            title="Fill the form with this model"
                                            onClick={() =>
                                                setForm({
                                                    ...EMPTY_FORM,
                                                    provider: entry.provider,
                                                    model: entry.model,
                                                })
                                            }
                                            className="rounded-md border px-2 py-0.5 font-mono text-xs hover:bg-muted"
                                        >
                                            {entry.provider} / {entry.model} ({entry.calls})
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}

                        <form
                            className="space-y-3"
                            onSubmit={(event) => {
                                event.preventDefault();
                                if (
                                    !isValid ||
                                    inputPerM === undefined ||
                                    outputPerM === undefined ||
                                    cachedInputPerM === undefined
                                ) {
                                    return;
                                }

                                savePrice.mutate({
                                    provider: form.provider,
                                    model: form.model,
                                    inputPerM,
                                    outputPerM,
                                    cachedInputPerM,
                                });
                            }}
                        >
                            <p className="text-sm font-medium">Add or change a price</p>
                            <div className="grid gap-3 sm:grid-cols-2">
                                <div className="space-y-1.5">
                                    <Label htmlFor="price-provider">Provider</Label>
                                    <Input
                                        id="price-provider"
                                        placeholder="openai, anthropic, gemini, deepseek, custom..."
                                        value={form.provider}
                                        onChange={set("provider")}
                                    />
                                </div>
                                <div className="space-y-1.5">
                                    <Label htmlFor="price-model">Model</Label>
                                    <Input
                                        id="price-model"
                                        placeholder="The model ID, as typed on the node"
                                        value={form.model}
                                        onChange={set("model")}
                                    />
                                </div>
                            </div>
                            <div className="grid gap-3 sm:grid-cols-3">
                                <div className="space-y-1.5">
                                    <Label htmlFor="price-input">Input, $ per 1M</Label>
                                    <Input
                                        id="price-input"
                                        inputMode="decimal"
                                        value={form.inputPerM}
                                        onChange={set("inputPerM")}
                                    />
                                </div>
                                <div className="space-y-1.5">
                                    <Label htmlFor="price-output">Output, $ per 1M</Label>
                                    <Input
                                        id="price-output"
                                        inputMode="decimal"
                                        value={form.outputPerM}
                                        onChange={set("outputPerM")}
                                    />
                                </div>
                                <div className="space-y-1.5">
                                    <Label htmlFor="price-cached">Cached input, $ per 1M</Label>
                                    <Input
                                        id="price-cached"
                                        inputMode="decimal"
                                        placeholder="Same as input"
                                        value={form.cachedInputPerM}
                                        onChange={set("cachedInputPerM")}
                                    />
                                </div>
                            </div>
                            <p className="text-xs text-muted-foreground">
                                Provider and model are matched exactly, ignoring case. The
                                provider is the one shown next to the model in an
                                execution&apos;s AI usage. Saving a provider and model that are
                                already in the table replaces their price. Embedding models
                                only need the input price: set output to 0.
                            </p>
                            <div className="flex gap-2">
                                <Button type="submit" size="sm" disabled={!isValid || isPending}>
                                    Save price
                                </Button>
                                <Button
                                    type="button"
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => setForm(EMPTY_FORM)}
                                >
                                    Clear
                                </Button>
                            </div>
                        </form>
                    </>
                )}
            </CardContent>
        </Card>
    );
};
