"use client";

import { ArrowDown, ArrowUp, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  FORM_FIELD_TYPES,
  MAX_FORM_FIELDS,
  parseFormFields,
  readFormFieldEntries,
  type FormFieldEntry,
  type FormFieldType,
} from "@/lib/form-fields";

type Props = {
  // The fields as they are saved on the node: a JSON string
  value: string;
  onChange: (value: string) => void;
  // The variable the submitted values are under, e.g. "form"
  variableName: string;
};

/**
 * The fields of a hosted form: label, type, required, and the options of
 * a dropdown. Each field's value is read by a name made from its label.
 */
export const FormFieldsField = ({ value, onChange, variableName }: Props) => {
  // Rows being typed have no label yet: they are kept until the dialog saves
  const entries = readFormFieldEntries(value);
  // The names the values will have, for the rows that have a label
  const names = parseFormFields(value).map((field) => field.name);

  const update = (next: FormFieldEntry[]) => onChange(JSON.stringify(next));

  const setEntry = (index: number, patch: Partial<FormFieldEntry>) =>
    update(entries.map((entry, position) => (position === index ? { ...entry, ...patch } : entry)));

  const move = (index: number, by: number) => {
    const next = [...entries];
    const [entry] = next.splice(index, 1);
    next.splice(index + by, 0, entry);
    update(next);
  };

  let named = 0;

  return (
    <div className="space-y-3">
      {entries.map((entry, index) => {
        const name = entry.label.trim() ? names[named++] : undefined;

        return (
          <div key={index} className="space-y-2 rounded-lg border bg-muted/20 p-3">
            <div className="flex items-center gap-2">
              <Input
                placeholder="Label, e.g. Your name"
                value={entry.label}
                onChange={(event) => setEntry(index, { label: event.target.value })}
                // Not a field for the variable picker: this is the form's own text
                data-variable-picker="off"
              />
              <Select
                value={entry.type}
                onValueChange={(type) => setEntry(index, { type: type as FormFieldType })}
              >
                <SelectTrigger className="w-40 shrink-0">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FORM_FIELD_TYPES.map((type) => (
                    <SelectItem key={type.value} value={type.value}>
                      {type.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {entry.type === "dropdown" && (
              <Input
                placeholder="Options, separated by commas: Small, Medium, Large"
                value={entry.options}
                onChange={(event) => setEntry(index, { options: event.target.value })}
                data-variable-picker="off"
              />
            )}

            <div className="flex items-center justify-between gap-2">
              <label className="flex items-center gap-2 text-sm">
                <Switch
                  checked={entry.required}
                  onCheckedChange={(required) => setEntry(index, { required })}
                />
                Required
              </label>

              {name && (
                <code className="truncate text-xs text-muted-foreground">
                  {`{{${variableName}.${name}}}`}
                </code>
              )}

              <div className="flex shrink-0 items-center gap-1">
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="size-7"
                  disabled={index === 0}
                  onClick={() => move(index, -1)}
                  aria-label="Move up"
                >
                  <ArrowUp className="size-4" />
                </Button>
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="size-7"
                  disabled={index === entries.length - 1}
                  onClick={() => move(index, 1)}
                  aria-label="Move down"
                >
                  <ArrowDown className="size-4" />
                </Button>
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="size-7"
                  onClick={() => update(entries.filter((_, position) => position !== index))}
                  aria-label="Remove field"
                >
                  <X className="size-4" />
                </Button>
              </div>
            </div>
          </div>
        );
      })}

      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={entries.length >= MAX_FORM_FIELDS}
        onClick={() =>
          update([...entries, { label: "", type: "text", required: false, options: "" }])
        }
      >
        <Plus className="size-4" />
        Add field
      </Button>
    </div>
  );
};
