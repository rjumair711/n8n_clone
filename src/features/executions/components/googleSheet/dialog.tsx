"use client";

import {
  Dialog, DialogContent, DialogHeader,
  DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Form, FormField, FormControl,
  FormItem, FormLabel, FormMessage, FormDescription,
} from "@/components/ui/form";
import {
  Select, SelectContent, SelectItem,
  SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useEffect } from "react";
import { CredentialType } from "@prisma/client";
import { useCredentialsByType } from "@/features/credentials/hooks/use-credentials";
import { normalizeSheetsOperation, SHEETS_OPERATION_LABELS, SHEETS_OPERATIONS } from "./rows";

const formSchema = z
  .object({
    operation: z.enum(SHEETS_OPERATIONS),
    credentialId: z.string().min(1, "Credential is required"),
    sheetId: z.string().min(1, "Sheet ID is required"),
    sheetName: z.string().min(1, "Sheet name is required"),
    rowData: z.string().optional(),
    matchColumn: z.string().optional(),
    matchValue: z.string().optional(),
    columnValues: z.string().optional(),
    variableName: z
      .string()
      .min(1, "Variable name is required")
      .regex(/^[A-Za-z_$][A-Za-z0-9_$]*$/, {
        message: "Must start with a letter or underscore, letters/numbers/underscores only",
      }),
  })
  .superRefine((values, ctx) => {
    const required = (path: "rowData" | "matchColumn" | "columnValues", message: string) => {
      if (!values[path]?.trim()) ctx.addIssue({ code: z.ZodIssueCode.custom, path: [path], message });
    };
    if (values.operation === "append") required("rowData", "At least one value is required");
    if (["lookup", "update", "upsert"].includes(values.operation)) {
      required("matchColumn", "Column to match on is required");
    }
    if (values.operation === "update" || values.operation === "upsert") {
      required("columnValues", "Write at least one \"Column: value\" line");
    }
  });

export type GoogleSheetsFormValues = z.infer<typeof formSchema>;

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (values: GoogleSheetsFormValues) => void;
  defaultValues?: Partial<Omit<GoogleSheetsFormValues, "operation">> & { operation?: string };
}

const OUTPUT_HINT: Record<GoogleSheetsFormValues["operation"], (name: string) => string> = {
  append: (name) => `{{${name}.updatedRange}}`,
  get_rows: (name) => `{{${name}.rows}} and {{${name}.count}}; add a Split Out on ${name}.rows to handle each row`,
  lookup: (name) => `{{${name}.found}} and {{${name}.row.Email}}`,
  update: (name) => `{{${name}.updated}} and {{${name}.rowNumber}}`,
  upsert: (name) => `{{${name}.action}} ("updated" or "appended") and {{${name}.row}}`,
};

export const GoogleSheetsDialog = ({ open, onOpenChange, onSubmit, defaultValues = {} }: Props) => {
  // Either a service account or a Google account connected with OAuth
  const serviceAccounts = useCredentialsByType(CredentialType.GOOGLE_SHEETS);
  const googleAccounts = useCredentialsByType(CredentialType.GOOGLE_OAUTH2);
  const credentials = [
    ...(googleAccounts.data ?? []),
    ...(serviceAccounts.data ?? []),
  ];
  const isLoading = serviceAccounts.isLoading || googleAccounts.isLoading;

  const initialValues = (): GoogleSheetsFormValues => ({
    operation: normalizeSheetsOperation(defaultValues.operation),
    credentialId: defaultValues.credentialId || "",
    sheetId: defaultValues.sheetId || "",
    sheetName: defaultValues.sheetName || "Sheet1",
    rowData: defaultValues.rowData || "",
    matchColumn: defaultValues.matchColumn || "",
    matchValue: defaultValues.matchValue || "",
    columnValues: defaultValues.columnValues || "",
    variableName: defaultValues.variableName || "",
  });

  const form = useForm<GoogleSheetsFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: initialValues(),
  });

  useEffect(() => {
    if (open) form.reset(initialValues());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, defaultValues, form]);

  const operation = form.watch("operation");
  const watchVariableName = form.watch("variableName") || "sheetsResult";
  const usesMatch = operation !== "append";
  const matchRequired = operation !== "append" && operation !== "get_rows";
  const setsValues = operation === "update" || operation === "upsert";

  const handleSubmit = (values: GoogleSheetsFormValues) => {
    onSubmit(values);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Configure Google Sheets</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4 mt-2">

            <FormField
              control={form.control}
              name="operation"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Operation</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {SHEETS_OPERATIONS.map((value) => (
                        <SelectItem key={value} value={value}>
                          {SHEETS_OPERATION_LABELS[value]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {usesMatch && (
                    <FormDescription>
                      Row 1 of the sheet must hold the column names.
                    </FormDescription>
                  )}
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="credentialId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Google Sheets Credential</FormLabel>
                  <Select
                    onValueChange={field.onChange}
                    defaultValue={field.value}
                    disabled={isLoading || !credentials?.length}
                  >
                    <FormControl>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder={
                          isLoading ? "Loading..." :
                          !credentials?.length ? "No credentials found — create one first" :
                          "Select a credential"
                        } />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {credentials?.map((cred) => (
                        <SelectItem key={cred.id} value={cred.id}>
                          {cred.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="sheetId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Spreadsheet ID</FormLabel>
                  <FormControl>
                    <Input placeholder="1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgVE2upms" {...field} />
                  </FormControl>
                  <FormDescription>
                    Found in the sheet URL: docs.google.com/spreadsheets/d/<strong>SPREADSHEET_ID</strong>/edit
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="sheetName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Sheet Name</FormLabel>
                  <FormControl>
                    <Input placeholder="Sheet1" {...field} />
                  </FormControl>
                  <FormDescription>
                    The tab name at the bottom of your spreadsheet.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            {operation === "append" && (
              <FormField
                control={form.control}
                name="rowData"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Row Values (comma separated)</FormLabel>
                    <FormControl>
                      <Input placeholder="{{name}}, {{email}}, {{message}}" {...field} />
                    </FormControl>
                    <FormDescription>
                      Comma-separated values to append as a new row. Use{" "}
                      {"{{variables}}"} from previous nodes. To fill columns by
                      name, use Append or Update Row.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            {usesMatch && (
              <>
                <FormField
                  control={form.control}
                  name="matchColumn"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>
                        {operation === "get_rows" ? "Filter Column (optional)" : "Column to Match On"}
                      </FormLabel>
                      <FormControl>
                        <Input placeholder="Order ID" {...field} />
                      </FormControl>
                      <FormDescription>
                        {operation === "get_rows"
                          ? "Leave empty to get every row."
                          : "The column name in row 1 that identifies a row, like Order ID or Phone."}
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="matchValue"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{matchRequired ? "Value to Match" : "Filter Value"}</FormLabel>
                      <FormControl>
                        <Input placeholder="{{whatsapp.from}}" {...field} />
                      </FormControl>
                      <FormDescription>
                        Rows whose cell equals this (spaces at the ends are ignored).
                        {operation === "update" && " Only the first matching row is updated."}
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </>
            )}

            {setsValues && (
              <FormField
                control={form.control}
                name="columnValues"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Values to Set</FormLabel>
                    <FormControl>
                      <Textarea
                        rows={4}
                        className="font-mono text-sm"
                        placeholder={"Status: Paid\nPaid At: {{$now}}"}
                        {...field}
                      />
                    </FormControl>
                    <FormDescription>
                      One <code>Column: value</code> per line. Other columns are left as they are.
                      {operation === "upsert" && " With no match, a new row is added with these values and the match value."}
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            <FormField
              control={form.control}
              name="variableName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Variable Name</FormLabel>
                  <FormControl>
                    <Input placeholder="sheetsResult" {...field} />
                  </FormControl>
                  <FormDescription>
                    Reference this result in later nodes: {OUTPUT_HINT[operation](watchVariableName)}
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter>
              <Button type="submit">Save</Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
};
