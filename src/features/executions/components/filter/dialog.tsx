"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import z from "zod";
import { useForm } from "react-hook-form";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useEffect } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const formSchema = z.object({
  inputKey: z.string().min(1, "Input key is required"),
  operator: z.string().min(1, "Operator is required"),
  value: z.string().optional(),
});

export type FilterFormValues = z.infer<typeof formSchema>;

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit?: (values: FilterFormValues) => void;
  defaultValues?: Partial<FilterFormValues>;
}

export const FilterDialog = ({
  open,
  onOpenChange,
  onSubmit,
  defaultValues = {},
}: Props) => {
  const form = useForm<FilterFormValues>({
    defaultValues: {
      inputKey: defaultValues.inputKey || "",
      operator: defaultValues.operator || "equals",
      value: defaultValues.value || "",
    },
  });

  useEffect(() => {
    if (open) {
      form.reset({
        inputKey: defaultValues.inputKey || "",
        operator: defaultValues.operator || "equals",
        value: defaultValues.value || "",
      });
    }
  }, [open, defaultValues, form]);

  const selectedOperator = form.watch("operator");

  const handleSubmit = (values: FilterFormValues) => {
    onSubmit?.(values);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Filter Configuration</DialogTitle>
          <DialogDescription>
            Continue the workflow only when this condition is true.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(handleSubmit)}
            className="space-y-8 mt-4 pb-2"
          >
            <FormField
              control={form.control}
              name="inputKey"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Input Key</FormLabel>
                  <FormControl>
                    <Input placeholder="amount" {...field} />
                  </FormControl>
                  <FormDescription>
                    The context value to check, for example: amount, email, name.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="operator"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Operator</FormLabel>
                  <Select
                    onValueChange={field.onChange}
                    defaultValue={field.value}
                  >
                    <FormControl>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Select operator" />
                      </SelectTrigger>
                    </FormControl>

                    <SelectContent>
                      <SelectItem value="equals">Equals</SelectItem>
                      <SelectItem value="not_equals">Not equals</SelectItem>
                      <SelectItem value="contains">Contains</SelectItem>
                      <SelectItem value="greater_than">Greater than</SelectItem>
                      <SelectItem value="less_than">Less than</SelectItem>
                      <SelectItem value="exists">Exists</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormDescription>
                    Choose how the input value should be checked.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            {selectedOperator !== "exists" && (
              <FormField
                control={form.control}
                name="value"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Value</FormLabel>
                    <FormControl>
                      <Input placeholder="1000" {...field} />
                    </FormControl>
                    <FormDescription>
                      The value to compare against the input key.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            <DialogFooter className="mt-4">
              <Button type="submit">Save</Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
};