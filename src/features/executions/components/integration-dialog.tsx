"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { useEffect } from "react";
import { useCredentialsByType } from "@/features/credentials/hooks/use-credentials";
import type { CredentialType } from "@prisma/client";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import Image from "next/image";
import type { LucideIcon } from "lucide-react";
import { useTRPC } from "@/trpc/client";
import { useQuery } from "@tanstack/react-query";
import { useParams } from "next/navigation";
import { ChatModelField, type ChatModelNodeType } from "./chat-model-field";
import { FallbackModelsField, cleanFallbackModels } from "./fallback-models-field";

export type IntegrationField = {
  name: string;
  label: string;
  // "workflow" lists the user's other workflows; "switch" is an on/off
  // option saved as "true" or "false"
  // "model" is a chat model's ID: a text field with suggestions and a
  // "Load models" button (see chat-model-field.tsx)
  // "fallbacks" is a Chat Model's ordered list of models to try next
  // (see fallback-models-field.tsx), saved as a JSON string
  type?: "text" | "textarea" | "select" | "workflow" | "switch" | "model" | "fallbacks";
  // For "model": the node the field belongs to
  modelNodeType?: ChatModelNodeType;
  // Other fields to set when this one changes, e.g. a provider preset
  // filling in its base URL
  sets?: (value: string) => Record<string, string>;
  placeholder?: string;
  description?: string;
  options?: { value: string; label: string }[];
  required?: boolean;
  defaultValue?: string;
  // Show the field only for these operations (all operations when omitted)
  operations?: string[];
  // A warning shown under the field while it returns text
  warning?: (value: string) => string | undefined;
};

// Describes an integration node's settings; the dialog is generated from it
export type IntegrationConfig = {
  label: string;
  description: string;
  // A path under /public or a lucide icon
  logo: string | LucideIcon;
  // Omit for nodes that need no credential
  credentialType?: CredentialType;
  // For nodes whose credential depends on another field (a provider or an
  // authentication select). Returning undefined hides the credential.
  credentialTypeFor?: (
    values: Partial<IntegrationFormValues>
  ) => CredentialType | undefined;
  // Ports on the bottom of the node that other nodes plug into, e.g. a
  // chat model. Their ids start with "sub-".
  subInputs?: { id: string; label: string }[];
  // Named outputs for nodes that branch; replaces the single output
  getOutputs?: (
    values: Partial<IntegrationFormValues>
  ) => { id: string; label: string }[];
  credentialLabel?: string;
  // Omit for nodes that produce no result
  defaultVariableName?: string;
  // Omit for nodes that do a single thing
  operations?: { value: string; label: string }[];
  fields: IntegrationField[];
  // Shown on the canvas when the node has nothing more specific to say
  summary?: string;
  // Replaces the note about {{variables}} at the bottom of the dialog
  hint?: string;
  // Trigger nodes start a run instead of taking part in one
  trigger?: boolean;
  // For triggers another service calls: shows the URL
  // <app>/api/webhooks/<webhookPath>/<workflowId> to copy
  webhookPath?: string;
};

export type IntegrationFormValues = Record<string, string>;

interface Props {
  config: IntegrationConfig;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit?: (values: IntegrationFormValues) => void;
  defaultValues?: Partial<IntegrationFormValues>;
}

const VARIABLE_NAME_PATTERN = /^[A-Za-z_$][A-Za-z0-9_$]*$/;

const getValues = (
  config: IntegrationConfig,
  defaultValues: Partial<IntegrationFormValues> = {}
): IntegrationFormValues => {
  const values: IntegrationFormValues = {};

  if (config.defaultVariableName) {
    values.variableName =
      defaultValues.variableName || config.defaultVariableName;
  }
  if (config.credentialType || config.credentialTypeFor) {
    values.credentialId = defaultValues.credentialId || "";
  }
  if (config.operations?.length) {
    values.operation = defaultValues.operation || config.operations[0].value;
  }

  for (const field of config.fields) {
    values[field.name] = defaultValues[field.name] ?? field.defaultValue ?? "";
  }

  return values;
};

// The user's other workflows, for the Execute Workflow node
const WorkflowSelect = ({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) => {
  const trpc = useTRPC();
  const params = useParams();
  const { data, isLoading } = useQuery(
    trpc.workflows.getMany.queryOptions({ pageSize: 100 })
  );

  const workflows = (data?.items ?? []).filter(
    (workflow) => workflow.id !== params.workflowId
  );

  return (
    <Select onValueChange={onChange} value={value} disabled={isLoading}>
      <FormControl>
        <SelectTrigger className="w-full">
          <SelectValue
            placeholder={
              isLoading
                ? "Loading workflows..."
                : workflows.length
                  ? "Select a workflow"
                  : "No other workflows yet"
            }
          />
        </SelectTrigger>
      </FormControl>
      <SelectContent>
        {workflows.map((workflow) => (
          <SelectItem key={workflow.id} value={workflow.id}>
            {workflow.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
};

export const IntegrationDialog = ({
  config,
  open,
  onOpenChange,
  onSubmit,
  defaultValues = {},
}: Props) => {
  const form = useForm<IntegrationFormValues>({
    defaultValues: getValues(config, defaultValues),
  });

  useEffect(() => {
    if (open) {
      form.reset(getValues(config, defaultValues));
    }
  }, [open, defaultValues, config, form]);

  const operation = form.watch("operation");

  const credentialType = config.credentialTypeFor
    ? config.credentialTypeFor(form.watch())
    : config.credentialType;

  const { data: credentials, isLoading: isLoadingCredentials } =
    // The hook needs a type even for nodes without a credential
    useCredentialsByType(credentialType ?? "OPENAI");
  const watchVariableName =
    form.watch("variableName") || config.defaultVariableName || "";

  const params = useParams();
  const webhookUrl = config.webhookPath
    ? `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/api/webhooks/${config.webhookPath}/${params.workflowId}`
    : null;

  const visibleFields = config.fields.filter(
    (field) => !field.operations || field.operations.includes(operation)
  );

  const handleSubmit = (values: IntegrationFormValues) => {
    let valid = true;

    if (
      config.defaultVariableName &&
      !VARIABLE_NAME_PATTERN.test(values.variableName || "")
    ) {
      form.setError("variableName", {
        message:
          "Variable name must start with a letter or underscore and contain only letters, numbers, and underscores",
      });
      valid = false;
    }

    if (credentialType && !values.credentialId) {
      form.setError("credentialId", {
        message: `${config.credentialLabel || "Credential"} is required`,
      });
      valid = false;
    }

    for (const field of visibleFields) {
      if (field.required && !values[field.name]?.trim()) {
        form.setError(field.name, { message: `${field.label} is required` });
        valid = false;
      }
    }

    if (!valid) return;

    // Lines of a fallback list that were left without a model are dropped
    for (const field of config.fields) {
      if (field.type === "fallbacks") {
        values[field.name] = cleanFallbackModels(values[field.name]);
      }
    }

    onSubmit?.(values);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto max-w-xl">
        <DialogHeader>
          <DialogTitle>{config.label} Configuration</DialogTitle>
          <DialogDescription>{config.description}</DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(handleSubmit)}
            className="space-y-6 mt-4 pb-2"
          >
            {webhookUrl && (
              <div className="space-y-2">
                <FormLabel>Webhook URL</FormLabel>
                <Input
                  value={webhookUrl}
                  readOnly
                  className="font-mono text-sm"
                  onFocus={(event) => event.target.select()}
                />
                <p className="text-sm text-muted-foreground">
                  Paste this as the Callback URL in the other service.
                </p>
              </div>
            )}

            {config.defaultVariableName && (
            <FormField
              control={form.control}
              name="variableName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Variable Name</FormLabel>
                  <FormControl>
                    <Input placeholder={config.defaultVariableName} {...field} />
                  </FormControl>
                  <FormDescription>
                    Use this name to reference the result in other nodes:
                    {" "}{`{{json ${watchVariableName}}}`}
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            )}

            {credentialType && (
            <FormField
              control={form.control}
              name="credentialId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{config.credentialLabel || "Credential"}</FormLabel>
                  <Select
                    onValueChange={field.onChange}
                    value={field.value}
                    disabled={isLoadingCredentials || !credentials?.length}
                  >
                    <FormControl>
                      <SelectTrigger className="w-full">
                        <SelectValue
                          placeholder={
                            isLoadingCredentials
                              ? "Loading credentials..."
                              : credentials?.length
                                ? "Select a credential"
                                : `No ${config.label} credentials yet`
                          }
                        />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {credentials?.map((credential) => (
                        <SelectItem key={credential.id} value={credential.id}>
                          <div className="flex items-center gap-2">
                            {typeof config.logo === "string" && (
                              <Image
                                src={config.logo}
                                alt={config.label}
                                width={16}
                                height={16}
                                className="rounded-sm object-contain"
                              />
                            )}
                            {credential.name}
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormDescription>
                    Add one under Credentials if the list is empty.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            )}

            {!!config.operations?.length && (
            <FormField
              control={form.control}
              name="operation"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Operation</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Select operation" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {config.operations?.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            )}

            {visibleFields.map((definition) => (
              <FormField
                key={definition.name}
                control={form.control}
                name={definition.name}
                render={({ field }) =>
                  definition.type === "switch" ? (
                  <FormItem className="rounded-lg border p-3 bg-muted/20">
                    <div className="flex flex-row items-center justify-between gap-4">
                      <div className="space-y-0.5">
                        <FormLabel>{definition.label}</FormLabel>
                        {definition.description && (
                          <FormDescription>
                            {definition.description}
                          </FormDescription>
                        )}
                      </div>
                      <FormControl>
                        <Switch
                          checked={field.value === "true"}
                          onCheckedChange={(checked) =>
                            field.onChange(checked ? "true" : "false")
                          }
                        />
                      </FormControl>
                    </div>
                    <FormMessage />
                  </FormItem>
                  ) : (
                  <FormItem>
                    <FormLabel>
                      {definition.label}
                      {!definition.required && " (Optional)"}
                    </FormLabel>
                    {definition.type === "workflow" ? (
                      <WorkflowSelect
                        value={field.value}
                        onChange={field.onChange}
                      />
                    ) : definition.type === "model" ? (
                      <ChatModelField
                        nodeType={definition.modelNodeType ?? "CHAT_MODEL"}
                        value={field.value ?? ""}
                        onChange={field.onChange}
                        placeholder={definition.placeholder}
                        provider={form.watch("provider")}
                        baseUrl={form.watch("baseUrl")}
                        credentialId={form.watch("credentialId")}
                      />
                    ) : definition.type === "fallbacks" ? (
                      <FallbackModelsField
                        value={field.value ?? ""}
                        onChange={field.onChange}
                      />
                    ) : definition.type === "select" ? (
                      <Select
                        onValueChange={(selected) => {
                          field.onChange(selected);

                          for (const [name, other] of Object.entries(
                            definition.sets?.(selected) ?? {}
                          )) {
                            form.setValue(name, other, { shouldDirty: true });
                          }
                        }}
                        value={field.value}
                      >
                        <FormControl>
                          <SelectTrigger className="w-full">
                            <SelectValue placeholder="Select" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {definition.options?.map((option) => (
                            <SelectItem key={option.value} value={option.value}>
                              {option.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <FormControl>
                        {definition.type === "textarea" ? (
                          <Textarea
                            placeholder={definition.placeholder}
                            className="min-h-[100px] font-mono text-sm"
                            {...field}
                          />
                        ) : (
                          <Input
                            placeholder={definition.placeholder}
                            {...field}
                          />
                        )}
                      </FormControl>
                    )}
                    {definition.description && (
                      <FormDescription>{definition.description}</FormDescription>
                    )}
                    {definition.warning?.(field.value ?? "") && (
                      <p className="text-sm font-medium text-amber-600 dark:text-amber-500">
                        {definition.warning(field.value ?? "")}
                      </p>
                    )}
                    <FormMessage />
                  </FormItem>
                  )
                }
              />
            ))}

            <p className="text-sm text-muted-foreground">
              {config.hint ?? (
                <>
                  Fields support {"{{variables}}"}. When this node is an AI
                  Agent tool, use {'{{$fromAI "name" "what it is"}}'} for
                  values the agent should fill in.
                </>
              )}
            </p>

            <DialogFooter className="mt-4">
              <Button type="submit">Save Configuration</Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
};
