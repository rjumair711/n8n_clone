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
import { useCredentialsByType } from "@/features/credentials/hooks/use-credentials";
import {
  APPROVAL_CHANNELS,
  APPROVAL_DEFAULT_TIMEOUT_AMOUNT,
  APPROVAL_DEFAULT_TIMEOUT_UNIT,
  TOOL_APPROVAL_DEFAULT_BY_RISK,
  toolRequiresApproval,
} from "@/lib/approvals";
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
        requireApproval: z.boolean().optional(),
      })
    ),
    approvalChannel: z.string(),
    approvalCredentialId: z.string().optional(),
    approvalRecipient: z.string().optional(),
    approvalWebhookUrl: z.string().optional(),
    approvalPhoneNumberId: z.string().optional(),
    approvalTimeoutAmount: z
      .string()
      .regex(/^\s*\d+(\.\d+)?\s*$/, "Must be a number"),
    approvalTimeoutUnit: z.string(),
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
  defaultValues?: Partial<AIAgentFormValues> & {
    systemPrompt?: string;
    // "risk" on agents added since approvals exist
    toolApprovalDefault?: string;
  };
  tools: ConnectedTool[];
}

// The credential each approval channel sends with
const APPROVAL_CREDENTIAL_TYPES = {
  email: "SMTP",
  telegram: "TELEGRAM",
  whatsapp: "WHATSAPP",
} as const;

const APPROVAL_UNITS = [
  { value: "minutes", label: "Minutes" },
  { value: "hours", label: "Hours" },
  { value: "days", label: "Days" },
];

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
  approvalChannel: defaultValues.approvalChannel || "in_app",
  approvalCredentialId: defaultValues.approvalCredentialId || "",
  approvalRecipient: defaultValues.approvalRecipient || "",
  approvalWebhookUrl: defaultValues.approvalWebhookUrl || "",
  approvalPhoneNumberId: defaultValues.approvalPhoneNumberId || "",
  approvalTimeoutAmount: String(
    defaultValues.approvalTimeoutAmount || APPROVAL_DEFAULT_TIMEOUT_AMOUNT
  ),
  approvalTimeoutUnit:
    defaultValues.approvalTimeoutUnit || APPROVAL_DEFAULT_TIMEOUT_UNIT,
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

  // Tools without a saved choice: on for the ones that write or are
  // dangerous, on agents added since approvals exist. An older agent keeps
  // running without approvals until they are switched on here.
  const approvalDefaultByRisk =
    defaultValues?.toolApprovalDefault === TOOL_APPROVAL_DEFAULT_BY_RISK;

  const requiresApproval = (tool: ConnectedTool, saved: boolean | undefined) =>
    toolRequiresApproval({
      saved,
      risk: getToolRisk(tool.type, tool.data),
      defaultByRisk: approvalDefaultByRisk,
    });

  const watchToolSettings = form.watch("toolSettings");
  const approvalChannel = form.watch("approvalChannel");
  const anyApproval = tools.some((tool) =>
    requiresApproval(tool, watchToolSettings?.[tool.id]?.requireApproval)
  );

  const approvalCredentialType =
    APPROVAL_CREDENTIAL_TYPES[
      approvalChannel as keyof typeof APPROVAL_CREDENTIAL_TYPES
    ];
  const { data: approvalCredentials } = useCredentialsByType(
    // The hook needs a type even for channels without a credential
    approvalCredentialType ?? "SMTP"
  );

  const handleSubmit = (values: AIAgentFormValues) => {
    // Forget settings of tools that are no longer connected, and save what
    // the Require approval switch showed
    const toolSettings = Object.fromEntries(
      tools.map((tool) => {
        const settings = values.toolSettings[tool.id] || {};

        return [
          tool.id,
          {
            ...settings,
            requireApproval: requiresApproval(tool, settings.requireApproval),
          },
        ];
      })
    );

    const needsApproval = Object.values(toolSettings).some(
      (settings) => settings.requireApproval
    );

    if (needsApproval) {
      const missing = (name: keyof AIAgentFormValues, message: string) => {
        if (String(values[name] ?? "").trim()) return false;
        form.setError(name, { message });
        return true;
      };

      const channel = values.approvalChannel;
      let invalid = false;

      if (channel in APPROVAL_CREDENTIAL_TYPES) {
        invalid = missing("approvalCredentialId", "Select a credential") || invalid;
        invalid = missing("approvalRecipient", "Who should be asked?") || invalid;
      }
      if (channel === "whatsapp") {
        invalid = missing("approvalPhoneNumberId", "Phone Number ID is required") || invalid;
      }
      if (channel === "slack") {
        invalid = missing("approvalWebhookUrl", "Webhook URL is required") || invalid;
      }

      if (invalid) return;
    }

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
                                placeholder={getDefaultToolName(tool.type, tool.data)}
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

                      <FormField
                        control={form.control}
                        name={`toolSettings.${tool.id}.requireApproval`}
                        render={({ field }) => (
                          <FormItem className="flex flex-row items-center justify-between rounded-lg border bg-background p-3">
                            <div className="space-y-0.5">
                              <FormLabel>Require approval</FormLabel>
                              <FormDescription>
                                Every call of this tool waits until a person
                                approves it. A rejected call is not run and
                                the agent is told so.
                              </FormDescription>
                            </div>
                            <FormControl>
                              <Switch
                                checked={requiresApproval(tool, field.value)}
                                onCheckedChange={field.onChange}
                              />
                            </FormControl>
                          </FormItem>
                        )}
                      />
                    </div>
                  ))}
                </>
              )}
            </div>

            {anyApproval && (
              <div className="space-y-4 rounded-lg border p-4">
                <div className="space-y-1">
                  <FormLabel className="text-base font-semibold">
                    Approvals
                  </FormLabel>
                  <p className="text-sm text-muted-foreground">
                    When the agent calls a tool that requires approval, the
                    run pauses and a request with the tool&apos;s name and
                    arguments is sent. It can always be answered on the
                    Approvals page too.
                  </p>
                </div>

                <FormField
                  control={form.control}
                  name="approvalChannel"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Send approval requests through</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger className="w-full">
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {APPROVAL_CHANNELS.map((channel) => (
                            <SelectItem key={channel.value} value={channel.value}>
                              {channel.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {approvalCredentialType && (
                  <FormField
                    control={form.control}
                    name="approvalCredentialId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>
                          {approvalChannel === "email"
                            ? "SMTP Credential"
                            : approvalChannel === "telegram"
                              ? "Telegram Bot Credential"
                              : "WhatsApp Credential"}
                        </FormLabel>
                        <Select
                          onValueChange={field.onChange}
                          value={field.value}
                          disabled={!approvalCredentials?.length}
                        >
                          <FormControl>
                            <SelectTrigger className="w-full">
                              <SelectValue
                                placeholder={
                                  approvalCredentials?.length
                                    ? "Select a credential"
                                    : "No credentials of this kind yet"
                                }
                              />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {approvalCredentials?.map((credential) => (
                              <SelectItem key={credential.id} value={credential.id}>
                                {credential.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}

                {approvalCredentialType && (
                  <FormField
                    control={form.control}
                    name="approvalRecipient"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>
                          {approvalChannel === "email"
                            ? "Email Address"
                            : approvalChannel === "telegram"
                              ? "Chat ID"
                              : "WhatsApp Number"}
                        </FormLabel>
                        <FormControl>
                          <Input
                            placeholder={
                              approvalChannel === "email"
                                ? "manager@example.com"
                                : approvalChannel === "telegram"
                                  ? "123456789"
                                  : "923001234567"
                            }
                            {...field}
                          />
                        </FormControl>
                        <FormDescription>
                          Who is asked. Supports {"{{variables}}"}.
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}

                {approvalChannel === "whatsapp" && (
                  <FormField
                    control={form.control}
                    name="approvalPhoneNumberId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Phone Number ID</FormLabel>
                        <FormControl>
                          <Input placeholder="123456789012345" {...field} />
                        </FormControl>
                        <FormDescription>
                          WhatsApp only delivers free text to someone who
                          wrote to this number in the last 24 hours.
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}

                {approvalChannel === "slack" && (
                  <FormField
                    control={form.control}
                    name="approvalWebhookUrl"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Slack Webhook URL</FormLabel>
                        <FormControl>
                          <Input
                            placeholder="https://hooks.slack.com/services/..."
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}

                <div className="grid grid-cols-2 gap-3">
                  <FormField
                    control={form.control}
                    name="approvalTimeoutAmount"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Request Expires After</FormLabel>
                        <FormControl>
                          <Input placeholder="24" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="approvalTimeoutUnit"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Unit</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger className="w-full">
                              <SelectValue />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {APPROVAL_UNITS.map((unit) => (
                              <SelectItem key={unit.value} value={unit.value}>
                                {unit.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </FormItem>
                    )}
                  />
                </div>
                <p className="text-sm text-muted-foreground">
                  A request nobody answered in time counts as not approved:
                  the tool is not run and the agent goes on.
                </p>
              </div>
            )}

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
