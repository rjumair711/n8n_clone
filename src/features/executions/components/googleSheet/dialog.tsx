"use client";

import {
  Dialog, DialogContent, DialogHeader,
  DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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

const formSchema = z.object({
  credentialId: z.string().min(1, "Credential is required"),
  sheetId: z.string().min(1, "Sheet ID is required"),
  sheetName: z.string().min(1, "Sheet name is required"),
  rowData: z.string().min(1, "At least one value is required"),
  variableName: z
    .string()
    .min(1, "Variable name is required")
    .regex(/^[A-Za-z_$][A-Za-z0-9_$]*$/, {
      message: "Must start with a letter or underscore, letters/numbers/underscores only",
    }),
});

export type GoogleSheetsFormValues = z.infer<typeof formSchema>;

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (values: GoogleSheetsFormValues) => void;
  defaultValues?: Partial<GoogleSheetsFormValues>;
}

export const GoogleSheetsDialog = ({ open, onOpenChange, onSubmit, defaultValues = {} }: Props) => {
  const { data: credentials, isLoading } = useCredentialsByType(CredentialType.GOOGLE_SHEETS);

  const form = useForm<GoogleSheetsFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      credentialId: defaultValues.credentialId || "",
      sheetId: defaultValues.sheetId || "",
      sheetName: defaultValues.sheetName || "Sheet1",
      rowData: defaultValues.rowData || "",
      variableName: defaultValues.variableName || "",
    },
  });

  useEffect(() => {
    if (open) {
      form.reset({
        credentialId: defaultValues.credentialId || "",
        sheetId: defaultValues.sheetId || "",
        sheetName: defaultValues.sheetName || "Sheet1",
        rowData: defaultValues.rowData || "",
        variableName: defaultValues.variableName || "",
      });
    }
  }, [open, defaultValues, form]);

  const watchVariableName = form.watch("variableName") || "sheetsResult";

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
                    {"{{variables}}"} from previous nodes.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

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
                    Reference this result in later nodes:{" "}
                    {`{{${watchVariableName}.updatedRange}}`}
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