"use client";

import { useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BrainIcon, Trash2Icon } from "lucide-react";
import { toast } from "sonner";
import { useTRPC } from "@/trpc/client";
import { hasRole } from "@/lib/workspace-roles";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { SectionSkeleton } from "@/features/settings/components/settings-section";

/**
 * Settings → AI → Contact memory: what AI agents remember about each
 * contact, with a delete button per fact and per contact.
 */
export const ContactMemorySection = () => {
    const trpc = useTRPC();
    const queryClient = useQueryClient();
    const [search, setSearch] = useState("");
    const [page, setPage] = useState(1);

    const workspace = useQuery(trpc.workspaces.getCurrent.queryOptions());
    const canDelete = !!workspace.data && hasRole(workspace.data.current.role, "EDITOR");
    const list = useQuery(trpc.memory.listContacts.queryOptions({ search, page }));

    const refresh = () => queryClient.invalidateQueries({ queryKey: trpc.memory.listContacts.queryKey() });

    const deleteFact = useMutation(trpc.memory.deleteFact.mutationOptions({
        onSuccess: () => { toast.success("Fact deleted"); refresh(); },
        onError: (error) => toast.error(error.message),
    }));
    const deleteContact = useMutation(trpc.memory.deleteContact.mutationOptions({
        onSuccess: (data) => { toast.success(`Deleted ${data.deleted} fact${data.deleted === 1 ? "" : "s"}`); refresh(); },
        onError: (error) => toast.error(error.message),
    }));

    return (
        <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
                Facts an AI Agent saved with Postgres Memory&apos;s &quot;Long-Term Facts&quot;, by Contact ID
                (for example a WhatsApp number). Agents read them in later conversations. Deleting
                a fact removes it for good; the agent no longer knows it.
            </p>
            <Input
                placeholder="Search by contact or fact"
                value={search}
                onChange={(event) => { setSearch(event.target.value); setPage(1); }}
                className="sm:max-w-sm"
            />

            {list.isLoading || !list.data ? (
                <SectionSkeleton rows={3} />
            ) : list.data.contacts.length === 0 ? (
                <Card className="shadow-none">
                    <CardContent className="flex flex-col items-center gap-2 py-10 text-center text-sm text-muted-foreground">
                        <BrainIcon className="size-6" />
                        {search ? "No contact or fact matches." : "No facts are stored yet."}
                    </CardContent>
                </Card>
            ) : (
                <>
                    {list.data.contacts.map((contact) => (
                        <Card key={contact.contactId} className="shadow-none">
                            <CardContent className="space-y-3">
                                <div className="flex flex-wrap items-start justify-between gap-2">
                                    <div className="min-w-0">
                                        <p className="break-all font-medium">{contact.contactId}</p>
                                        <p className="text-xs text-muted-foreground">
                                            {contact.factCount} fact{contact.factCount === 1 ? "" : "s"}
                                            {contact.updatedAt && ` · changed ${formatDistanceToNow(new Date(contact.updatedAt), { addSuffix: true })}`}
                                        </p>
                                    </div>
                                    {canDelete && (
                                        <Button
                                            size="sm"
                                            variant="outline"
                                            disabled={deleteContact.isPending}
                                            onClick={() => {
                                                if (window.confirm(`Delete everything remembered about ${contact.contactId}?`)) {
                                                    deleteContact.mutate({ contactId: contact.contactId });
                                                }
                                            }}
                                        >
                                            <Trash2Icon className="size-4" />
                                            Delete all
                                        </Button>
                                    )}
                                </div>
                                <ul className="divide-y rounded-md border">
                                    {contact.facts.map((fact) => (
                                        <li key={fact.id} className="flex items-start justify-between gap-3 px-3 py-2 text-sm">
                                            <div className="min-w-0">
                                                <span className="font-mono text-xs text-muted-foreground">{fact.key}</span>
                                                <p className="break-words">{fact.value}</p>
                                            </div>
                                            {canDelete && (
                                                <Button
                                                    size="icon"
                                                    variant="ghost"
                                                    aria-label={`Delete ${fact.key}`}
                                                    disabled={deleteFact.isPending}
                                                    onClick={() => deleteFact.mutate({ id: fact.id })}
                                                >
                                                    <Trash2Icon className="size-4" />
                                                </Button>
                                            )}
                                        </li>
                                    ))}
                                </ul>
                            </CardContent>
                        </Card>
                    ))}
                    {list.data.totalPages > 1 && (
                        <div className="flex items-center justify-between text-sm">
                            <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</Button>
                            <span className="text-muted-foreground">Page {list.data.page} of {list.data.totalPages}</span>
                            <Button size="sm" variant="outline" disabled={page >= list.data.totalPages} onClick={() => setPage(page + 1)}>Next</Button>
                        </div>
                    )}
                </>
            )}
        </div>
    );
};
