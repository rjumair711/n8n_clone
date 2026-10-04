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
  variableName: z
    .string()
    .min(1, "Variable name is required")
    .regex(/^[A-Za-z_$][A-Za-z0-9_$]*$/, {
      message:
        "Variable name must start with a letter or underscore and contain only letters, numbers, and underscores",
    }),
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
    defaultValues: {
      mode: defaultValues.mode || "any",
      variableName: defaultValues.variableName || "merge",
    },
  });

  useEffect(() => {
    if (open) {
      form.reset({
        mode: defaultValues.mode || "any",
        variableName: defaultValues.variableName || "merge",
      });
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
