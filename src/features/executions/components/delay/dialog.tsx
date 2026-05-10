"use client";

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Form, FormField, FormControl, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useForm } from "react-hook-form";
import { z } from "zod";

// Define the form schema with correct validation
const formSchema = z.object({
  delayAmount: z.number().min(1, "Amount is required"),
  delayUnit: z.enum(["seconds", "minutes", "hours"]),
});

export type DelayFormValues = z.infer<typeof formSchema>;

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (values: DelayFormValues) => void;
  defaultValues?: Partial<DelayFormValues>;
}

export const DelayDialog = ({ open, onOpenChange, onSubmit, defaultValues = {} }: Props) => {
  const form = useForm<DelayFormValues>({
    defaultValues: {
      delayAmount: defaultValues.delayAmount || 0, // ensure default is a number
      delayUnit: defaultValues.delayUnit || "seconds", // default to "seconds"
    },
  });

  const handleSubmit = (values: DelayFormValues) => {
    onSubmit(values);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Set Delay</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
            {/* For the Number Input */}
            <FormField
              control={form.control}
              name="delayAmount"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Delay Amount</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      placeholder="e.g., 10"
                      {...field}
                      // Ensure the value is passed as a number or empty string
                      onChange={(e) => field.onChange(e.target.valueAsNumber || 0)}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* For the Select - ensure the value is explicitly stringified if needed */}
            <FormField
              control={form.control}
              name="delayUnit"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Delay Unit</FormLabel>
                  <FormControl>
                    <select
                      {...field}
                      className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    >
                      <option value="seconds">Seconds</option>
                      <option value="minutes">Minutes</option>
                      <option value="hours">Hours</option>
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