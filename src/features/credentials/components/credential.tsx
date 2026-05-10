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
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import React from "react";

const formSchema = z.object({
  name: z.string().min(1, "Credential name is required"),
  type: z.enum(CredentialType),
  value: z.string().min(1, "Value is required"),
});

type FormValues = z.infer<typeof formSchema>;

const credentialTypeOptions = [
  {
    value: CredentialType.OPENAI,
    label: "OpenAI",
    logo: "/logos/openai.svg",
  },
  {
    value: CredentialType.ANTHROPIC,
    label: "Anthropic",
    logo: "/logos/anthropic.svg",
  },
  {
    value: CredentialType.GEMINI,
    label: "Gemini",
    logo: "/logos/gemini.svg",
  },
  {
    value: CredentialType.SMTP,
    label: "SMTP (Email)",
    logo: "/logos/smtp.jfif",
  },
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
    resolver: zodResolver(formSchema),
    defaultValues: initialData || {
      name: "",
      type: CredentialType.OPENAI,
      value: "",
    },
  });

  const selectedType = form.watch("type");

  const [smtpFields, setSmtpFields] = React.useState({
    host: "",
    port: "465",
    user: "",
    pass: "",
    fromName: "",
  });

  React.useEffect(() => {
    if (selectedType === CredentialType.SMTP) {
      form.setValue("value", JSON.stringify(smtpFields), {
        shouldValidate: true,
      });
    }
  }, [smtpFields, selectedType, form]);

  const onSubmit = async (values: FormValues) => {
    const finalValue =
      selectedType === CredentialType.SMTP
        ? JSON.stringify(smtpFields)
        : values.value;

    const finalName =
      selectedType === CredentialType.SMTP && !values.name.trim()
        ? smtpFields.user || "SMTP Credential"
        : values.name;

    const payload = {
      ...values,
      name: finalName,
      value: finalValue,
    };

    if (isEdit && initialData?.id) {
      await updateCredential.mutateAsync({
        id: initialData.id,
        ...payload,
      });
    } else {
      await createCredential.mutateAsync(payload, {
        onSuccess: () => {
          router.push("/credentials");
        },
        onError: (error) => handleError(error),
      });
    }
  };

  return (
    <>
      {modal}

      <Card className="shadow-none">
        <CardHeader>
          <CardTitle>{isEdit ? "Edit Credential" : "Create Credential"}</CardTitle>
          <CardDescription>
            {isEdit
              ? "Update your credential details"
              : "Add a new credential to your account"}
          </CardDescription>
        </CardHeader>

        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
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
                              <Image
                                src={option.logo}
                                alt={option.label}
                                width={16}
                                height={16}
                              />
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

              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      {selectedType === CredentialType.SMTP
                        ? "Credential Name"
                        : "API Key Name"}
                    </FormLabel>
                    <FormControl>
                      <Input
                        placeholder={
                          selectedType === CredentialType.SMTP
                            ? "My Gmail SMTP"
                            : "My OpenAI Key"
                        }
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {selectedType === CredentialType.SMTP ? (
                <div className="space-y-4 rounded-md border p-4 bg-muted/20">
                  <h3 className="text-sm font-medium">SMTP Settings</h3>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-xs font-medium">Host</label>
                      <Input
                        placeholder="smtp.gmail.com"
                        value={smtpFields.host}
                        onChange={(e) =>
                          setSmtpFields({ ...smtpFields, host: e.target.value })
                        }
                      />
                    </div>

                    <div className="space-y-2">
                      <label className="text-xs font-medium">Port</label>
                      <Input
                        placeholder="465"
                        value={smtpFields.port}
                        onChange={(e) =>
                          setSmtpFields({ ...smtpFields, port: e.target.value })
                        }
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs font-medium">User Email</label>
                    <Input
                      placeholder="name@gmail.com"
                      value={smtpFields.user}
                      onChange={(e) =>
                        setSmtpFields({ ...smtpFields, user: e.target.value })
                      }
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs font-medium">
                      Password / App Password
                    </label>
                    <Input
                      type="password"
                      placeholder="••••••••••••••••"
                      value={smtpFields.pass}
                      onChange={(e) =>
                        setSmtpFields({ ...smtpFields, pass: e.target.value })
                      }
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs font-medium">
                      From Name optional
                    </label>
                    <Input
                      placeholder="Muhammad Umair"
                      value={smtpFields.fromName}
                      onChange={(e) =>
                        setSmtpFields({
                          ...smtpFields,
                          fromName: e.target.value,
                        })
                      }
                    />
                  </div>
                </div>
              ) : (
                <FormField
                  control={form.control}
                  name="value"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>API Key</FormLabel>
                      <FormControl>
                        <Input
                          type="password"
                          placeholder={
                            selectedType === CredentialType.OPENAI
                              ? "sk-..."
                              : "Key..."
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
                <Button
                  type="submit"
                  disabled={createCredential.isPending || updateCredential.isPending}
                >
                  {isEdit ? "Update" : "Create"}
                </Button>

                <Button type="button" variant="outline" asChild>
                  <Link href="/credentials" prefetch>
                    Cancel
                  </Link>
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