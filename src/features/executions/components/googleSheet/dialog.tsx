"use client";

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Form, FormField, FormControl, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useForm } from "react-hook-form";
import { z } from "zod";

// Define the form schema for Google Sheets configuration
const formSchema = z.object({
  sheetId: z.string().min(1, "Sheet ID is required"),
  rowData: z.array(z.string()).min(1, "At least one row value is required"),
});

export type GoogleSheetsFormValues = z.infer<typeof formSchema>;

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (values: GoogleSheetsFormValues) => void;
  defaultValues?: Partial<GoogleSheetsFormValues>;
}

export const GoogleSheetsDialog = ({ open, onOpenChange, onSubmit, defaultValues = {} }: Props) => {
  const form = useForm<GoogleSheetsFormValues>({
    defaultValues: {
      sheetId: defaultValues.sheetId || "",
      rowData: defaultValues.rowData || [],
    },
  });

  const handleSubmit = (values: GoogleSheetsFormValues) => {
    onSubmit(values);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Configure Google Sheets</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="sheetId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Google Sheet ID</FormLabel>
                  <FormControl>
                    <Input type="text" placeholder="Enter Google Sheet ID" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="rowData"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Row Data (comma separated)</FormLabel>
                  <FormControl>
                    <Input type="text" placeholder="Enter row data" {...field} />
                  </FormControl>
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