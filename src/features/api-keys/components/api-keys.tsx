"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format, formatDistanceToNow } from "date-fns";
import { CopyIcon, KeyRoundIcon, PlusIcon } from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";
import { useTRPC } from "@/trpc/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
    Card,
    CardContent,
    CardDescription,
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
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import {
    API_SCOPES,
    API_SCOPE_DESCRIPTIONS,
    type ApiScope,
    isKeyExpired,
} from "@/lib/api-key-scopes";

const copy = async (value: string, label: string) => {
    try {
        await navigator.clipboard.writeText(value);
        toast.success(`${label} copied to clipboard`);
    } catch {
        toast.error(`Failed to copy ${label}`);
    }
};

export const ApiKeys = () => {
    const trpc = useTRPC();
    const queryClient = useQueryClient();

    const { data, isLoading } = useQuery(trpc.apiKeys.getMany.queryOptions());

    const [createOpen, setCreateOpen] = useState(false);
    const [name, setName] = useState("");
    const [scopes, setScopes] = useState<ApiScope[]>([...API_SCOPES]);
    // A date like 2026-12-31; empty for a key that never expires
    const [expiresOn, setExpiresOn] = useState("");
    // The key waiting for "Revoke" to be confirmed
    const [revoking, setRevoking] = useState<{ id: string; name: string } | null>(null);
    // Shown once, right after the key is created
    const [newKey, setNewKey] = useState<string | null>(null);

    const refresh = () =>
        queryClient.invalidateQueries(trpc.apiKeys.getMany.queryOptions());

    const createKey = useMutation(
        trpc.apiKeys.create.mutationOptions({
            onSuccess: (created) => {
                setNewKey(created.key);
                setName("");
                refresh();
            },
            onError: (error) => toast.error(error.message),
        })
    );

    const removeKey = useMutation(
        trpc.apiKeys.remove.mutationOptions({
            onSuccess: () => {
                toast.success("API key revoked");
                setRevoking(null);
                refresh();
            },
            onError: (error) => toast.error(error.message),
        })
    );

    const closeDialog = (open: boolean) => {
        setCreateOpen(open);
        if (!open) {
            setNewKey(null);
            setName("");
            setScopes([...API_SCOPES]);
            setExpiresOn("");
        }
    };

    const toggleScope = (scope: ApiScope, checked: boolean) =>
        setScopes((current) =>
            checked ? [...current, scope] : current.filter((item) => item !== scope)
        );

    const today = new Date().toISOString().slice(0, 10);

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
    const example = `curl -X POST "${baseUrl}/api/v1/workflows/<workflowId>/execute" \\
  -H "Authorization: Bearer <your-api-key>" \\
  -H "Content-Type: application/json" \\
  -d '{"customer":"Ali"}'`;

    return (
        <div className="mx-auto w-full max-w-5xl space-y-6 p-4 md:p-8">
            <Card className="shadow-none">
                <CardHeader className="flex flex-row items-start justify-between gap-4">
                    <div className="space-y-1.5">
                        <CardTitle>API Keys</CardTitle>
                        <CardDescription>
                            Run your workflows and read their results from your
                            own code.
                        </CardDescription>
                    </div>
                    <Button
                        onClick={() => setCreateOpen(true)}
                        disabled={isLoading || !data?.hasAccess}
                    >
                        <PlusIcon className="size-4" />
                        New API key
                    </Button>
                </CardHeader>
                <CardContent className="space-y-4">
                    {data && !data.hasAccess && (
                        <p className="rounded-md border bg-muted/40 p-3 text-sm">
                            API access is part of the Pro plan.{" "}
                            <Link href="/pricing" className="underline underline-offset-4">
                                See plans
                            </Link>
                        </p>
                    )}

                    {isLoading ? (
                        <p className="text-sm text-muted-foreground">Loading...</p>
                    ) : !data?.items.length ? (
                        <div className="flex flex-col items-center gap-2 py-8 text-center">
                            <KeyRoundIcon className="size-8 text-muted-foreground/40" />
                            <p className="text-sm text-muted-foreground">
                                You have no API keys yet.
                            </p>
                        </div>
                    ) : (
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Name</TableHead>
                                    <TableHead>Key</TableHead>
                                    <TableHead>Scopes</TableHead>
                                    <TableHead>Created</TableHead>
                                    <TableHead>Last used</TableHead>
                                    <TableHead>Expires</TableHead>
                                    <TableHead />
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {data.items.map((apiKey) => (
                                    <TableRow key={apiKey.id}>
                                        <TableCell className="font-medium">{apiKey.name}</TableCell>
                                        <TableCell className="font-mono text-xs">
                                            {apiKey.prefix}…
                                        </TableCell>
                                        <TableCell>
                                            <div className="flex flex-wrap gap-1">
                                                {apiKey.scopes.length ? (
                                                    apiKey.scopes.map((scope) => (
                                                        <Badge key={scope} variant="secondary" className="font-mono text-[11px]">
                                                            {scope}
                                                        </Badge>
                                                    ))
                                                ) : (
                                                    <span className="text-muted-foreground">None</span>
                                                )}
                                            </div>
                                        </TableCell>
                                        <TableCell>
                                            {formatDistanceToNow(new Date(apiKey.createdAt), { addSuffix: true })}
                                        </TableCell>
                                        <TableCell>
                                            {apiKey.lastUsedAt
                                                ? formatDistanceToNow(new Date(apiKey.lastUsedAt), { addSuffix: true })
                                                : "Never"}
                                        </TableCell>
                                        <TableCell>
                                            {!apiKey.expiresAt ? (
                                                "Never"
                                            ) : isKeyExpired(apiKey.expiresAt) ? (
                                                <span className="font-medium text-destructive">
                                                    Expired {format(new Date(apiKey.expiresAt), "d MMM yyyy")}
                                                </span>
                                            ) : (
                                                format(new Date(apiKey.expiresAt), "d MMM yyyy")
                                            )}
                                        </TableCell>
                                        <TableCell className="text-right">
                                            <Button
                                                size="sm"
                                                variant="outline"
                                                className="text-destructive hover:text-destructive"
                                                disabled={removeKey.isPending}
                                                onClick={() => setRevoking({ id: apiKey.id, name: apiKey.name })}
                                            >
                                                Revoke
                                            </Button>
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    )}
                </CardContent>
            </Card>

            <Card className="shadow-none">
                <CardHeader>
                    <CardTitle className="text-base">Using the API</CardTitle>
                    <CardDescription>
                        Send the key as <code>Authorization: Bearer &lt;key&gt;</code> or{" "}
                        <code>X-API-Key: &lt;key&gt;</code>.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4 text-sm">
                    <ul className="space-y-2 text-muted-foreground">
                        <li>
                            <code className="text-foreground">GET /api/v1/workflows</code> lists your workflows.
                            Scope <code>workflows:read</code>.
                        </li>
                        <li>
                            <code className="text-foreground">POST /api/v1/workflows/:id/execute</code> runs a
                            workflow from its manual trigger. The JSON body becomes the
                            run&apos;s variables, so <code>{"{{customer}}"}</code> works in its nodes.
                            Scope <code>workflows:execute</code>.
                        </li>
                        <li>
                            <code className="text-foreground">GET /api/v1/executions/:id</code> returns the
                            status and, once finished, the output. Scope <code>executions:read</code>.
                        </li>
                        <li>
                            <code className="text-foreground">GET /api/v1/executions?workflowId=...</code> lists
                            recent executions. Scope <code>executions:read</code>.
                        </li>
                        <li>
                            <code className="text-foreground">POST /api/v1/executions/:id/retry</code> runs an
                            execution again with the same starting data. Scope <code>executions:retry</code>.
                        </li>
                        <li>
                            A key without the scope a route needs gets <code>403</code>; an expired or
                            revoked key gets <code>401</code>.
                        </li>
                    </ul>
                    <pre className="overflow-x-auto rounded-lg bg-muted p-4 text-xs">{example}</pre>
                </CardContent>
            </Card>

            <Dialog open={createOpen} onOpenChange={closeDialog}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>{newKey ? "Copy your API key" : "New API key"}</DialogTitle>
                        <DialogDescription>
                            {newKey
                                ? "This is the only time the key is shown. Store it somewhere safe."
                                : "Name the key, and give it only the scopes its job needs."}
                        </DialogDescription>
                    </DialogHeader>

                    {newKey ? (
                        <div className="flex gap-2">
                            <Input value={newKey} readOnly className="font-mono text-xs" />
                            <Button
                                type="button"
                                size="icon"
                                variant="outline"
                                onClick={() => copy(newKey, "API key")}
                            >
                                <CopyIcon className="size-4" />
                            </Button>
                        </div>
                    ) : (
                        <form
                            className="space-y-4"
                            onSubmit={(event) => {
                                event.preventDefault();
                                if (name.trim() && scopes.length) {
                                    createKey.mutate({ name, scopes, expiresOn });
                                }
                            }}
                        >
                            <div className="space-y-2">
                                <Label htmlFor="api-key-name">Name</Label>
                                <Input
                                    id="api-key-name"
                                    placeholder="My website"
                                    value={name}
                                    onChange={(event) => setName(event.target.value)}
                                    autoFocus
                                />
                            </div>
                            <div className="space-y-2">
                                <Label>Scopes</Label>
                                {API_SCOPES.map((scope) => (
                                    <label key={scope} className="flex items-center gap-2 text-sm">
                                        <Checkbox
                                            checked={scopes.includes(scope)}
                                            onCheckedChange={(checked) => toggleScope(scope, checked === true)}
                                        />
                                        <code className="text-xs">{scope}</code>
                                        <span className="text-muted-foreground">
                                            {API_SCOPE_DESCRIPTIONS[scope]}
                                        </span>
                                    </label>
                                ))}
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="api-key-expiry">Expiry date (Optional)</Label>
                                <Input
                                    id="api-key-expiry"
                                    type="date"
                                    min={today}
                                    value={expiresOn}
                                    onChange={(event) => setExpiresOn(event.target.value)}
                                />
                                <p className="text-sm text-muted-foreground">
                                    The key stops working at the end of this day (UTC). Leave
                                    empty for a key that never expires.
                                </p>
                            </div>
                            <DialogFooter>
                                <Button
                                    type="submit"
                                    disabled={!name.trim() || !scopes.length || createKey.isPending}
                                >
                                    Create key
                                </Button>
                            </DialogFooter>
                        </form>
                    )}

                    {newKey && (
                        <DialogFooter>
                            <Button type="button" onClick={() => closeDialog(false)}>
                                Done
                            </Button>
                        </DialogFooter>
                    )}
                </DialogContent>
            </Dialog>

            <Dialog open={!!revoking} onOpenChange={(open) => !open && setRevoking(null)}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Revoke this API key?</DialogTitle>
                        <DialogDescription>
                            &quot;{revoking?.name}&quot; stops working at once, and this cannot
                            be undone.
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button type="button" variant="outline" onClick={() => setRevoking(null)}>
                            Cancel
                        </Button>
                        <Button
                            type="button"
                            variant="destructive"
                            disabled={removeKey.isPending}
                            onClick={() => revoking && removeKey.mutate({ id: revoking.id })}
                        >
                            Revoke key
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
};
