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
import { Switch as ToggleSwitch } from "@/components/ui/switch";
import { Plus, Trash2 } from "lucide-react";

const ruleSchema = z.object({
  id: z.string(),
  label: z.string().min(1, "Branch label is required"),
  inputKey: z.string().min(1, "Input key is required"),
  operator: z.string().min(1, "Operator is required"),
  value: z.string().optional(),
});

const formSchema = z.object({
  rules: z.array(ruleSchema),
  fallbackBranch: z.boolean().default(true),
});

export type SwitchFormValues = z.infer<typeof formSchema>;

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit?: (values: SwitchFormValues) => void;
  defaultValues?: Partial<SwitchFormValues>;
}

export const SwitchDialog = ({
  open,
  onOpenChange,
  onSubmit,
  defaultValues = {},
}: Props) => {
  const form = useForm<SwitchFormValues>({
    defaultValues: {
      rules: defaultValues.rules || [
        {
          id: "case_1",
          label: "Case 1",
          inputKey: "",
          operator: "equals",
          value: "",
        },
      ],
      fallbackBranch: defaultValues.fallbackBranch ?? true,
    },
  });

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "rules",
  });

  useEffect(() => {
    if (open) {
      form.reset({
        rules: defaultValues.rules?.length
          ? defaultValues.rules
          : [
              {
                id: "case_1",
                label: "Case 1",
                inputKey: "",
                operator: "equals",
                value: "",
              },
            ],
        fallbackBranch: defaultValues.fallbackBranch ?? true,
      });
    }
  }, [open, defaultValues, form]);

  const handleSubmit = (values: SwitchFormValues) => {
    onSubmit?.(values);
    onOpenChange(false);
  };

  const handleAddRule = () => {
    const nextIndex = fields.length + 1;
    append({
      id: `case_${Date.now()}`,
      label: `Case ${nextIndex}`,
      inputKey: "",
      operator: "equals",
      value: "",
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Switch Configuration</DialogTitle>
          <DialogDescription>
            Route context execution to specific downstream nodes based on dynamic multi-branch rules.
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
                  Branch Rules
                </FormLabel>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleAddRule}
                  className="flex items-center gap-1"
                >
                  <Plus className="w-4 h-4" /> Add Branch
                </Button>
              </div>

              {fields.map((field, index) => {
                const currentOperator = form.watch(
                  `rules.${index}.operator`
                );

                return (
                  <div
                    key={field.id}
                    className="p-4 border rounded-lg bg-muted/30 space-y-4 relative"
                  >
                    <div className="flex items-center justify-between gap-4">
                      <FormField
                        control={form.control}
                        name={`rules.${index}.label`}
                        render={({ field }) => (
                          <FormItem className="flex-1">
                            <FormLabel>Branch Label</FormLabel>
                            <FormControl>
                              <Input placeholder="e.g., Status 200" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      {fields.length > 1 && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="text-destructive hover:text-destructive/90 self-end"
                          onClick={() => remove(index)}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      )}
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      <FormField
                        control={form.control}
                        name={`rules.${index}.inputKey`}
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Input Key</FormLabel>
                            <FormControl>
                              <Input placeholder="status" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name={`rules.${index}.operator`}
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Operator</FormLabel>
                            <Select
                              onValueChange={field.onChange}
                              defaultValue={field.value}
                            >
                              <FormControl>
                                <SelectTrigger>
                                  <SelectValue placeholder="Select" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                <SelectItem value="equals">Equals</SelectItem>
                                <SelectItem value="not_equals">
                                  Not equals
                                </SelectItem>
                                <SelectItem value="contains">
                                  Contains
                                </SelectItem>
                                <SelectItem value="greater_than">
                                  Greater than
                                </SelectItem>
                                <SelectItem value="less_than">
                                  Less than
                                </SelectItem>
                                <SelectItem value="exists">Exists</SelectItem>
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      {currentOperator !== "exists" && (
                        <FormField
                          control={form.control}
                          name={`rules.${index}.value`}
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Value</FormLabel>
                              <FormControl>
                                <Input placeholder="200" {...field} />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            <FormField
              control={form.control}
              name="fallbackBranch"
              render={({ field }) => (
                <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3 bg-muted/20">
                  <div className="space-y-0.5">
                    <FormLabel>Enable Fallback Branch</FormLabel>
                    <FormDescription>
                      Route to "default" handle when no branch conditions match.
                    </FormDescription>
                  </div>
                  <FormControl>
                    <ToggleSwitch
                      checked={field.value}
                      onCheckedChange={field.onChange}
                    />
                  </FormControl>
                </FormItem>
              )}
            />

            <DialogFooter className="mt-4">
              <Button type="submit">Save Configurations</Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
};