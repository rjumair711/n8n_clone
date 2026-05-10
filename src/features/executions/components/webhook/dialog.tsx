"use client";

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Form, FormField, FormControl, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useForm } from "react-hook-form";
import { z } from "zod";

// FIX: Added webhookUrl to the schema
const formSchema = z.object({
  responseMessage: z.string().min(1, "Response message is required"),
  responseStatus: z.enum(["success", "error"]),
  webhookUrl: z.string().url("Please enter a valid URL").min(1, "Webhook URL is required"),
});

export type WebhookResponseFormValues = z.infer<typeof formSchema>;

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (values: WebhookResponseFormValues) => void;
  defaultValues?: Partial<WebhookResponseFormValues>;
}

export const WebhookResponseDialog = ({ open, onOpenChange, onSubmit, defaultValues = {} }: Props) => {
  const form = useForm<WebhookResponseFormValues>({
    defaultValues: {
      responseMessage: defaultValues.responseMessage || "",
      responseStatus: defaultValues.responseStatus || "success",
      webhookUrl: defaultValues.webhookUrl || "", // FIX: Initialize URL
    },
  });

  const handleSubmit = (values: WebhookResponseFormValues) => {
    onSubmit(values);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Set Webhook Response</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
            {/* NEW FIELD: Webhook URL */}
            <FormField
              control={form.control}
              name="webhookUrl"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Target Webhook URL</FormLabel>
                  <FormControl>
                    <Input type="url" placeholder="https://webhook.site/..." {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="responseMessage"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Response Message</FormLabel>
                  <FormControl>
                    <Input type="text" placeholder="Enter the response message" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="responseStatus"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Response Status</FormLabel>
                  <FormControl>
                    <select 
                      {...field} 
                      className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background"
                    >
                      <option value="success">Success</option>
                      <option value="error">Error</option>
                    </select>
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