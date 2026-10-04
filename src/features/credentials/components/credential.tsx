"use client";

import { CredentialType } from "@prisma/client";
import { useRouter } from "next/navigation";
import {
  useCreateCredential,
  useSuspenseCredential,
  useUpdateCredential,
} from "../hooks/use-credentials";
import { useUpgradeModal } from "@/hooks/use-upgrade-modal";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import z from "zod";
import {
  Card, CardContent, CardDescription,
  CardHeader, CardTitle,
} from "@/components/ui/card";
import {
  Form, FormControl, FormField,
  FormItem, FormLabel, FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem,
  SelectTrigger, SelectValue,
} from "@/components/ui/select";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import React from "react";

// FIX: Changed from z.enum to z.nativeEnum to match Prisma enum perfectly
const formSchema = z.object({
  // Required on create; checked in onSubmit because an existing credential
  // with an empty name gets a default name instead of an error
  name: z.string(),
  type: z.nativeEnum(CredentialType),
  value: z.string().min(1, "Value is required"),
});

type FormValues = z.infer<typeof formSchema>;

const credentialTypeOptions = [
  { value: CredentialType.OPENAI, label: "OpenAI", logo: "/logos/openai.svg" },
  { value: CredentialType.ANTHROPIC, label: "Anthropic", logo: "/logos/anthropic.svg" },
  { value: CredentialType.GEMINI, label: "Gemini", logo: "/logos/gemini.svg" },
  { value: CredentialType.SMTP, label: "SMTP (Email)", logo: "/logos/smtp.jfif" },
  { value: CredentialType.GOOGLE_SHEETS, label: "Google Sheets", logo: "/logos/googleSheet.png" },
  { value: CredentialType.GOOGLE_CALENDAR, label: "Google Calendar", logo: "/logos/calender.png" },
  { value: CredentialType.NOTION, label: "Notion", logo: "/logos/notion.png" }, 
  { value: CredentialType.TELEGRAM, label: "Telegram", logo: "/logos/telegram.jfif" },
  { value: CredentialType.GITHUB, label: "GitHub", logo: "/logos/github.svg" },
  { value: CredentialType.AIRTABLE, label: "Airtable", logo: "/logos/airtable.svg" },
  { value: CredentialType.POSTGRES, label: "Postgres", logo: "/logos/postgres.svg" },
  { value: CredentialType.WHATSAPP, label: "WhatsApp", logo: "/logos/whatsapp.svg" },
];

// Everything the form shows for a credential type. Add a type here and the
// placeholders, labels and help text follow.
const credentialFieldConfig: Record<CredentialType, {
  namePlaceholder: string;
  // Used when a saved credential has no name
  defaultName: string;
  secretLabel: string;
  secretPlaceholder: string;
  help?: string;
}> = {
  [CredentialType.OPENAI]: {
    namePlaceholder: "My OpenAI Key",
    defaultName: "OpenAI credential",
    secretLabel: "API Key",
    secretPlaceholder: "sk-...",
    help: "Create one at platform.openai.com under API keys.",
  },
  [CredentialType.ANTHROPIC]: {
    namePlaceholder: "My Anthropic Key",
    defaultName: "Anthropic credential",
    secretLabel: "API Key",
    secretPlaceholder: "sk-ant-...",
    help: "Create one in the Anthropic Console under API keys.",
  },
  [CredentialType.GEMINI]: {
    namePlaceholder: "My Gemini Key",
    defaultName: "Gemini credential",
    secretLabel: "API Key",
    secretPlaceholder: "AIza...",
    help: "Create one in Google AI Studio.",
  },
  [CredentialType.SMTP]: {
    namePlaceholder: "My Gmail SMTP",
    defaultName: "SMTP credential",
    secretLabel: "SMTP Settings",
    secretPlaceholder: "",
  },
  [CredentialType.GOOGLE_SHEETS]: {
    namePlaceholder: "My Google Sheets Account",
    defaultName: "Google Sheets credential",
    secretLabel: "Service Account",
    secretPlaceholder: "",
  },
  [CredentialType.GOOGLE_CALENDAR]: {
    namePlaceholder: "My Google Calendar Account",
    defaultName: "Google Calendar credential",
    secretLabel: "Service Account",
    secretPlaceholder: "",
  },
  [CredentialType.NOTION]: {
    namePlaceholder: "My Notion Workspace",
    defaultName: "Notion credential",
    secretLabel: "Internal Integration Token",
    secretPlaceholder: "secret_... or ntn_...",
    help: "Create an internal integration at notion.so/my-integrations and share your database with it.",
  },
  [CredentialType.TELEGRAM]: {
    namePlaceholder: "My Telegram Bot",
    defaultName: "Telegram credential",
    secretLabel: "Bot Token",
    secretPlaceholder: "123456:ABC-...",
    help: "Message @BotFather on Telegram and use /newbot to get a token.",
  },
  [CredentialType.GITHUB]: {
    namePlaceholder: "My GitHub Token",
    defaultName: "GitHub credential",
    secretLabel: "Personal Access Token",
    secretPlaceholder: "github_pat_... or ghp_...",
    help: "Fine-grained token with Issues and Contents permissions.",
  },
  [CredentialType.AIRTABLE]: {
    namePlaceholder: "My Airtable Token",
    defaultName: "Airtable credential",
    secretLabel: "Personal Access Token",
    secretPlaceholder: "pat...",
    help: "Create one at airtable.com/create/tokens with data.records:read and data.records:write scopes.",
  },
  [CredentialType.POSTGRES]: {
    namePlaceholder: "My Postgres Database",
    defaultName: "Postgres credential",
    secretLabel: "Connection String",
    secretPlaceholder: "postgresql://user:password@host/db?sslmode=require",
    help: "Use a database user that only has the permissions your workflows need.",
  },
  [CredentialType.WHATSAPP]: {
    namePlaceholder: "My WhatsApp Business Account",
    defaultName: "WhatsApp credential",
    secretLabel: "Access Token",
    secretPlaceholder: "Cloud API access token",
    help: "A permanent System User token from Meta Business with the whatsapp_business_messaging permission.",
  },
};

interface CredentialFormProps {
  initialData?: {
    id?: string;
    name: string;
    type: CredentialType;
    value: string;
  };
}

export const CredentialForm = ({ initialData }: CredentialFormProps) => {
  const router = useRouter();
  const createCredential = useCreateCredential();
  const updateCredential = useUpdateCredential();
  const { handleError, modal } = useUpgradeModal();
  const isEdit = !!initialData?.id;

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema), // FIX: Removed 'as any' since types align perfectly now
    defaultValues: initialData || {
      name: "",
      type: CredentialType.OPENAI,
      value: "",
    },
  });

  const selectedType = form.watch("type");

  // SMTP fields
  const [smtpFields, setSmtpFields] = React.useState({
    host: "", port: "465", user: "", pass: "", fromName: "",
  });

  // Shared Service Account fields for both Sheets & Calendar
  const [serviceAccountFields, setServiceAccountFields] = React.useState({
    clientEmail: "",
    privateKey: "",
    projectId: "",
  });

  // Sync SMTP → form value
  React.useEffect(() => {
    if (selectedType === CredentialType.SMTP) {
      form.setValue("value", JSON.stringify(smtpFields), { shouldValidate: true });
    }
  }, [smtpFields, selectedType, form]);

  // Sync Google Service Accounts (Sheets & Calendar) → form value
  React.useEffect(() => {
    if (selectedType === CredentialType.GOOGLE_SHEETS || selectedType === CredentialType.GOOGLE_CALENDAR) {
      form.setValue("value", JSON.stringify(serviceAccountFields), { shouldValidate: true });
    }
  }, [serviceAccountFields, selectedType, form]);

  const fieldConfig = credentialFieldConfig[selectedType];

  const onSubmit = async (values: FormValues) => {
    if (!isEdit && !values.name.trim()) {
      form.setError("name", { message: "Credential name is required" });
      return;
    }

    const isGoogleServiceAccount = selectedType === CredentialType.GOOGLE_SHEETS || selectedType === CredentialType.GOOGLE_CALENDAR;

    const finalValue =
      selectedType === CredentialType.SMTP
        ? JSON.stringify(smtpFields)
        : isGoogleServiceAccount
          ? JSON.stringify(serviceAccountFields)
          : values.value;

    const finalName = values.name.trim() || fieldConfig.defaultName;

    const payload = { ...values, name: finalName, value: finalValue };

    if (isEdit && initialData?.id) {
      await updateCredential.mutateAsync({ id: initialData.id, ...payload });
    } else {
      await createCredential.mutateAsync(payload, {
        onSuccess: () => router.push("/credentials"),
        onError: (error) => handleError(error),
      });
    }
  };

  const isGoogleServiceAccountType = selectedType === CredentialType.GOOGLE_SHEETS || selectedType === CredentialType.GOOGLE_CALENDAR;

  return (
    <>
      {modal}
      <Card className="shadow-none">
        <CardHeader>
          <CardTitle>{isEdit ? "Edit Credential" : "Create Credential"}</CardTitle>
          <CardDescription>
            {isEdit ? "Update your credential details" : "Add a new credential to your account"}
          </CardDescription>
        </CardHeader>

        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">

              {/* Type selector */}
              <FormField
                control={form.control}
                name="type"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Credential Type</FormLabel>
                    <Select
                      value={field.value}
                      onValueChange={(value) => {
                        field.onChange(value);
                        if (value === CredentialType.SMTP) {
                          form.setValue("value", JSON.stringify(smtpFields));
                        } else if (value === CredentialType.GOOGLE_SHEETS || value === CredentialType.GOOGLE_CALENDAR) {
                          form.setValue("value", JSON.stringify(serviceAccountFields));
                        } else {
                          form.setValue("value", "");
                        }
                      }}
                    >
                      <FormControl>
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Select credential type" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {credentialTypeOptions.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            <div className="flex items-center gap-2">
                              <div className="w-4 h-4 flex items-center justify-center">
                                <Image src={option.logo} alt={option.label} width={16} height={16} className="object-contain" />
                              </div>
                              {option.label}
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Credential name */}
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Credential Name</FormLabel>
                    <FormControl>
                      <Input
                        placeholder={fieldConfig.namePlaceholder}
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* SMTP fields */}
              {selectedType === CredentialType.SMTP && (
                <div className="space-y-4 rounded-md border p-4 bg-muted/20">
                  <h3 className="text-sm font-medium">SMTP Settings</h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-xs font-medium">Host</label>
                      <Input placeholder="smtp.gmail.com" value={smtpFields.host}
                        onChange={(e) => setSmtpFields({ ...smtpFields, host: e.target.value })} />
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-medium">Port</label>
                      <Input placeholder="465" value={smtpFields.port}
                        onChange={(e) => setSmtpFields({ ...smtpFields, port: e.target.value })} />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-medium">User Email</label>
                    <Input placeholder="name@gmail.com" value={smtpFields.user}
                      onChange={(e) => setSmtpFields({ ...smtpFields, user: e.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-medium">Password / App Password</label>
                    <Input type="password" placeholder="••••••••••••••••" value={smtpFields.pass}
                      onChange={(e) => setSmtpFields({ ...smtpFields, pass: e.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-medium">From Name (optional)</label>
                    <Input placeholder="Muhammad Umair" value={smtpFields.fromName}
                      onChange={(e) => setSmtpFields({ ...smtpFields, fromName: e.target.value })} />
                  </div>
                </div>
              )}

              {/* Google Service Account fields (Sheets & Calendar) */}
              {isGoogleServiceAccountType && (
                <div className="space-y-4 rounded-md border p-4 bg-muted/20">
                  <div className="space-y-1">
                    <h3 className="text-sm font-medium">Google Service Account</h3>
                    <p className="text-xs text-muted-foreground">
                      Create a Service Account in{" "}
                      <a
                        href="https://console.cloud.google.com/iam-admin/serviceaccounts"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="underline"
                      >
                        Google Cloud Console
                      </a>
                      , enable the {selectedType === CredentialType.GOOGLE_SHEETS ? "Google Sheets" : "Google Calendar"} API, and share your {selectedType === CredentialType.GOOGLE_SHEETS ? "sheet" : "calendar"} with the service account email.
                    </p>
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs font-medium">Project ID</label>
                    <Input
                      placeholder="my-project-123"
                      value={serviceAccountFields.projectId}
                      onChange={(e) => setServiceAccountFields({ ...serviceAccountFields, projectId: e.target.value })}
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs font-medium">Client Email</label>
                    <Input
                      placeholder="my-service-account@my-project.iam.gserviceaccount.com"
                      value={serviceAccountFields.clientEmail}
                      onChange={(e) => setServiceAccountFields({ ...serviceAccountFields, clientEmail: e.target.value })}
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs font-medium">Private Key</label>
                    <Textarea
                      placeholder={"-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----"}
                      className="min-h-[120px] font-mono text-xs"
                      value={serviceAccountFields.privateKey}
                      onChange={(e) => setServiceAccountFields({ ...serviceAccountFields, privateKey: e.target.value })}
                    />
                    <p className="text-xs text-muted-foreground">
                      Paste the full private key from your Service Account JSON file.
                    </p>
                  </div>
                </div>
              )}

              {/* API key / Token entry field for Notion, Telegram, and LLMs */}
              {selectedType !== CredentialType.SMTP && !isGoogleServiceAccountType && (
                <FormField
                  control={form.control}
                  name="value"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{fieldConfig.secretLabel}</FormLabel>
                      <FormControl>
                        <Input
                          type="password"
                          placeholder={fieldConfig.secretPlaceholder}
                          {...field}
                        />
                      </FormControl>
                      {fieldConfig.help && (
                        <p className="text-xs text-muted-foreground">
                          {fieldConfig.help}
                        </p>
                      )}
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}

              <div className="flex gap-4">
                <Button type="submit" disabled={createCredential.isPending || updateCredential.isPending}>
                  {isEdit ? "Update" : "Create"}
                </Button>
                <Button type="button" variant="outline" asChild>
                  <Link href="/credentials" prefetch>Cancel</Link>
                </Button>
              </div>

            </form>
          </Form>
        </CardContent>
      </Card>
    </>
  );
};

export const CredentialView = ({ credentialId }: { credentialId: string }) => {
  const { data: credential } = useSuspenseCredential(credentialId);
  return <CredentialForm initialData={credential} />;
};