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
import { zodResolver } from "@hookform/resolvers/zod";
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
  mode: z.enum(["any", "all"]),
  combine: z.enum(["none", "append", "byKey", "byPosition"]),
  listA: z.string().optional(),
  listB: z.string().optional(),
  keyA: z.string().optional(),
  keyB: z.string().optional(),
  variableName: z
    .string()
    .min(1, "Variable name is required")
    .regex(/^[A-Za-z_$][A-Za-z0-9_$]*$/, {
      message:
        "Variable name must start with a letter or underscore and contain only letters, numbers, and underscores",
    }),
}).superRefine((values, ctx) => {
  if (values.combine === "none") return;

  // Append can join the items of the connected branches without naming them
  const namesOptional =
    values.combine === "append" && !values.listA?.trim() && !values.listB?.trim();

  for (const name of ["listA", "listB"] as const) {
    if (!namesOptional && !values[name]?.trim()) {
      ctx.addIssue({ code: "custom", path: [name], message: "Pick the list to combine" });
    }
  }

  if (values.combine === "byKey" && !values.keyA?.trim()) {
    ctx.addIssue({ code: "custom", path: ["keyA"], message: "Field to match is required" });
  }
});

const getValues = (defaultValues: Partial<MergeFormValues>): MergeFormValues => ({
  mode: defaultValues.mode || "any",
  variableName: defaultValues.variableName || "merge",
  combine: defaultValues.combine || "none",
  listA: defaultValues.listA || "",
  listB: defaultValues.listB || "",
  keyA: defaultValues.keyA || "",
  keyB: defaultValues.keyB || "",
});

export type MergeFormValues = z.infer<typeof formSchema>;

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit?: (values: MergeFormValues) => void;
  defaultValues?: Partial<MergeFormValues>;
}

export const MergeDialog = ({
  open,
  onOpenChange,
  onSubmit,
  defaultValues = {},
}: Props) => {
  const form = useForm<MergeFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: getValues(defaultValues),
  });

  const watchCombine = form.watch("combine");

  useEffect(() => {
    if (open) {
      form.reset(getValues(defaultValues));
    }
  }, [open, defaultValues, form]);

  const handleSubmit = (values: MergeFormValues) => {
    onSubmit?.(values);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Merge Configuration</DialogTitle>
          <DialogDescription>
            Connect several branches into this node to continue on a single
            path. Variables set on any branch that ran stay available.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(handleSubmit)}
            className="space-y-8 mt-4 pb-2"
          >
            <FormField
              control={form.control}
              name="mode"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Mode</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Select mode" />
                      </SelectTrigger>
                    </FormControl>

                    <SelectContent>
                      <SelectItem value="any">
                        Continue when any branch arrives
                      </SelectItem>
                      <SelectItem value="all">
                        Continue only when all branches arrive
                      </SelectItem>
                    </SelectContent>
                  </Select>
                  <FormDescription>
                    Use "any" after an IF or Switch, where only one branch
                    runs. Use "all" to require every connected branch.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="combine"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Combine Lists</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>

                    <SelectContent>
                      <SelectItem value="none">Do not combine lists</SelectItem>
                      <SelectItem value="append">Append: all items of both lists</SelectItem>
                      <SelectItem value="byKey">Combine by matching field</SelectItem>
                      <SelectItem value="byPosition">Combine by position</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormDescription>
                    Optionally join two lists from the branches into one,
                    available as {`{{${form.watch("variableName") || "merge"}.items}}`}.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            {watchCombine !== "none" && (
              <>
                <FormField
                  control={form.control}
                  name="listA"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>List A</FormLabel>
                      <FormControl>
                        <Input placeholder="customers.httpResponse.data" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="listB"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>List B</FormLabel>
                      <FormControl>
                        <Input placeholder="orders.httpResponse.data" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </>
            )}

            {watchCombine === "byKey" && (
              <>
                <FormField
                  control={form.control}
                  name="keyA"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Field To Match in List A</FormLabel>
                      <FormControl>
                        <Input placeholder="id" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="keyB"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Field To Match in List B (Optional)</FormLabel>
                      <FormControl>
                        <Input placeholder="customerId" {...field} />
                      </FormControl>
                      <FormDescription>
                        Leave empty when the field has the same name in both
                        lists. Only items found in both lists are kept.
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </>
            )}

            <FormField
              control={form.control}
              name="variableName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Variable Name</FormLabel>
                  <FormControl>
                    <Input placeholder="merge" {...field} />
                  </FormControl>
                  <FormDescription>
                    Exposes {`{{${field.value || "merge"}.branchesReceived}}`}
                    {" "}to later nodes.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter className="mt-4">
              <Button type="submit">Save</Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
};
