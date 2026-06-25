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
  name: z.string().min(1, "Credential name is required"),
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
];

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

  const onSubmit = async (values: FormValues) => {
    const isGoogleServiceAccount = selectedType === CredentialType.GOOGLE_SHEETS || selectedType === CredentialType.GOOGLE_CALENDAR;

    const finalValue =
      selectedType === CredentialType.SMTP
        ? JSON.stringify(smtpFields)
        : isGoogleServiceAccount
          ? JSON.stringify(serviceAccountFields)
          : values.value;

    const finalName =
      selectedType === CredentialType.SMTP && !values.name.trim()
        ? smtpFields.user || "SMTP Credential"
        : isGoogleServiceAccount && !values.name.trim()
          ? serviceAccountFields.clientEmail || `${selectedType === CredentialType.GOOGLE_SHEETS ? 'Google Sheets' : 'Google Calendar'} Credential`
          : values.name;

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
                          form.setValue("name", "SMTP Email");
                          form.setValue("value", JSON.stringify(smtpFields));
                        } else if (value === CredentialType.GOOGLE_SHEETS) {
                          form.setValue("name", "Google Sheets");
                          form.setValue("value", JSON.stringify(serviceAccountFields));
                        } else if (value === CredentialType.GOOGLE_CALENDAR) {
                          form.setValue("name", "Google Calendar");
                          form.setValue("value", JSON.stringify(serviceAccountFields));
                        } else if (value === CredentialType.NOTION) {
                          form.setValue("name", "Notion Connection");
                          form.setValue("value", "");
                        } else {
                          form.setValue("name", "");
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
                    <FormLabel>
                      {selectedType === CredentialType.SMTP || isGoogleServiceAccountType
                        ? "Credential Name"
                        : "API Key Name"}
                    </FormLabel>
                    <FormControl>
                      <Input
                        placeholder={
                          selectedType === CredentialType.SMTP ? "My Gmail SMTP" :
                            selectedType === CredentialType.GOOGLE_SHEETS ? "My Google Sheets Account" :
                              selectedType === CredentialType.GOOGLE_CALENDAR ? "My Google Calendar Account" :
                                selectedType === CredentialType.NOTION ? "My Notion Workspace" :
                                  "My OpenAI Key"
                        }
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

              {/* API key / Token entry field for Notion and LLMs */}
              {selectedType !== CredentialType.SMTP && !isGoogleServiceAccountType && (
                <FormField
                  control={form.control}
                  name="value"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>
                        {selectedType === CredentialType.NOTION ? "Internal Integration Token" : "API Key"}
                      </FormLabel>
                      <FormControl>
                        <Input
                          type="password"
                          placeholder={
                            selectedType === CredentialType.OPENAI ? "sk-..." : 
                              selectedType === CredentialType.NOTION ? "secret_..." : 
                                "Key..."
                          }
                          {...field}
                        />
                      </FormControl>
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