"use client";

import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

// 🚀 Fixed: Removed z.coerce and .default() to maintain a strict 1:1 input/output shape mapping
const formSchema = z.object({
  sessionId: z.string().min(1, "Session ID is required"),
  windowSize: z.number().min(1, "Must be at least 1").max(50, "Maximum limit is 50"),
});

export type BufferMemoryFormValues = z.infer<typeof formSchema>;

interface BufferMemoryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (values: BufferMemoryFormValues) => void;
  defaultValues?: Partial<BufferMemoryFormValues>;
}

export const BufferMemoryDialog = ({ open, onOpenChange, onSubmit, defaultValues }: BufferMemoryDialogProps) => {
  // 🚀 Fixed: Bound the strictly inferred schema directly to useForm with the reactive 'values' key
  const form = useForm<BufferMemoryFormValues>({
    resolver: zodResolver(formSchema),
    values: {
      sessionId: defaultValues?.sessionId || "{{webhook.sessionId}}",
      windowSize: defaultValues?.windowSize !== undefined ? Number(defaultValues.windowSize) : 10,
    },
  });

  const handleSubmit = (values: BufferMemoryFormValues) => {
    onSubmit(values);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Buffer Memory Configuration</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
            
            <FormField
              control={form.control}
              name="sessionId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Session ID</FormLabel>
                  <FormControl>
                    <Input {...field} placeholder="{{webhook.sessionId}}" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="windowSize"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Window Size (Past Messages)</FormLabel>
                  <FormControl>
                    {/* 🚀 Fixed: Extracted input string values on change and explicitly casted them to a strict Number */}
                    <Input 
                      type="number" 
                      min={1}
                      max={50}
                      value={field.value} 
                      onChange={(e) => field.onChange(Number(e.target.value))}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="flex justify-end gap-2 pt-4">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit">Save</Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
};