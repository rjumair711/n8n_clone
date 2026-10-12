"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeftIcon, PencilIcon, PlayIcon, PlusIcon, Trash2Icon } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
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
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import {
    ModelPicker,
    useModelChoice,
} from "@/features/ai-builder/components/builder-shared";
import { formatUsd } from "@/lib/ai-cost";
import { useTRPC } from "@/trpc/client";
import {
    EVAL_EXPECTED_LABELS,
    EVAL_MAX_COMPARE,
    EVAL_MAX_ROWS,
    EVAL_SCORERS,
    EVAL_SCORER_LABELS,
    EVAL_TRIGGER_LABELS,
    formatDuration,
    formatScore,
    isEvalScorer,
    isEvalTrigger,
    type EvalScorer,
    type EvalTrigger,
} from "../lib/scoring";
import { parsePastedRows } from "../lib/rows";

const short = (text: string | null | undefined, limit = 140) =>
    !text ? "" : text.length > limit ? `${text.slice(0, limit)}...` : text;

// =========================================================================
// DATASET SETTINGS
// =========================================================================
type DatasetValues = {
    id?: string;
    name: string;
    trigger: string;
    scorer: string;
    outputPath: string;
    criteria: string | null;
    judgeModel?: unknown;
};

const CRITERIA_HELP: Record<EvalScorer, string> = {
    exact: "",
    contains: "",
    json_schema: "A JSON schema for every row that has none of its own.",
    llm_judge: "What a good answer is, for every row. A row's own expected answer is given to the judge too.",
};

const DatasetDialog = ({
    workflowId,
    dataset,
    triggers,
    variables,
    open,
    onOpenChange,
    onSaved,
}: {
    workflowId: string;
    // Absent: a new dataset
    dataset?: DatasetValues;
    triggers: EvalTrigger[];
    variables: string[];
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onSaved: (id: string) => void;
}) => {
    const trpc = useTRPC();
    const judge = useModelChoice(open);

    const [name, setName] = useState("");
    const [trigger, setTrigger] = useState<string>("");
    const [scorer, setScorer] = useState<EvalScorer>("contains");
    const [outputPath, setOutputPath] = useState("");
    const [criteria, setCriteria] = useState("");

    useEffect(() => {
        if (!open) return;

        setName(dataset?.name ?? "");
        setTrigger(dataset?.trigger ?? triggers[0] ?? "");
        setScorer(isEvalScorer(dataset?.scorer) ? dataset.scorer : "contains");
        setOutputPath(dataset?.outputPath ?? "");
        setCriteria(dataset?.criteria ?? "");

        // The judge model this dataset was saved with
        const saved = dataset?.judgeModel as
            | { credentialId?: string; model?: string; provider?: string; baseUrl?: string }
            | null
            | undefined;

        if (saved?.credentialId) {
            judge.update({
                credentialId: saved.credentialId,
                model: saved.model ?? "",
                ...(saved.provider ? { provider: saved.provider } : {}),
                baseUrl: saved.baseUrl ?? "",
            });
        }
        // Only when the dialog opens
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open]);

    const options = {
        onSuccess: (saved: { id: string }) => {
            toast.success(dataset?.id ? "Dataset saved" : "Dataset created");
            onSaved(saved.id);
            onOpenChange(false);
        },
        onError: (error: { message: string }) => {
            toast.error(error.message);
        },
    };
    const create = useMutation(trpc.evaluations.createDataset.mutationOptions(options));
    const update = useMutation(trpc.evaluations.updateDataset.mutationOptions(options));
    const pending = create.isPending || update.isPending;

    const save = () => {
        if (!isEvalTrigger(trigger)) {
            toast.error("Pick the trigger the rows start from.");
            return;
        }

        const values = {
            name,
            trigger,
            scorer,
            outputPath,
            criteria,
            judgeModel: scorer === "llm_judge" ? judge.input : null,
        };

        if (dataset?.id) update.mutate({ id: dataset.id, ...values });
        else create.mutate({ workflowId, ...values });
    };

    // A trigger the dataset was saved with stays in the list, also when
    // the workflow no longer has it
    const triggerOptions = [
        ...new Set<string>([...triggers, ...(dataset?.trigger ? [dataset.trigger] : [])]),
    ].filter(isEvalTrigger);

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
                <DialogHeader>
                    <DialogTitle>{dataset?.id ? "Dataset settings" : "New dataset"}</DialogTitle>
                    <DialogDescription>
                        A dataset is a list of inputs with what is expected for each. The
                        workflow runs once per row, and each result is scored.
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-4">
                    <div className="space-y-1.5">
                        <Label htmlFor="eval-name">Name</Label>
                        <Input
                            id="eval-name"
                            value={name}
                            onChange={(event) => setName(event.target.value)}
                            placeholder="Support questions"
                            maxLength={100}
                        />
                    </div>

                    <div className="space-y-1.5">
                        <Label>Start each row from</Label>
                        {triggerOptions.length === 0 ? (
                            <p className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">
                                The saved workflow has none of the triggers a row can start
                                from: Chat Trigger, Manual Trigger, Webhook, or When Executed
                                by Another Workflow. Add one and save the workflow.
                            </p>
                        ) : (
                            <Select value={trigger} onValueChange={setTrigger}>
                                <SelectTrigger className="w-full">
                                    <SelectValue placeholder="Select a trigger" />
                                </SelectTrigger>
                                <SelectContent>
                                    {triggerOptions.map((value) => (
                                        <SelectItem key={value} value={value}>
                                            {EVAL_TRIGGER_LABELS[value]}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        )}
                    </div>

                    <div className="space-y-1.5">
                        <Label htmlFor="eval-output">Output to score</Label>
                        <Input
                            id="eval-output"
                            value={outputPath}
                            onChange={(event) => setOutputPath(event.target.value)}
                            placeholder={variables[0] ? `${variables[0]}.text` : "agent.text"}
                            maxLength={200}
                            className="font-mono text-sm"
                        />
                        <p className="text-xs text-muted-foreground">
                            Which part of the run&apos;s data is scored, written like a
                            variable without the braces: <code>agent.text</code>. Empty: all
                            of the run&apos;s data.
                            {variables.length > 0 && (
                                <> Variables of this workflow: {variables.slice(0, 12).join(", ")}.</>
                            )}
                        </p>
                    </div>

                    <div className="space-y-1.5">
                        <Label>Score by</Label>
                        <Select
                            value={scorer}
                            onValueChange={(value) => isEvalScorer(value) && setScorer(value)}
                        >
                            <SelectTrigger className="w-full">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                {EVAL_SCORERS.map((value) => (
                                    <SelectItem key={value} value={value}>
                                        {EVAL_SCORER_LABELS[value]}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        <p className="text-xs text-muted-foreground">
                            Each row&apos;s own value is its{" "}
                            {EVAL_EXPECTED_LABELS[scorer].toLowerCase()}.
                        </p>
                    </div>

                    {(scorer === "json_schema" || scorer === "llm_judge") && (
                        <div className="space-y-1.5">
                            <Label htmlFor="eval-criteria">
                                {scorer === "json_schema" ? "JSON schema for all rows" : "Grading criteria for all rows"}
                            </Label>
                            <Textarea
                                id="eval-criteria"
                                value={criteria}
                                onChange={(event) => setCriteria(event.target.value)}
                                rows={scorer === "json_schema" ? 6 : 4}
                                className={scorer === "json_schema" ? "font-mono text-xs" : undefined}
                                placeholder={
                                    scorer === "json_schema"
                                        ? '{ "type": "object", "required": ["category"], "properties": { "category": { "type": "string" } } }'
                                        : "The answer is polite, in the customer's language, and never promises a refund."
                                }
                            />
                            <p className="text-xs text-muted-foreground">{CRITERIA_HELP[scorer]}</p>
                        </div>
                    )}

                    {scorer === "llm_judge" && (
                        <div className="space-y-1.5">
                            <Label>Judge</Label>
                            <ModelPicker
                                state={judge}
                                sends="Each row's input, expected answer and output are sent to this model to be graded,"
                            />
                        </div>
                    )}
                </div>

                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
                        Cancel
                    </Button>
                    <Button
                        onClick={save}
                        disabled={
                            pending ||
                            !name.trim() ||
                            !isEvalTrigger(trigger) ||
                            (scorer === "llm_judge" && !judge.ready)
                        }
                    >
                        {pending ? "Saving..." : "Save"}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};

// =========================================================================
// ROWS
// =========================================================================
type Row = { id: string; position: number; input: string; expected: string | null };

const RowDialog = ({
    datasetId,
    scorer,
    row,
    open,
    onOpenChange,
    onSaved,
}: {
    datasetId: string;
    scorer: EvalScorer;
    // Absent: new rows
    row?: Row;
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onSaved: () => void;
}) => {
    const trpc = useTRPC();
    const [input, setInput] = useState("");
    const [expected, setExpected] = useState("");
    // Many rows at once, as JSON
    const [paste, setPaste] = useState(false);
    const [pasted, setPasted] = useState("");

    useEffect(() => {
        if (!open) return;
        setInput(row?.input ?? "");
        setExpected(row?.expected ?? "");
        setPaste(false);
        setPasted("");
    }, [open, row]);

    const options = {
        onSuccess: () => {
            onSaved();
            onOpenChange(false);
        },
        onError: (error: { message: string }) => {
            toast.error(error.message);
        },
    };
    const add = useMutation(trpc.evaluations.addRows.mutationOptions(options));
    const update = useMutation(trpc.evaluations.updateRow.mutationOptions(options));
    const pending = add.isPending || update.isPending;

    const save = () => {
        if (row) {
            update.mutate({ id: row.id, input, expected });
            return;
        }

        if (!paste) {
            add.mutate({ datasetId, rows: [{ input, expected }] });
            return;
        }

        const parsed = parsePastedRows(pasted);

        if (!parsed.ok) {
            toast.error(parsed.error);
            return;
        }

        add.mutate({ datasetId, rows: parsed.rows });
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
                <DialogHeader>
                    <DialogTitle>{row ? `Row ${row.position}` : "Add rows"}</DialogTitle>
                    <DialogDescription>
                        The input is what the trigger receives: a message, or a JSON object
                        whose fields become the run&apos;s starting data.
                    </DialogDescription>
                </DialogHeader>

                {paste ? (
                    <div className="space-y-1.5">
                        <Label htmlFor="eval-paste">Rows as JSON</Label>
                        <Textarea
                            id="eval-paste"
                            value={pasted}
                            onChange={(event) => setPasted(event.target.value)}
                            rows={12}
                            className="font-mono text-xs"
                            placeholder={'[\n  { "input": "Where is my order?", "expected": "tracking" },\n  { "input": "Can I get a refund?", "expected": "refund policy" }\n]'}
                        />
                        <p className="text-xs text-muted-foreground">
                            A JSON list of objects with <code>input</code> and, when there is
                            one, <code>expected</code>. Either may be text or an object. Up to{" "}
                            {EVAL_MAX_ROWS} rows per dataset.
                        </p>
                    </div>
                ) : (
                    <div className="space-y-4">
                        <div className="space-y-1.5">
                            <Label htmlFor="eval-input">Input</Label>
                            <Textarea
                                id="eval-input"
                                value={input}
                                onChange={(event) => setInput(event.target.value)}
                                rows={4}
                                placeholder="Where is my order?"
                            />
                        </div>
                        <div className="space-y-1.5">
                            <Label htmlFor="eval-expected">{EVAL_EXPECTED_LABELS[scorer]}</Label>
                            <Textarea
                                id="eval-expected"
                                value={expected}
                                onChange={(event) => setExpected(event.target.value)}
                                rows={4}
                                className={scorer === "json_schema" ? "font-mono text-xs" : undefined}
                            />
                            {(scorer === "json_schema" || scorer === "llm_judge") && (
                                <p className="text-xs text-muted-foreground">
                                    Empty: the dataset&apos;s own{" "}
                                    {scorer === "json_schema" ? "schema" : "grading criteria"} is used.
                                </p>
                            )}
                        </div>
                    </div>
                )}

                <DialogFooter className="sm:justify-between">
                    {row ? (
                        <span />
                    ) : (
                        <Button variant="ghost" size="sm" onClick={() => setPaste(!paste)} disabled={pending}>
                            {paste ? "Add one row" : "Paste many rows as JSON"}
                        </Button>
                    )}
                    <div className="flex gap-2">
                        <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
                            Cancel
                        </Button>
                        <Button
                            onClick={save}
                            disabled={pending || (paste ? !pasted.trim() : !input.trim())}
                        >
                            {pending ? "Saving..." : row ? "Save" : "Add"}
                        </Button>
                    </div>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};

// =========================================================================
// ONE DATASET: ROWS, RUNS AND THE COMPARISON
// =========================================================================
const STATUS_LABELS: Record<string, string> = {
    RUNNING: "Running",
    SUCCESS: "Finished",
    FAILED: "Failed",
    CANCELLED: "Cancelled",
};

const DatasetView = ({
    workflowId,
    datasetId,
    triggers,
    variables,
    canRun,
    onRemoved,
    onChanged,
}: {
    workflowId: string;
    datasetId: string;
    triggers: EvalTrigger[];
    variables: string[];
    // False when the workflow does not save its runs' data
    canRun: boolean;
    onRemoved: () => void;
    onChanged: () => void;
}) => {
    const trpc = useTRPC();
    const queryClient = useQueryClient();

    const datasetQuery = trpc.evaluations.getDataset.queryOptions({ id: datasetId });
    const runsQuery = trpc.evaluations.getRuns.queryOptions({ datasetId });

    const { data: dataset, isLoading } = useQuery(datasetQuery);
    const { data: runs } = useQuery({
        ...runsQuery,
        // While a run is going, its progress is read again every few seconds
        refetchInterval: (query) =>
            query.state.data?.some((run) => run.status === "RUNNING") ? 3000 : false,
    });

    const [settingsOpen, setSettingsOpen] = useState(false);
    const [rowOpen, setRowOpen] = useState(false);
    const [editing, setEditing] = useState<Row | undefined>();
    const [label, setLabel] = useState("");
    const [selected, setSelected] = useState<string[]>([]);

    // Another dataset: nothing of the last one stays selected
    useEffect(() => {
        setSelected([]);
        setLabel("");
    }, [datasetId]);

    const anyRunning = runs?.some((run) => run.status === "RUNNING") ?? false;
    const compared = selected.filter((id) => runs?.some((run) => run.id === id));

    const { data: results } = useQuery({
        ...trpc.evaluations.getResults.queryOptions({ datasetId, runIds: compared }),
        enabled: compared.length > 0,
        refetchInterval: anyRunning ? 3000 : false,
    });

    const refreshRows = () => {
        queryClient.invalidateQueries(datasetQuery);
        onChanged();
    };
    const refreshRuns = () => {
        queryClient.invalidateQueries(runsQuery);
        onChanged();
    };
    const onError = (error: { message: string }) => {
        toast.error(error.message);
    };

    const removeRow = useMutation(
        trpc.evaluations.removeRow.mutationOptions({ onSuccess: refreshRows, onError })
    );
    const removeDataset = useMutation(
        trpc.evaluations.removeDataset.mutationOptions({
            onSuccess: () => {
                toast.success("Dataset deleted");
                onRemoved();
            },
            onError,
        })
    );
    const startRun = useMutation(
        trpc.evaluations.startRun.mutationOptions({
            onSuccess: (run) => {
                toast.success("Evaluation started");
                setLabel("");
                // The new run is shown right away
                setSelected((current) => [run.id, ...current].slice(0, EVAL_MAX_COMPARE));
                refreshRuns();
            },
            onError,
        })
    );
    const cancelRun = useMutation(
        trpc.evaluations.cancelRun.mutationOptions({ onSuccess: refreshRuns, onError })
    );
    const removeRun = useMutation(
        trpc.evaluations.removeRun.mutationOptions({ onSuccess: refreshRuns, onError })
    );

    if (isLoading || !dataset) {
        return <p className="text-sm text-muted-foreground">Loading dataset...</p>;
    }

    const scorer: EvalScorer = isEvalScorer(dataset.scorer) ? dataset.scorer : "contains";

    const toggle = (id: string) =>
        setSelected((current) =>
            current.includes(id)
                ? current.filter((item) => item !== id)
                : current.length >= EVAL_MAX_COMPARE
                    ? current
                    : [...current, id]
        );

    // The compared runs in the order they were made, oldest first
    const columns = (runs ?? []).filter((run) => compared.includes(run.id)).reverse();

    // One line per row of the dataset, with each run's result for it. A
    // row is the same row in two runs when it has the same id; a row
    // that was deleted since is matched by its place.
    const lines = new Map<
        string,
        { position: number; input: string; expected: string | null; byRun: Map<string, NonNullable<typeof results>[number]> }
    >();

    for (const result of results ?? []) {
        const key = result.rowId ?? `position-${result.position}`;
        const line = lines.get(key) ?? {
            position: result.position,
            input: result.input,
            expected: result.expected,
            byRun: new Map(),
        };

        line.byRun.set(result.runId, result);
        lines.set(key, line);
    }

    const best = <T,>(values: (T | null)[], better: (a: T, b: T) => boolean) => {
        const known = values.filter((value): value is T => value !== null);
        if (known.length < 2) return null;

        return known.reduce((top, value) => (better(value, top) ? value : top));
    };
    const finished = columns.filter((run) => run.status === "SUCCESS");
    const bestScore = best(finished.map((run) => run.score), (a, b) => a > b);
    const bestCost = best(finished.map((run) => run.costUsd), (a, b) => a < b);
    const bestTime = best(finished.map((run) => run.avgDurationMs), (a, b) => a < b);
    const mark = (isBest: boolean) => (isBest ? "font-semibold text-emerald-600 dark:text-emerald-400" : "");

    return (
        <div className="space-y-6">
            <Card>
                <CardHeader>
                    <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                            <CardTitle>{dataset.name}</CardTitle>
                            <CardDescription>
                                {EVAL_SCORER_LABELS[scorer]} on{" "}
                                {dataset.outputPath ? <code>{dataset.outputPath}</code> : "all of the run's data"}
                                {isEvalTrigger(dataset.trigger)
                                    ? `, started from the ${EVAL_TRIGGER_LABELS[dataset.trigger].split(":")[0]}`
                                    : ""}
                                . {dataset.rows.length} of {EVAL_MAX_ROWS} rows.
                            </CardDescription>
                        </div>
                        <div className="flex gap-2">
                            <Button variant="outline" size="sm" onClick={() => setSettingsOpen(true)}>
                                Settings
                            </Button>
                            <Button
                                variant="outline"
                                size="sm"
                                disabled={removeDataset.isPending || anyRunning}
                                onClick={() => {
                                    if (window.confirm(`Delete the dataset "${dataset.name}" with its rows and all of its runs?`)) {
                                        removeDataset.mutate({ id: dataset.id });
                                    }
                                }}
                            >
                                Delete
                            </Button>
                        </div>
                    </div>
                </CardHeader>
                <CardContent className="space-y-3">
                    {dataset.rows.length === 0 ? (
                        <p className="text-sm text-muted-foreground">
                            No rows yet. Add the inputs this workflow should handle, and what
                            you expect for each.
                        </p>
                    ) : (
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead className="w-10">#</TableHead>
                                    <TableHead>Input</TableHead>
                                    <TableHead>{EVAL_EXPECTED_LABELS[scorer]}</TableHead>
                                    <TableHead className="w-24" />
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {dataset.rows.map((row, index) => (
                                    <TableRow key={row.id}>
                                        <TableCell className="text-muted-foreground">{index + 1}</TableCell>
                                        <TableCell className="max-w-xs whitespace-pre-wrap break-words text-sm">
                                            {short(row.input)}
                                        </TableCell>
                                        <TableCell className="max-w-xs whitespace-pre-wrap break-words text-sm text-muted-foreground">
                                            {short(row.expected) || "(the dataset's own)"}
                                        </TableCell>
                                        <TableCell className="text-right">
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                title="Edit row"
                                                onClick={() => {
                                                    setEditing({ ...row, position: index + 1 });
                                                    setRowOpen(true);
                                                }}
                                            >
                                                <PencilIcon className="size-4" />
                                            </Button>
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                title="Delete row"
                                                disabled={removeRow.isPending}
                                                onClick={() => removeRow.mutate({ id: row.id })}
                                            >
                                                <Trash2Icon className="size-4" />
                                            </Button>
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    )}
                    <Button
                        variant="outline"
                        size="sm"
                        disabled={dataset.rows.length >= EVAL_MAX_ROWS}
                        onClick={() => {
                            setEditing(undefined);
                            setRowOpen(true);
                        }}
                    >
                        <PlusIcon className="size-4" />
                        Add rows
                    </Button>
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle>Runs</CardTitle>
                    <CardDescription>
                        A run executes the saved workflow once for every row, for real: each
                        row is an execution of your plan, its model calls are paid for, and
                        its nodes do what they do (a message is sent, a record is written).
                        To compare two models or two prompts, run, change the workflow, save,
                        and run again.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="flex flex-wrap items-end gap-2">
                        <div className="min-w-56 flex-1 space-y-1.5">
                            <Label htmlFor="eval-label">Name this run</Label>
                            <Input
                                id="eval-label"
                                value={label}
                                onChange={(event) => setLabel(event.target.value)}
                                placeholder="gpt-4o-mini, shorter prompt..."
                                maxLength={60}
                            />
                        </div>
                        <Button
                            disabled={startRun.isPending || anyRunning || !canRun || dataset.rows.length === 0}
                            onClick={() => startRun.mutate({ datasetId, label })}
                        >
                            <PlayIcon className="size-4" />
                            {anyRunning ? "Running..." : `Run ${dataset.rows.length} rows`}
                        </Button>
                    </div>
                    {!canRun && (
                        <p className="text-sm text-destructive">
                            This workflow is set to &quot;Don&apos;t save node input/output&quot;, so
                            there is no result to score. Turn saving on in the workflow&apos;s
                            settings to evaluate it.
                        </p>
                    )}

                    {runs && runs.length > 0 && (
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead className="w-8" />
                                    <TableHead>Run</TableHead>
                                    <TableHead>Score</TableHead>
                                    <TableHead>Passed</TableHead>
                                    <TableHead>Cost</TableHead>
                                    <TableHead>Avg. time</TableHead>
                                    <TableHead>Models</TableHead>
                                    <TableHead className="w-24" />
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {runs.map((run) => (
                                    <TableRow key={run.id}>
                                        <TableCell>
                                            <Checkbox
                                                checked={compared.includes(run.id)}
                                                onCheckedChange={() => toggle(run.id)}
                                                aria-label={`Compare ${run.label}`}
                                            />
                                        </TableCell>
                                        <TableCell>
                                            <div className="font-medium">{run.label}</div>
                                            <div className="text-xs text-muted-foreground">
                                                {new Date(run.startedAt).toLocaleString()}
                                                {run.workflowVersionNumber ? ` · version ${run.workflowVersionNumber}` : ""}
                                            </div>
                                            {run.status !== "SUCCESS" && (
                                                <Badge
                                                    variant={run.status === "FAILED" ? "destructive" : "secondary"}
                                                    className="mt-1"
                                                    title={run.error ?? undefined}
                                                >
                                                    {STATUS_LABELS[run.status] ?? run.status}
                                                    {run.status === "RUNNING" ? ` ${run.rowsDone}/${run.rowsTotal}` : ""}
                                                </Badge>
                                            )}
                                        </TableCell>
                                        <TableCell>{run.rowsDone > 0 ? formatScore(run.score) : "-"}</TableCell>
                                        <TableCell>
                                            {run.rowsPassed}/{run.rowsTotal}
                                        </TableCell>
                                        <TableCell title={run.judgeCostUsd ? `Plus ${formatUsd(run.judgeCostUsd)} for the judge` : undefined}>
                                            {run.rowsDone > 0 ? formatUsd(run.costUsd) : "-"}
                                        </TableCell>
                                        <TableCell>{formatDuration(run.avgDurationMs)}</TableCell>
                                        <TableCell className="max-w-48 break-words text-xs text-muted-foreground">
                                            {run.models.join(", ") || "-"}
                                        </TableCell>
                                        <TableCell className="text-right">
                                            {run.status === "RUNNING" ? (
                                                <Button
                                                    variant="outline"
                                                    size="sm"
                                                    disabled={cancelRun.isPending}
                                                    onClick={() => cancelRun.mutate({ id: run.id })}
                                                >
                                                    Cancel
                                                </Button>
                                            ) : (
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    title="Delete run"
                                                    disabled={removeRun.isPending}
                                                    onClick={() => removeRun.mutate({ id: run.id })}
                                                >
                                                    <Trash2Icon className="size-4" />
                                                </Button>
                                            )}
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    )}
                    {runs && runs.length > 1 && (
                        <p className="text-xs text-muted-foreground">
                            Tick up to {EVAL_MAX_COMPARE} runs to compare them row by row.
                        </p>
                    )}
                </CardContent>
            </Card>

            {columns.length > 0 && (
                <Card>
                    <CardHeader>
                        <CardTitle>{columns.length > 1 ? "Comparison" : "Results"}</CardTitle>
                        <CardDescription>
                            {columns.length > 1
                                ? "The best score, lowest cost and shortest time of the finished runs are marked. Cost is what the workflow's own model calls cost; the judge's is listed apart."
                                : "Tick another run to compare it with this one."}
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="overflow-x-auto">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead className="min-w-56" />
                                    {columns.map((run) => (
                                        <TableHead key={run.id} className="min-w-56">
                                            {run.label}
                                        </TableHead>
                                    ))}
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                <TableRow>
                                    <TableCell className="font-medium">Score</TableCell>
                                    {columns.map((run) => (
                                        <TableCell key={run.id} className={mark(run.status === "SUCCESS" && run.score === bestScore)}>
                                            {formatScore(run.score)} ({run.rowsPassed}/{run.rowsTotal} passed)
                                        </TableCell>
                                    ))}
                                </TableRow>
                                <TableRow>
                                    <TableCell className="font-medium">Cost</TableCell>
                                    {columns.map((run) => (
                                        <TableCell key={run.id} className={mark(run.status === "SUCCESS" && run.costUsd === bestCost)}>
                                            {formatUsd(run.costUsd)}
                                            {run.judgeCostUsd ? ` + ${formatUsd(run.judgeCostUsd)} judge` : ""}
                                        </TableCell>
                                    ))}
                                </TableRow>
                                <TableRow>
                                    <TableCell className="font-medium">Average time per row</TableCell>
                                    {columns.map((run) => (
                                        <TableCell key={run.id} className={mark(run.status === "SUCCESS" && run.avgDurationMs === bestTime)}>
                                            {formatDuration(run.avgDurationMs)}
                                        </TableCell>
                                    ))}
                                </TableRow>
                                <TableRow>
                                    <TableCell className="font-medium">Models</TableCell>
                                    {columns.map((run) => (
                                        <TableCell key={run.id} className="break-words text-xs">
                                            {run.models.join(", ") || "-"}
                                            {run.workflowVersionNumber ? ` (version ${run.workflowVersionNumber})` : ""}
                                        </TableCell>
                                    ))}
                                </TableRow>
                                {[...lines.values()].map((line, index) => (
                                    <TableRow key={index} className="align-top">
                                        <TableCell className="max-w-xs whitespace-pre-wrap break-words text-sm">
                                            <div>{short(line.input, 300)}</div>
                                            {line.expected && (
                                                <div className="mt-1 text-xs text-muted-foreground">
                                                    Expected: {short(line.expected, 300)}
                                                </div>
                                            )}
                                        </TableCell>
                                        {columns.map((run) => {
                                            const result = line.byRun.get(run.id);

                                            if (!result) {
                                                return (
                                                    <TableCell key={run.id} className="text-xs text-muted-foreground">
                                                        Not in this run
                                                    </TableCell>
                                                );
                                            }

                                            if (result.pending) {
                                                return (
                                                    <TableCell key={run.id} className="text-xs text-muted-foreground">
                                                        {run.status === "RUNNING" ? "Waiting..." : "Not run"}
                                                    </TableCell>
                                                );
                                            }

                                            return (
                                                <TableCell key={run.id} className="max-w-xs whitespace-pre-wrap break-words text-sm">
                                                    <div className="flex flex-wrap items-center gap-2">
                                                        <Badge variant={result.passed ? "secondary" : "destructive"}>
                                                            {result.passed ? "Pass" : "Fail"}
                                                        </Badge>
                                                        <span className="text-xs text-muted-foreground">
                                                            {formatScore(result.score)} · {formatDuration(result.durationMs)} ·{" "}
                                                            {formatUsd(result.costUsd)}
                                                        </span>
                                                    </div>
                                                    {result.output && <div className="mt-1">{short(result.output, 400)}</div>}
                                                    <div className="mt-1 text-xs text-muted-foreground">
                                                        {result.error ?? result.reason}
                                                    </div>
                                                    {result.executionId && (
                                                        <Link
                                                            href={`/executions/${result.executionId}`}
                                                            className="text-xs underline"
                                                        >
                                                            Open execution
                                                        </Link>
                                                    )}
                                                </TableCell>
                                            );
                                        })}
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </CardContent>
                </Card>
            )}

            <DatasetDialog
                workflowId={workflowId}
                dataset={dataset}
                triggers={triggers}
                variables={variables}
                open={settingsOpen}
                onOpenChange={setSettingsOpen}
                onSaved={refreshRows}
            />
            <RowDialog
                datasetId={datasetId}
                scorer={scorer}
                row={editing}
                open={rowOpen}
                onOpenChange={setRowOpen}
                onSaved={refreshRows}
            />
        </div>
    );
};

// =========================================================================
// THE PAGE
// =========================================================================
/**
 * A workflow's evaluations: its datasets, the runs of each, and the runs
 * compared.
 */
export const Evaluations = ({ workflowId }: { workflowId: string }) => {
    const trpc = useTRPC();
    const queryClient = useQueryClient();

    const overviewQuery = trpc.evaluations.getOverview.queryOptions({ workflowId });
    const { data, isLoading, error } = useQuery(overviewQuery);

    const [datasetId, setDatasetId] = useState<string | null>(null);
    const [createOpen, setCreateOpen] = useState(false);

    const refresh = () => queryClient.invalidateQueries(overviewQuery);

    if (isLoading) {
        return <p className="p-6 text-sm text-muted-foreground">Loading evaluations...</p>;
    }

    if (error || !data) {
        return <p className="p-6 text-sm text-destructive">{error?.message ?? "Workflow not found."}</p>;
    }

    // The picked dataset, or the first one
    const current = data.datasets.find((dataset) => dataset.id === datasetId) ?? data.datasets[0];

    return (
        <div className="mx-auto w-full max-w-6xl space-y-6 p-4 md:px-10 md:py-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                    <Link
                        href={`/workflows/${workflowId}`}
                        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
                    >
                        <ArrowLeftIcon className="size-4" />
                        {data.workflow.name}
                    </Link>
                    <h1 className="text-xl font-semibold">Evaluations</h1>
                    <p className="text-sm text-muted-foreground">
                        Run this workflow over a set of test inputs, score the answers, and
                        compare runs by score, cost and time.
                    </p>
                </div>
                <Button onClick={() => setCreateOpen(true)}>
                    <PlusIcon className="size-4" />
                    New dataset
                </Button>
            </div>

            {data.datasets.length === 0 ? (
                <Card>
                    <CardContent className="py-10 text-center text-sm text-muted-foreground">
                        No datasets yet. A dataset is a list of inputs with the expected
                        output, or the grading criteria, for each.
                    </CardContent>
                </Card>
            ) : (
                <>
                    {data.datasets.length > 1 && (
                        <div className="flex flex-wrap gap-2">
                            {data.datasets.map((dataset) => (
                                <Button
                                    key={dataset.id}
                                    variant={dataset.id === current?.id ? "default" : "outline"}
                                    size="sm"
                                    onClick={() => setDatasetId(dataset.id)}
                                >
                                    {dataset.name}
                                    <span className="text-xs opacity-70">{dataset.rows}</span>
                                </Button>
                            ))}
                        </div>
                    )}
                    {current && (
                        <DatasetView
                            key={current.id}
                            workflowId={workflowId}
                            datasetId={current.id}
                            triggers={data.triggers}
                            variables={data.variables}
                            canRun={data.workflow.saveExecutionData}
                            onRemoved={() => {
                                setDatasetId(null);
                                refresh();
                            }}
                            onChanged={refresh}
                        />
                    )}
                </>
            )}

            <DatasetDialog
                workflowId={workflowId}
                triggers={data.triggers}
                variables={data.variables}
                open={createOpen}
                onOpenChange={setCreateOpen}
                onSaved={(id) => {
                    setDatasetId(id);
                    refresh();
                }}
            />
        </div>
    );
};
