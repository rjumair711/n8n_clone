"use client"

import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import z from "zod";
import { useForm } from "react-hook-form";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { useEffect } from "react";
import { useCredentialsByType } from "@/features/credentials/hooks/use-credentials";
import { CredentialType } from "@prisma/client";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import Image from "next/image";

// 1. Validation schema matching your Node object and Executor logic
const formSchema = z.object({
    variableName: z
        .string()
        .min(1, { message: "Variable name is required" })
        .regex(/^[A-Za-z_$][A-Za-z0-9_$]*$/, {
            message: "Variable name must start with a letter or underscore and contain only letters, numbers, and underscores"
        }),
    credentialId: z.string().min(1, "Notion workspace credential is required"),
    operation: z.string().min(1, "Operation is required"),
    databaseId: z.string().min(1, "Database ID is required for this operation"),
    propertiesJson: z.string().refine((val) => {
        try {
            JSON.parse(val);
            return true;
        } catch {
            return false;
        }
    }, { message: "Must be a valid JSON object string" })
});

export type NotionFormValues = z.infer<typeof formSchema>;

interface Props {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onSubmit?: (values: NotionFormValues) => void;
    defaultValues?: Partial<NotionFormValues>;
}

export const NotionDialog = ({
    open,
    onOpenChange,
    onSubmit,
    defaultValues = {}
}: Props) => {

    // Fetch saved Notion credentials dynamically
    const {
        data: credentials,
        isLoading: isLoadingCredentials,
    } = useCredentialsByType(CredentialType.NOTION);

    const form = useForm<NotionFormValues>({
        defaultValues: {
            variableName: defaultValues.variableName || "notionResult",
            credentialId: defaultValues.credentialId || "",
            operation: defaultValues.operation || "create_page", // <-- Matched to executor
            databaseId: defaultValues.databaseId || "",
            propertiesJson: defaultValues.propertiesJson || "{\n  \"Name\": {\n    \"title\": [{\"text\": {\"content\": \"New Page Title\"}}]\n  }\n}"
        }
    });

    useEffect(() => {
        if (open) {
            form.reset({
                variableName: defaultValues.variableName || "notionResult",
                credentialId: defaultValues.credentialId || "",
                operation: defaultValues.operation || "create_page", // <-- Matched to executor
                databaseId: defaultValues.databaseId || "",
                propertiesJson: defaultValues.propertiesJson || "{\n  \"Name\": {\n    \"title\": [{\"text\": {\"content\": \"New Page Title\"}}]\n  }\n}"
            });
        }
    }, [open, defaultValues, form]);

    const watchVariableName = form.watch("variableName") || "notionResult";

    const handleSubmit = (values: NotionFormValues) => {
        onSubmit?.(values);
        onOpenChange(false);
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-h-[90vh] overflow-y-auto max-w-xl">
                <DialogHeader>
                    <DialogTitle>Notion Configuration</DialogTitle>
                    <DialogDescription>
                        Configure your Notion integration to write to databases or query workspace pages.
                    </DialogDescription>
                </DialogHeader>
                <Form {...form}>
                    <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-6 mt-4 pb-2">
                        
                        {/* Variable Name Field */}
                        <FormField
                            control={form.control}
                            name="variableName"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Variable Name</FormLabel>
                                    <FormControl>
                                        <Input placeholder="notionResult" {...field} />
                                    </FormControl>
                                    <FormDescription>
                                        Use this name to reference the block execution results downstream: {`{{${watchVariableName}.url}}`}
                                    </FormDescription>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />

                        {/* Dropdown for Credential Selection */}
                        <FormField
                            control={form.control}
                            name="credentialId"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Select Notion Workspace</FormLabel>
                                    <Select
                                        onValueChange={field.onChange}
                                        defaultValue={field.value}
                                        value={field.value} // <-- FIXED: Explicit value binding required for Shadcn UI controlled inputs
                                        disabled={isLoadingCredentials || !credentials?.length}
                                    >
                                        <FormControl>
                                            <SelectTrigger className="w-full">
                                                <SelectValue placeholder={isLoadingCredentials ? "Loading workspaces..." : "Select a connected workspace"} />
                                            </SelectTrigger>
                                        </FormControl>
                                        <SelectContent>
                                            {credentials?.map((credential) => (
                                                <SelectItem key={credential.id} value={credential.id}>
                                                    <div className="flex items-center gap-2">
                                                        <Image
                                                            src="/logos/notion.png" 
                                                            alt="Notion"
                                                            width={16}
                                                            height={16}
                                                            className="rounded-sm object-contain"
                                                            onError={(e) => {
                                                                (e.target as HTMLElement).style.display = 'none';
                                                            }}
                                                        />
                                                        {credential.name}
                                                    </div>
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                    <FormDescription>
                                        Choose the authorized integration token saved in your global Credentials.
                                    </FormDescription>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />

                        {/* Operation Field */}
                        <FormField
                            control={form.control}
                            name="operation"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Operation</FormLabel>
                                    <Select 
                                        onValueChange={field.onChange} 
                                        defaultValue={field.value}
                                        value={field.value} // <-- FIXED: Explicit binding
                                    >
                                        <FormControl>
                                            <SelectTrigger>
                                                <SelectValue placeholder="Select operation" />
                                            </SelectTrigger>
                                        </FormControl>
                                        <SelectContent>
                                            {/* FIXED: Keys now match executor strings perfectly */}
                                            <SelectItem value="create_page">Create Page (Write)</SelectItem>
                                            <SelectItem value="query_database">Query Database (Read)</SelectItem>
                                        </SelectContent>
                                    </Select>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />

                        {/* Database ID Field */}
                        <FormField
                            control={form.control}
                            name="databaseId"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Database ID</FormLabel>
                                    <FormControl>
                                        <Input placeholder="e.g. d18b... (supports {{vars}})" {...field} />
                                    </FormControl>
                                    <FormDescription>The 32-character ID found in your shared Notion database URL.</FormDescription>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />

                        {/* Properties JSON Textarea Field */}
                        <FormField
                            control={form.control}
                            name="propertiesJson"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Properties JSON</FormLabel>
                                    <FormControl>
                                        <Textarea
                                            className="min-h-[140px] font-mono text-sm leading-relaxed"
                                            {...field}
                                        />
                                    </FormControl>
                                    <FormDescription>
                                        Structure schema structured exactly like the Notion Blocks payload API. Supports handles like {`{{variableName}}`}.
                                    </FormDescription>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />

                        <DialogFooter className="mt-4">
                            <Button type="submit">Save Configuration</Button>
                        </DialogFooter>
                    </form>
                </Form>
            </DialogContent>
        </Dialog>
    );
};