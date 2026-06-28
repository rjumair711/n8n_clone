"use client"

import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import z from "zod";
import { useForm } from "react-hook-form"
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { useEffect } from "react";
import { CredentialType } from "@prisma/client";
import { useCredentialsByType } from "@/features/credentials/hooks/use-credentials";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import Image from "next/image";

const formSchema = z.object({
    variableName: z
        .string()
        .min(1, { message: "Variable name is required" })
        .regex(/^[A-Za-z_$][A-Za-z0-9_$]*$/, {
            message: "Variable name must start with a letter or underscore and contain only letters, numbers, and underscores"
        }),
    credentialId: z.string().min(1, "Credential is required"),
    chatId: z.string().min(1, "Chat ID or Channel Username is required"),
    text: z.string().min(1, "Message text is required"),
    parseMode: z.enum(["HTML", "MarkdownV2", "None"]).default("None"),
})

export type TelegramFormValues = z.infer<typeof formSchema>;

interface Props {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onSubmit?: (values: z.infer<typeof formSchema>) => void;
    defaultValues?: Partial<TelegramFormValues>
}

export const TelegramDialog = ({
    open,
    onOpenChange,
    onSubmit,
    defaultValues = {}
}: Props) => {
    const {
        data: credentials,
        isLoading: isLoadingCredentials,
    } = useCredentialsByType(CredentialType.TELEGRAM)

    const form = useForm<z.infer<typeof formSchema>>({
        defaultValues: {
            variableName: defaultValues.variableName || "",
            credentialId: defaultValues.credentialId || "",
            chatId: defaultValues.chatId || "",
            text: defaultValues.text || "",
            parseMode: defaultValues.parseMode || "None",
        }
    })

    useEffect(() => {
        if (open) {
            form.reset({
                variableName: defaultValues.variableName || "",
                credentialId: defaultValues.credentialId || "",
                chatId: defaultValues.chatId || "",
                text: defaultValues.text || "",
                parseMode: defaultValues.parseMode || "None",
            });
        }
    }, [open, defaultValues, form])

    const watchVariableName = form.watch("variableName") || "telegramResult";

    const handleSubmit = (values: z.infer<typeof formSchema>) => {
        onSubmit?.(values);
        onOpenChange(false)
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-h-[90vh] overflow-y-auto w-full max-w-lg">
                <DialogHeader>
                    <DialogTitle>Telegram Bot Configuration</DialogTitle>
                    <DialogDescription>
                        Configure your bot settings to broadcast automated chat or channel alerts.
                    </DialogDescription>
                </DialogHeader>
                <Form {...form}>
                    <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-6 mt-4 pb-2">
                        
                        <FormField
                            control={form.control}
                            name="variableName"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Variable Name</FormLabel>
                                    <FormControl>
                                        <Input placeholder="myTelegramAlert" {...field} />
                                    </FormControl>
                                    <FormDescription>
                                        Reference response data down the line via:{" "}
                                        <code className="bg-muted px-1 py-0.5 rounded text-xs">{`{{${watchVariableName}.ok}}`}</code>
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
                                    <FormLabel>Telegram Credentials</FormLabel>
                                    <Select
                                        onValueChange={field.onChange}
                                        defaultValue={field.value}
                                        disabled={isLoadingCredentials || !credentials?.length}
                                    >
                                        <FormControl>
                                            <SelectTrigger className="w-full">
                                                <SelectValue placeholder="Select bot credentials" />
                                            </SelectTrigger>
                                        </FormControl>
                                        <SelectContent>
                                            {credentials?.map((credential) => (
                                                <SelectItem key={credential.id} value={credential.id}>
                                                    <div className="flex items-center gap-2">
                                                        <Image
                                                            src="/logos/telegram.svg"
                                                            alt="Telegram"
                                                            width={16}
                                                            height={16}
                                                        />
                                                        {credential.name}
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
                            name="chatId"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Chat ID / Channel Handle</FormLabel>
                                    <FormControl>
                                        <Input placeholder="-100123456789 or @my_channel" {...field} />
                                    </FormControl>
                                    <FormDescription>
                                        Target numeric chat ID or a public channel handle string. Supports template variables.
                                    </FormDescription>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />

                        <FormField
                            control={form.control}
                            name="parseMode"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Formatting Mode</FormLabel>
                                    <Select onValueChange={field.onChange} value={field.value}>
                                        <FormControl>
                                            <SelectTrigger>
                                                <SelectValue />
                                            </SelectTrigger>
                                        </FormControl>
                                        <SelectContent>
                                            <SelectItem value="None">Plain Text</SelectItem>
                                            <SelectItem value="HTML">HTML Formatting</SelectItem>
                                            <SelectItem value="MarkdownV2">MarkdownV2</SelectItem>
                                        </SelectContent>
                                    </Select>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />

                        <FormField
                            control={form.control}
                            name="text"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Message Content</FormLabel>
                                    <FormControl>
                                        <Textarea
                                            placeholder="Hello Team! New Lead Generated: {{json webhookTrigger.body}}"
                                            className="min-h-[120px] font-mono text-sm"
                                            {...field}
                                        />
                                    </FormControl>
                                    <FormDescription>
                                        Message syntax fields handle standard dynamic Handlebars string tags.
                                    </FormDescription>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />

                        <DialogFooter className="mt-4">
                            <Button type="submit" className="w-full sm:w-auto">Save Node Configuration</Button>
                        </DialogFooter>
                    </form>
                </Form>
            </DialogContent>
        </Dialog>
    )
}