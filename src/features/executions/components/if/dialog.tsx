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
import { useFieldArray, useForm } from "react-hook-form";
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
import { Plus, Trash2 } from "lucide-react";
import {
  CONDITION_OPERATORS,
  UNARY_OPERATORS,
} from "../../lib/conditions";

const conditionSchema = z.object({
  inputKey: z.string().min(1, "Input key is required"),
  operator: z.string().min(1, "Operator is required"),
  value: z.string().optional(),
});

const formSchema = z.object({
  conditions: z.array(conditionSchema).min(1, "Add at least one condition"),
  combinator: z.enum(["and", "or"]),
});

export type IfFormValues = z.infer<typeof formSchema>;

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit?: (values: IfFormValues) => void;
  defaultValues?: Partial<IfFormValues>;
}

const emptyCondition = { inputKey: "", operator: "equals", value: "" };

export const IfDialog = ({
  open,
  onOpenChange,
  onSubmit,
  defaultValues = {},
}: Props) => {
  const form = useForm<IfFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      conditions: defaultValues.conditions?.length
        ? defaultValues.conditions
        : [emptyCondition],
      combinator: defaultValues.combinator || "and",
    },
  });

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "conditions",
  });

  useEffect(() => {
    if (open) {
      form.reset({
        conditions: defaultValues.conditions?.length
          ? defaultValues.conditions
          : [emptyCondition],
        combinator: defaultValues.combinator || "and",
      });
    }
  }, [open, defaultValues, form]);

  const handleSubmit = (values: IfFormValues) => {
    onSubmit?.(values);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>IF Configuration</DialogTitle>
          <DialogDescription>
            Nodes connected to the True output run when the conditions pass,
            nodes connected to the False output run when they do not.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(handleSubmit)}
            className="space-y-6 mt-4 pb-2"
          >
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <FormLabel className="text-base font-semibold">
                  Conditions
                </FormLabel>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => append(emptyCondition)}
                  className="flex items-center gap-1"
                >
                  <Plus className="w-4 h-4" /> Add Condition
                </Button>
              </div>

              {fields.map((field, index) => {
                const currentOperator = form.watch(
                  `conditions.${index}.operator`
                );

                return (
                  <div
                    key={field.id}
                    className="p-4 border rounded-lg bg-muted/30 flex items-start gap-3"
                  >
                    <div className="grid flex-1 grid-cols-1 md:grid-cols-3 gap-3">
                      <FormField
                        control={form.control}
                        name={`conditions.${index}.inputKey`}
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Input Key</FormLabel>
                            <FormControl>
                              <Input placeholder="order.amount" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name={`conditions.${index}.operator`}
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Operator</FormLabel>
                            <Select
                              onValueChange={field.onChange}
                              value={field.value}
                            >
                              <FormControl>
                                <SelectTrigger className="w-full">
                                  <SelectValue placeholder="Select" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                {CONDITION_OPERATORS.map((operator) => (
                                  <SelectItem
                                    key={operator.value}
                                    value={operator.value}
                                  >
                                    {operator.label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      {!UNARY_OPERATORS.includes(currentOperator) && (
                        <FormField
                          control={form.control}
                          name={`conditions.${index}.value`}
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Value</FormLabel>
                              <FormControl>
                                <Input placeholder="1000" {...field} />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      )}
                    </div>

                    {fields.length > 1 && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="text-destructive hover:text-destructive/90 mt-6"
                        onClick={() => remove(index)}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    )}
                  </div>
                );
              })}

              <p className="text-sm text-muted-foreground">
                Input Key is a path into the workflow data, for example
                {" "}<code>webhook.body.status</code>. Value can use
                {" "}<code>{"{{variables}}"}</code>.
              </p>
            </div>

            {fields.length > 1 && (
              <FormField
                control={form.control}
                name="combinator"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Combine conditions with</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="and">AND (all must pass)</SelectItem>
                        <SelectItem value="or">OR (any may pass)</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormDescription>
                      Decides how several conditions produce one true/false
                      result.
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
