"use client";

import {
    createContext,
    useContext,
    useEffect,
    useRef,
    useState,
    type ReactNode,
} from "react";
import { useQuery } from "@tanstack/react-query";
import { Braces, ChevronDown, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { useTRPC } from "@/trpc/client";
import { cn } from "@/lib/utils";

// Set by the workflow editor. Dialogs outside the editor have no workflow,
// so the picker does not render there.
const VariablePickerContext = createContext<{ workflowId: string } | null>(null);

export const VariablePickerProvider = ({
    workflowId,
    children,
}: {
    workflowId: string;
    children: ReactNode;
}) => (
    <VariablePickerContext.Provider value={{ workflowId }}>
        {children}
    </VariablePickerContext.Provider>
);

type InsertMode = "variable" | "path";
type EditableField = HTMLInputElement | HTMLTextAreaElement;

const EDITABLE_SELECTOR =
    'input:not([readonly]):not([type="hidden"]):not([type="number"]):not([data-variable-picker]), textarea:not([readonly])';

const MAX_DEPTH = 6;
const MAX_ARRAY_ITEMS = 20;

// Handlebars needs [brackets] around list indexes and keys that are not
// plain identifiers: items.[0].name, responses.[Your Name]
const toSegment = (key: string, mode: InsertMode) =>
    mode === "path" || /^[A-Za-z_$][\w$]*$/.test(key) ? key : `[${key}]`;

const preview = (value: unknown) => {
    const text = typeof value === "string" ? value : JSON.stringify(value);
    return text.length > 40 ? `${text.slice(0, 40)}...` : text;
};

/**
 * Writes into a React-controlled field the way typing would, so the form
 * library sees the change.
 */
const insertIntoField = (field: EditableField, text: string) => {
    const start = field.selectionStart ?? field.value.length;
    const end = field.selectionEnd ?? field.value.length;
    const next = field.value.slice(0, start) + text + field.value.slice(end);

    const prototype =
        field instanceof HTMLTextAreaElement
            ? HTMLTextAreaElement.prototype
            : HTMLInputElement.prototype;

    Object.getOwnPropertyDescriptor(prototype, "value")?.set?.call(field, next);
    field.dispatchEvent(new Event("input", { bubbles: true }));

    field.focus();
    field.setSelectionRange(start + text.length, start + text.length);
};

const TreeNode = ({
    name,
    value,
    path,
    depth,
    mode,
    onPick,
}: {
    name: string;
    value: unknown;
    path: string[];
    depth: number;
    mode: InsertMode;
    onPick: (path: string[], isObject: boolean) => void;
}) => {
    const isObject = value !== null && typeof value === "object";
    const [open, setOpen] = useState(depth < 1);

    if (!isObject) {
        return (
            <button
                type="button"
                // Keep the caret in the field that is being edited
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => onPick(path, false)}
                className="flex w-full items-baseline gap-2 rounded px-1.5 py-0.5 text-left hover:bg-muted"
                style={{ paddingLeft: depth * 14 + 20 }}
                title={`Insert ${path.map((key) => toSegment(key, mode)).join(".")}`}
            >
                <span className="font-mono text-xs font-medium">{name}</span>
                <span className="truncate font-mono text-xs text-muted-foreground">
                    {preview(value)}
                </span>
            </button>
        );
    }

    const entries = Array.isArray(value)
        ? value.slice(0, MAX_ARRAY_ITEMS).map((entry, index) => [String(index), entry] as const)
        : Object.entries(value as Record<string, unknown>);

    const summary = Array.isArray(value)
        ? `[${value.length} item${value.length === 1 ? "" : "s"}]`
        : `{${entries.length}}`;

    return (
        <div>
            <div
                className="flex items-center gap-1 rounded px-1.5 py-0.5 hover:bg-muted"
                style={{ paddingLeft: depth * 14 }}
            >
                <button
                    type="button"
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => setOpen((current) => !current)}
                    className="text-muted-foreground"
                    aria-label={open ? "Collapse" : "Expand"}
                >
                    {open ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
                </button>
                <button
                    type="button"
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => onPick(path, true)}
                    className="flex items-baseline gap-2 text-left"
                    title="Insert the whole value"
                >
                    <span className="font-mono text-xs font-medium">{name}</span>
                    <span className="font-mono text-xs text-muted-foreground">{summary}</span>
                </button>
            </div>

            {open && depth < MAX_DEPTH &&
                entries.map(([key, entry]) => (
                    <TreeNode
                        key={key}
                        name={key}
                        value={entry}
                        path={[...path, key]}
                        depth={depth + 1}
                        mode={mode}
                        onPick={onPick}
                    />
                ))}
        </div>
    );
};

const VariablePicker = ({ workflowId }: { workflowId: string }) => {
    const trpc = useTRPC();
    const rootRef = useRef<HTMLDivElement>(null);
    const lastField = useRef<EditableField | null>(null);

    const [hasFields, setHasFields] = useState(false);
    const [open, setOpen] = useState(false);
    const [mode, setMode] = useState<InsertMode>("variable");

    // Remember which field of the surrounding dialog was edited last
    useEffect(() => {
        const dialog = rootRef.current?.closest('[data-slot="dialog-content"]');
        if (!dialog) return;

        setHasFields(!!dialog.querySelector(EDITABLE_SELECTOR));

        const handleFocus = (event: Event) => {
            const target = event.target as HTMLElement;
            if (target.matches?.(EDITABLE_SELECTOR)) {
                lastField.current = target as EditableField;
            }
        };

        dialog.addEventListener("focusin", handleFocus);
        return () => dialog.removeEventListener("focusin", handleFocus);
    }, []);

    const { data: latest, isLoading } = useQuery({
        ...trpc.executions.getLatestData.queryOptions({ workflowId }),
        enabled: open,
        staleTime: 0,
    });

    const handlePick = async (path: string[], isObject: boolean) => {
        const joined = path.map((key) => toSegment(key, mode)).join(".");
        const text =
            mode === "path"
                ? joined
                : isObject
                    ? `{{json ${joined}}}`
                    : `{{${joined}}}`;

        const field = lastField.current;

        if (field && document.contains(field)) {
            insertIntoField(field, text);
            return;
        }

        try {
            await navigator.clipboard.writeText(text);
            toast.success(`Copied ${text}`);
        } catch {
            toast.error("Click a field first, then pick a variable");
        }
    };

    const data = (latest?.data ?? {}) as Record<string, unknown>;
    const keys = Object.keys(data);

    return (
        <div
            ref={rootRef}
            className={cn("sticky -top-6 z-10 -mt-2 bg-background pt-2", !hasFields && "hidden")}
        >
            <button
                type="button"
                onClick={() => setOpen((current) => !current)}
                className="flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
            >
                <Braces className="size-3.5" />
                Insert variable
                {open ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
            </button>

            {open && (
                <div className="mt-2 rounded-md border bg-muted/20">
                    <div className="flex items-center justify-between gap-2 border-b px-2 py-1.5">
                        <span className="text-xs text-muted-foreground">
                            {latest
                                ? "Data from the last run. Click a field, then a value."
                                : "Data from the last run"}
                        </span>
                        <div className="flex overflow-hidden rounded border text-xs">
                            {(["variable", "path"] as const).map((option) => (
                                <button
                                    key={option}
                                    type="button"
                                    onMouseDown={(event) => event.preventDefault()}
                                    onClick={() => setMode(option)}
                                    className={cn(
                                        "px-2 py-0.5 font-mono",
                                        mode === option ? "bg-primary text-primary-foreground" : "hover:bg-muted"
                                    )}
                                    title={
                                        option === "variable"
                                            ? "Insert as {{name}}, for text fields"
                                            : "Insert as name, for Input Key and List fields"
                                    }
                                >
                                    {option === "variable" ? "{{name}}" : "name"}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="max-h-56 overflow-y-auto p-1.5">
                        {isLoading ? (
                            <p className="p-2 text-xs text-muted-foreground">Loading...</p>
                        ) : keys.length === 0 ? (
                            <p className="p-2 text-xs text-muted-foreground">
                                No data yet. Run the workflow once and its values
                                will be listed here.
                            </p>
                        ) : (
                            keys.map((key) => (
                                <TreeNode
                                    key={key}
                                    name={key}
                                    value={data[key]}
                                    path={[key]}
                                    depth={0}
                                    mode={mode}
                                    onPick={handlePick}
                                />
                            ))
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};

/**
 * Rendered by every dialog; shows up only inside the workflow editor and
 * only when the dialog has a field to fill in.
 */
export const DialogVariablePicker = () => {
    const context = useContext(VariablePickerContext);

    if (!context) return null;

    return <VariablePicker workflowId={context.workflowId} />;
};
