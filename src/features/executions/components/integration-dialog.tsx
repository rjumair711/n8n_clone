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

export type IntegrationField = {
  name: string;
  label: string;
  type?: "text" | "textarea" | "select";
  placeholder?: string;
  description?: string;
  options?: { value: string; label: string }[];
  required?: boolean;
  defaultValue?: string;
  // Show the field only for these operations (all operations when omitted)
  operations?: string[];
};

// Describes an integration node's settings; the dialog is generated from it
export type IntegrationConfig = {
  label: string;
  description: string;
  logo: string;
  credentialType: CredentialType;
  credentialLabel: string;
  defaultVariableName: string;
  operations: { value: string; label: string }[];
  fields: IntegrationField[];
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
  const values: IntegrationFormValues = {
    variableName: defaultValues.variableName || config.defaultVariableName,
    credentialId: defaultValues.credentialId || "",
    operation: defaultValues.operation || config.operations[0].value,
  };

  for (const field of config.fields) {
    values[field.name] = defaultValues[field.name] ?? field.defaultValue ?? "";
  }

  return values;
};

export const IntegrationDialog = ({
  config,
  open,
  onOpenChange,
  onSubmit,
  defaultValues = {},
}: Props) => {
  const { data: credentials, isLoading: isLoadingCredentials } =
    useCredentialsByType(config.credentialType);

  const form = useForm<IntegrationFormValues>({
    defaultValues: getValues(config, defaultValues),
  });

  useEffect(() => {
    if (open) {
      form.reset(getValues(config, defaultValues));
    }
  }, [open, defaultValues, config, form]);

  const operation = form.watch("operation");
  const watchVariableName =
    form.watch("variableName") || config.defaultVariableName;

  const visibleFields = config.fields.filter(
    (field) => !field.operations || field.operations.includes(operation)
  );

  const handleSubmit = (values: IntegrationFormValues) => {
    let valid = true;

    if (!VARIABLE_NAME_PATTERN.test(values.variableName || "")) {
      form.setError("variableName", {
        message:
          "Variable name must start with a letter or underscore and contain only letters, numbers, and underscores",
      });
      valid = false;
    }

    if (!values.credentialId) {
      form.setError("credentialId", {
        message: `${config.credentialLabel} is required`,
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

            <FormField
              control={form.control}
              name="credentialId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{config.credentialLabel}</FormLabel>
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
                            <Image
                              src={config.logo}
                              alt={config.label}
                              width={16}
                              height={16}
                              className="rounded-sm object-contain"
                            />
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
                      {config.operations.map((option) => (
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

            {visibleFields.map((definition) => (
              <FormField
                key={definition.name}
                control={form.control}
                name={definition.name}
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      {definition.label}
                      {!definition.required && " (Optional)"}
                    </FormLabel>
                    {definition.type === "select" ? (
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
                    <FormMessage />
                  </FormItem>
                )}
              />
            ))}

            <p className="text-sm text-muted-foreground">
              Fields support {"{{variables}}"}. When this node is an AI Agent
              tool, use {'{{$fromAI "name" "what it is"}}'} for values the
              agent should fill in.
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
