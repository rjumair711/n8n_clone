"use client";

import { useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeftIcon, TableIcon, Trash2Icon } from "lucide-react";
import { toast } from "sonner";
import { useTRPC } from "@/trpc/client";
import { hasRole } from "@/lib/workspace-roles";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { SectionSkeleton } from "@/features/settings/components/settings-section";

const preview = (data: unknown) => {
    const text = JSON.stringify(data);
    return text.length > 200 ? `${text.slice(0, 199)}…` : text;
};

/** Settings → Workspace → Data tables: the Data Table node's tables and rows. */
export const DataTablesSection = () => {
    const trpc = useTRPC();
    const queryClient = useQueryClient();
    const [openTable, setOpenTable] = useState<string | null>(null);
    const [search, setSearch] = useState("");
    const [page, setPage] = useState(1);

    const workspace = useQuery(trpc.workspaces.getCurrent.queryOptions());
    const canDelete = !!workspace.data && hasRole(workspace.data.current.role, "EDITOR");
    const tables = useQuery(trpc.dataTables.listTables.queryOptions());
    const rows = useQuery({
        ...trpc.dataTables.listRows.queryOptions({ tableId: openTable ?? "", search, page }),
        enabled: !!openTable,
    });

    const refresh = () => {
        queryClient.invalidateQueries({ queryKey: trpc.dataTables.listTables.queryKey() });
        queryClient.invalidateQueries({ queryKey: trpc.dataTables.listRows.queryKey() });
    };
    const deleteRow = useMutation(trpc.dataTables.deleteRow.mutationOptions({
        onSuccess: () => { toast.success("Row deleted"); refresh(); },
        onError: (error) => toast.error(error.message),
    }));
    const deleteTable = useMutation(trpc.dataTables.deleteTable.mutationOptions({
        onSuccess: () => { toast.success("Table deleted"); setOpenTable(null); refresh(); },
        onError: (error) => toast.error(error.message),
    }));

    if (openTable) {
        const data = rows.data;
        return (
            <div className="space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                    <Button size="sm" variant="ghost" onClick={() => { setOpenTable(null); setSearch(""); setPage(1); }}>
                        <ArrowLeftIcon className="size-4" />
                        All tables
                    </Button>
                    {canDelete && data?.table && (
                        <Button
                            size="sm"
                            variant="outline"
                            disabled={deleteTable.isPending}
                            onClick={() => {
                                if (window.confirm(`Delete the table "${data.table!.name}" and all ${data.total} rows?`)) {
                                    deleteTable.mutate({ id: openTable });
                                }
                            }}
                        >
                            <Trash2Icon className="size-4" />
                            Delete table
                        </Button>
                    )}
                </div>
                <h2 className="font-semibold">{data?.table?.name ?? "..."}</h2>
                <Input
                    placeholder="Search by key"
                    value={search}
                    onChange={(event) => { setSearch(event.target.value); setPage(1); }}
                    className="sm:max-w-sm"
                />
                {!data ? (
                    <SectionSkeleton rows={3} />
                ) : data.rows.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No rows{search ? " match" : ""}.</p>
                ) : (
                    <Card className="shadow-none">
                        <CardContent className="p-0">
                            <ul className="divide-y">
                                {data.rows.map((row) => (
                                    <li key={row.id} className="flex items-start justify-between gap-3 px-4 py-3 text-sm">
                                        <div className="min-w-0">
                                            <p className="break-all font-medium">{row.key}</p>
                                            <p className="break-all font-mono text-xs text-muted-foreground">{preview(row.data)}</p>
                                            <p className="text-xs text-muted-foreground">
                                                Changed {formatDistanceToNow(new Date(row.updatedAt), { addSuffix: true })}
                                            </p>
                                        </div>
                                        {canDelete && (
                                            <Button
                                                size="icon"
                                                variant="ghost"
                                                aria-label={`Delete ${row.key}`}
                                                disabled={deleteRow.isPending}
                                                onClick={() => deleteRow.mutate({ id: row.id })}
                                            >
                                                <Trash2Icon className="size-4" />
                                            </Button>
                                        )}
                                    </li>
                                ))}
                            </ul>
                        </CardContent>
                    </Card>
                )}
                {data && data.totalPages > 1 && (
                    <div className="flex items-center justify-between text-sm">
                        <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</Button>
                        <span className="text-muted-foreground">Page {data.page} of {data.totalPages}</span>
                        <Button size="sm" variant="outline" disabled={page >= data.totalPages} onClick={() => setPage(page + 1)}>Next</Button>
                    </div>
                )}
            </div>
        );
    }

    if (tables.isLoading || !tables.data) return <SectionSkeleton rows={3} />;

    if (tables.data.length === 0) {
        return (
            <Card className="shadow-none">
                <CardContent className="flex flex-col items-center gap-2 py-10 text-center text-sm text-muted-foreground">
                    <TableIcon className="size-6" />
                    No data tables yet. A Data Table node creates one the first time it writes a row.
                </CardContent>
            </Card>
        );
    }

    return (
        <ul className="grid gap-3 sm:grid-cols-2">
            {tables.data.map((table) => (
                <li key={table.id}>
                    <button
                        type="button"
                        onClick={() => setOpenTable(table.id)}
                        className="w-full rounded-lg border p-4 text-left transition-colors hover:bg-accent"
                    >
                        <p className="break-all font-medium">{table.name}</p>
                        <p className="text-xs text-muted-foreground">
                            {table.rowCount.toLocaleString("en-US")} row{table.rowCount === 1 ? "" : "s"} · changed{" "}
                            {formatDistanceToNow(new Date(table.updatedAt), { addSuffix: true })}
                        </p>
                    </button>
                </li>
            ))}
        </ul>
    );
};
