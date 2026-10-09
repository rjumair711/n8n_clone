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
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { useEffect } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  TOOL_RISK_LABELS,
  getDefaultToolDescription,
  getDefaultToolName,
  getToolLabel,
  getToolRisk,
  type ToolRisk,
} from "@/features/executions/lib/agent-tools";

const RISK_STYLES: Record<ToolRisk, string> = {
  read: "bg-emerald-100 text-emerald-800",
  write: "bg-amber-100 text-amber-800",
  dangerous: "bg-red-100 text-red-800",
};

const formSchema = z
  .object({
    promptType: z.enum(["auto", "define"]),
    text: z.string().optional(),
    systemMessage: z.string().optional(),
    maxIterations: z
      .number()
      .int()
      .min(1, "Must be at least 1")
      .max(50, "Cannot exceed 50"),
    maxToolCalls: z
      .number()
      .int()
      .min(1, "Must be at least 1")
      .max(200, "Cannot exceed 200"),
    allowDangerousTools: z.boolean(),
    returnIntermediateSteps: z.boolean(),
    variableName: z
      .string()
      .min(1, "Variable name is required")
      .regex(/^[A-Za-z_$][A-Za-z0-9_$]*$/, {
        message:
          "Variable name must start with a letter or underscore and contain only letters, numbers, and underscores",
      }),
    toolSettings: z.record(
      z.string(),
      z.object({
        name: z.string().optional(),
        description: z.string().optional(),
      })
    ),
  })
  .refine((values) => values.promptType !== "define" || !!values.text?.trim(), {
    path: ["text"],
    message: "The prompt is required when it is defined here",
  });

export type AIAgentFormValues = z.infer<typeof formSchema>;

// A node plugged into the agent's Tools port
export type ConnectedTool = {
  id: string;
  type: string;
  data: Record<string, unknown>;
};

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit?: (values: AIAgentFormValues) => void;
  defaultValues?: Partial<AIAgentFormValues> & { systemPrompt?: string };
  tools: ConnectedTool[];
}

const getValues = (
  defaultValues: Props["defaultValues"] = {}
): AIAgentFormValues => ({
  promptType: defaultValues.promptType || "auto",
  text: defaultValues.text || "",
  systemMessage:
    defaultValues.systemMessage ??
    defaultValues.systemPrompt ??
    "You are a helpful assistant",
  maxIterations: defaultValues.maxIterations || 10,
  maxToolCalls: defaultValues.maxToolCalls || 25,
  // Off unless it was switched on, also for agents saved before it existed
  allowDangerousTools: defaultValues.allowDangerousTools === true,
  returnIntermediateSteps: defaultValues.returnIntermediateSteps ?? false,
  variableName: defaultValues.variableName || "aiAgentOutput",
  toolSettings: defaultValues.toolSettings || {},
});

export const AIAgentDialog = ({
  open,
  onOpenChange,
  onSubmit,
  defaultValues,
  tools,
}: Props) => {
  const form = useForm<AIAgentFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: getValues(defaultValues),
  });

  useEffect(() => {
    if (open) {
      form.reset(getValues(defaultValues));
    }
  }, [open, defaultValues, form]);

  const promptType = form.watch("promptType");
  const watchVariableName = form.watch("variableName") || "aiAgentOutput";
  const allowDangerousTools = form.watch("allowDangerousTools");

  const dangerousTools = tools.filter(
    (tool) => getToolRisk(tool.type, tool.data) === "dangerous"
  );

  const handleSubmit = (values: AIAgentFormValues) => {
    // Forget settings of tools that are no longer connected
    const toolSettings = Object.fromEntries(
      tools.map((tool) => [tool.id, values.toolSettings[tool.id] || {}])
    );

    onSubmit?.({ ...values, toolSettings });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>AI Agent</DialogTitle>
          <DialogDescription>
            Tools Agent: the chat model decides which connected tools to call
            and keeps going until it has an answer.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(handleSubmit)}
            className="space-y-6 mt-4 pb-2"
          >
            <FormField
              control={form.control}
              name="promptType"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Source for Prompt (User Message)</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="auto">
                        Connected Chat Trigger node
                      </SelectItem>
                      <SelectItem value="define">Define below</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormDescription>
                    {promptType === "auto"
                      ? "Reads the message from {{chatInput}}, which the Chat Trigger provides."
                      : "Write the prompt yourself, using data from earlier nodes."}
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            {promptType === "define" && (
              <FormField
                control={form.control}
                name="text"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Prompt (User Message)</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="Answer this customer: {{webhook.body.message}}"
                        className="min-h-[100px] font-mono text-sm"
                        {...field}
                      />
                    </FormControl>
                    <FormDescription>
                      Use {"{{variables}}"} for simple values or
                      {" "}{"{{json variable}}"} to stringify objects.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            <FormField
              control={form.control}
              name="systemMessage"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>System Message</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="You are a helpful assistant"
                      className="min-h-[100px] font-mono text-sm"
                      {...field}
                    />
                  </FormControl>
                  <FormDescription>
                    Tells the agent who it is and how to behave. Supports
                    {" "}{"{{variables}}"}.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="space-y-3">
              <FormLabel className="text-base font-semibold">
                Tools ({tools.length})
              </FormLabel>

              {tools.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No tools connected. Connect any node to the Tools port to
                  let the agent use it.
                </p>
              ) : (
                <>
                  <p className="text-sm text-muted-foreground">
                    The model picks a tool from its name and description. In a
                    tool node, write
                    {" "}<code>{'{{$fromAI "city" "The city to look up"}}'}</code>
                    {" "}in any field the agent should fill in.
                  </p>

                  {tools.map((tool) => (
                    <div
                      key={tool.id}
                      className="p-4 border rounded-lg bg-muted/30 space-y-3"
                    >
                      <p className="text-sm font-medium flex items-center gap-2">
                        {getToolLabel(tool.type)}
                        <span
                          className={`rounded-full px-2 py-0.5 text-xs font-medium ${RISK_STYLES[getToolRisk(tool.type, tool.data)]}`}
                        >
                          {TOOL_RISK_LABELS[getToolRisk(tool.type, tool.data)]}
                        </span>
                      </p>

                      <FormField
                        control={form.control}
                        name={`toolSettings.${tool.id}.name`}
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Tool Name</FormLabel>
                            <FormControl>
                              <Input
                                placeholder={getDefaultToolName(tool.type)}
                                {...field}
                                value={field.value ?? ""}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name={`toolSettings.${tool.id}.description`}
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Description</FormLabel>
                            <FormControl>
                              <Textarea
                                placeholder={getDefaultToolDescription(
                                  tool.type,
                                  tool.data
                                )}
                                className="min-h-[60px] text-sm"
                                {...field}
                                value={field.value ?? ""}
                              />
                            </FormControl>
                            <FormDescription>
                              Explain when the agent should use this tool.
                            </FormDescription>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                  ))}
                </>
              )}
            </div>

            <FormField
              control={form.control}
              name="maxIterations"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Max Iterations</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      min={1}
                      max={50}
                      {...field}
                      onChange={(event) =>
                        field.onChange(event.target.valueAsNumber)
                      }
                    />
                  </FormControl>
                  <FormDescription>
                    How many times the model may run before the agent stops.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="maxToolCalls"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Max Tool Calls</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      min={1}
                      max={200}
                      {...field}
                      onChange={(event) =>
                        field.onChange(event.target.valueAsNumber)
                      }
                    />
                  </FormControl>
                  <FormDescription>
                    How many tool calls one run may make in total. The run
                    fails when the model asks for more.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="allowDangerousTools"
              render={({ field }) => (
                <FormItem className="rounded-lg border p-3 bg-muted/20 space-y-2">
                  <div className="flex flex-row items-center justify-between">
                    <div className="space-y-0.5">
                      <FormLabel>Allow dangerous tools</FormLabel>
                      <FormDescription>
                        Lets the agent use tools that run commands (SSH) or
                        raw SQL, delete data, or start another workflow. The
                        model decides when to call them, and text it reads
                        can try to trick it.
                      </FormDescription>
                    </div>
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                      />
                    </FormControl>
                  </div>
                  {dangerousTools.length > 0 && !allowDangerousTools && (
                    <p className="text-sm text-red-700">
                      {dangerousTools
                        .map((tool) => getToolLabel(tool.type))
                        .join(", ")}{" "}
                      {dangerousTools.length === 1 ? "is" : "are"} connected:
                      the run will fail until this is switched on or the
                      tool is disconnected.
                    </p>
                  )}
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="returnIntermediateSteps"
              render={({ field }) => (
                <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3 bg-muted/20">
                  <div className="space-y-0.5">
                    <FormLabel>Return Intermediate Steps</FormLabel>
                    <FormDescription>
                      Include every tool call and its result in the output.
                    </FormDescription>
                  </div>
                  <FormControl>
                    <Switch
                      checked={field.value}
                      onCheckedChange={field.onChange}
                    />
                  </FormControl>
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
                    <Input placeholder="aiAgentOutput" {...field} />
                  </FormControl>
                  <FormDescription>
                    Later nodes read the answer as
                    {" "}{`{{${watchVariableName}.output}}`}.
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
