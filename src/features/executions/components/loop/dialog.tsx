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

// Keep in sync with LOOP_*_MAX_ITERATIONS in src/inngest/engine.ts
const DEFAULT_MAX_ITERATIONS = 100;
const HARD_MAX_ITERATIONS = 200;

const formSchema = z.object({
  itemsPath: z.string().min(1, "The path to a list is required"),
  variableName: z
    .string()
    .min(1, "Variable name is required")
    .regex(/^[A-Za-z_$][A-Za-z0-9_$]*$/, {
      message:
        "Variable name must start with a letter or underscore and contain only letters, numbers, and underscores",
    }),
  maxIterations: z
    .number()
    .int()
    .min(1, "Must be at least 1")
    .max(HARD_MAX_ITERATIONS, `Cannot exceed ${HARD_MAX_ITERATIONS}`),
});

export type LoopFormValues = z.infer<typeof formSchema>;

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit?: (values: LoopFormValues) => void;
  defaultValues?: Partial<LoopFormValues>;
}

export const LoopDialog = ({
  open,
  onOpenChange,
  onSubmit,
  defaultValues = {},
}: Props) => {
  const form = useForm<LoopFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      itemsPath: defaultValues.itemsPath || "",
      variableName: defaultValues.variableName || "loop",
      maxIterations: defaultValues.maxIterations || DEFAULT_MAX_ITERATIONS,
    },
  });

  useEffect(() => {
    if (open) {
      form.reset({
        itemsPath: defaultValues.itemsPath || "",
        variableName: defaultValues.variableName || "loop",
        maxIterations: defaultValues.maxIterations || DEFAULT_MAX_ITERATIONS,
      });
    }
  }, [open, defaultValues, form]);

  const watchVariableName = form.watch("variableName") || "loop";

  const handleSubmit = (values: LoopFormValues) => {
    onSubmit?.(values);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Loop Configuration</DialogTitle>
          <DialogDescription>
            Nodes connected to the "Each item" output run once per item.
            Nodes connected to "Done" run once, after the last item.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(handleSubmit)}
            className="space-y-8 mt-4 pb-2"
          >
            <FormField
              control={form.control}
              name="itemsPath"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>List</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="myApiCall.httpResponse.data.items"
                      {...field}
                    />
                  </FormControl>
                  <FormDescription>
                    Path to a list in the workflow data.
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
                    <Input placeholder="loop" {...field} />
                  </FormControl>
                  <FormDescription>
                    Inside the loop use {`{{${watchVariableName}.item}}`},
                    {" "}{`{{${watchVariableName}.index}}`} and
                    {" "}{`{{${watchVariableName}.total}}`}.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="maxIterations"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Maximum Items</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      min={1}
                      max={HARD_MAX_ITERATIONS}
                      {...field}
                      onChange={(event) =>
                        field.onChange(event.target.valueAsNumber)
                      }
                    />
                  </FormControl>
                  <FormDescription>
                    The run fails if the list is longer than this (up to
                    {" "}{HARD_MAX_ITERATIONS}).
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
