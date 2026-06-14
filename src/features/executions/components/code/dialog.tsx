"use client";

import {
  Dialog, DialogContent, DialogHeader,
  DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Form, FormField, FormItem, FormLabel, FormControl, FormDescription, FormMessage,
} from "@/components/ui/form";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useEffect } from "react";

const DEFAULT_BOILERPLATE = `// Access historical data via the 'context' object
// Ensure your script explicitly returns a clean object 

const incomingData = context.lastNodeResult || {};

return {
  status: "success",
  processedAt: new Date().toISOString(),
  count: Array.isArray(incomingData) ? incomingData.length : 1
};`;

const formSchema = z.object({
  code: z.string().min(1, "You must write script body to save node configuration"),
  variableName: z
    .string()
    .min(1, "Variable output pointer is required")
    .regex(/^[A-Za-z_$][A-Za-z0-9_$]*$/, {
      message: "Variables must conform to camelCase/JS alphanumeric standards",
    }),
});

export type CodeNodeFormValues = z.infer<typeof formSchema>;

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (values: CodeNodeFormValues) => void;
  defaultValues?: Partial<CodeNodeFormValues>;
}

export const CodeNodeDialog = ({ open, onOpenChange, onSubmit, defaultValues = {} }: Props) => {
  const form = useForm<CodeNodeFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      code: defaultValues.code || DEFAULT_BOILERPLATE,
      variableName: defaultValues.variableName || "codeResult",
    },
  });

  useEffect(() => {
    if (open) {
      form.reset({
        code: defaultValues.code || DEFAULT_BOILERPLATE,
        variableName: defaultValues.variableName || "codeResult",
      });
    }
  }, [open, defaultValues, form]);

  const watchVariableName = form.watch("variableName") || "codeResult";

  const handleSubmit = (values: CodeNodeFormValues) => {
    onSubmit(values);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Configure JavaScript Environment</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4 mt-2">
            
            <FormField
              control={form.control}
              name="code"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-sm font-semibold">JavaScript Sandbox Execution Script</FormLabel>
                  <FormControl>
                    <Textarea 
                      placeholder={DEFAULT_BOILERPLATE} 
                      className="font-mono text-xs h-72 bg-muted/40 p-4 leading-relaxed tracking-wide focus-visible:ring-1" 
                      {...field} 
                    />
                  </FormControl>
                  <FormDescription>
                    Write raw code logic here. The wrapper injects an accessible global variable named <code>context</code>.
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
                  <FormLabel>Storage Key Variable Name</FormLabel>
                  <FormControl>
                    <Input placeholder="codeResult" {...field} />
                  </FormControl>
                  <FormDescription>
                    Access this node's output in later sequence streams using:{" "}
                    <strong>{`{{${watchVariableName}}}`}</strong> or <strong>{`{{${watchVariableName}.property}}`}</strong>
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter>
              <Button type="submit">Save Logic Block</Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
};