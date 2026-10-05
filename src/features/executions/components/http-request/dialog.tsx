"use client"

import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import z from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form"
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { useEffect } from "react";
import { CredentialType } from "@prisma/client";
import { useCredentialsByType } from "@/features/credentials/hooks/use-credentials";

const METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"] as const;
const AUTHENTICATIONS = ["none", "basic", "bearer", "header"] as const;
const BODY_TYPES = ["json", "form", "raw", "none"] as const;
const RESPONSE_FORMATS = ["auto", "file"] as const;

const AUTH_OPTIONS: Record<(typeof AUTHENTICATIONS)[number], {
    label: string;
    credentialType?: CredentialType;
}> = {
    none: { label: "None" },
    basic: { label: "Basic Auth", credentialType: CredentialType.HTTP_BASIC_AUTH },
    bearer: { label: "Bearer Auth", credentialType: CredentialType.HTTP_BEARER_AUTH },
    header: { label: "Header Auth", credentialType: CredentialType.HTTP_HEADER_AUTH },
};

const formSchema = z.object({
    variableName: z
        .string()
        .min(1, { message: "Variable name is required" })
        .regex(/^[A-Za-z_$][A-Za-z0-9_$]*$/, {
            message: "Variable name must start with a letter or underscore and contain only letters, numbers, and underscores"
        }),
    endpoint: z.string().min(1, { message: "Please enter a valid URL" }),
    method: z.enum(METHODS),
    authentication: z.enum(AUTHENTICATIONS),
    credentialId: z.string().optional(),
    queryParams: z.string().optional(),
    headers: z.string().optional(),
    bodyType: z.enum(BODY_TYPES),
    body: z.string().optional(),
    rawContentType: z.string().optional(),
    responseFormat: z.enum(RESPONSE_FORMATS),
    timeout: z.string().optional(),
    neverError: z.boolean(),
}).refine(
    (values) => values.authentication === "none" || !!values.credentialId,
    { path: ["credentialId"], message: "Select a credential" }
)

export type HttpRequestFormValues = z.infer<typeof formSchema>;

interface Props {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onSubmit?: (values: HttpRequestFormValues) => void;
    defaultValues?: Partial<HttpRequestFormValues>
}

const getValues = (defaultValues: Partial<HttpRequestFormValues>): HttpRequestFormValues => ({
    variableName: defaultValues.variableName || "",
    endpoint: defaultValues.endpoint || "",
    method: defaultValues.method || "GET",
    authentication: defaultValues.authentication || "none",
    credentialId: defaultValues.credentialId || "",
    queryParams: defaultValues.queryParams || "",
    headers: defaultValues.headers || "",
    bodyType: defaultValues.bodyType || "json",
    body: defaultValues.body || "",
    rawContentType: defaultValues.rawContentType || "",
    responseFormat: defaultValues.responseFormat || "auto",
    timeout: defaultValues.timeout ? String(defaultValues.timeout) : "",
    neverError: defaultValues.neverError === true,
})

export const HttpRequestDialog = ({
    open,
    onOpenChange,
    onSubmit,
    defaultValues = {}
}: Props) => {
    const form = useForm<HttpRequestFormValues>({
        resolver: zodResolver(formSchema),
        defaultValues: getValues(defaultValues),
    })

    useEffect(() => {
        if (open) {
            form.reset(getValues(defaultValues));
        }
    }, [open, defaultValues, form])

    const watchVariableName = form.watch("variableName") || "myApiCall";
    const watchMethod = form.watch("method")
    const watchAuthentication = form.watch("authentication")
    const watchBodyType = form.watch("bodyType")
    const showBodyField = ["POST", "PUT", "PATCH", "DELETE"].includes(watchMethod)

    const credentialType = AUTH_OPTIONS[watchAuthentication].credentialType
    // The hook needs a type even while no authentication is selected
    const { data: credentials, isLoading: isLoadingCredentials } = useCredentialsByType(
        credentialType ?? CredentialType.HTTP_HEADER_AUTH
    )

    const handleSubmit = (values: HttpRequestFormValues) => {
        onSubmit?.(values);
        onOpenChange(false)
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-h-[90vh] overflow-y-auto max-w-xl">
                <DialogHeader>
                    <DialogTitle>HTTP Request</DialogTitle>
                    <DialogDescription>
                        Call any API. Every field supports {"{{variables}}"}.
                    </DialogDescription>
                </DialogHeader>
                <Form {...form}>
                    <form
                        onSubmit={form.handleSubmit(handleSubmit)}
                        className="space-y-6 mt-4"
                    >
                        <FormField
                            control={form.control}
                            name="variableName"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Variable Name</FormLabel>
                                    <FormControl>
                                        <Input placeholder="myApiCall"
                                            {...field}
                                        />
                                    </FormControl>
                                    <FormDescription>
                                        Use this name to reference the result in
                                        other nodes:{" "}
                                        {`{{${watchVariableName}.httpResponse.data}}`}
                                    </FormDescription>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                        <FormField
                            control={form.control}
                            name="method"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Method</FormLabel>
                                    <Select
                                        onValueChange={field.onChange}
                                        value={field.value}
                                    >
                                        <FormControl>
                                            <SelectTrigger className="w-full">
                                                <SelectValue placeholder="Select a method" />
                                            </SelectTrigger>
                                        </FormControl>
                                        <SelectContent>
                                            {METHODS.map((method) => (
                                                <SelectItem key={method} value={method}>{method}</SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                        <FormField
                            control={form.control}
                            name="endpoint"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>URL</FormLabel>
                                    <FormControl>
                                        <Input placeholder="https://api.example.com/users/{{webhook.body.id}}"
                                            {...field}
                                        />
                                    </FormControl>
                                    <FormDescription>
                                        Only public http(s) addresses can be called.
                                    </FormDescription>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                        <FormField
                            control={form.control}
                            name="authentication"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Authentication</FormLabel>
                                    <Select
                                        onValueChange={(value) => {
                                            field.onChange(value)
                                            // A credential of another type cannot be reused
                                            form.setValue("credentialId", "")
                                        }}
                                        value={field.value}
                                    >
                                        <FormControl>
                                            <SelectTrigger className="w-full">
                                                <SelectValue />
                                            </SelectTrigger>
                                        </FormControl>
                                        <SelectContent>
                                            {AUTHENTICATIONS.map((value) => (
                                                <SelectItem key={value} value={value}>
                                                    {AUTH_OPTIONS[value].label}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                        {credentialType && (
                            <FormField
                                control={form.control}
                                name="credentialId"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>{AUTH_OPTIONS[watchAuthentication].label} Credential</FormLabel>
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
                                                                    : `No ${AUTH_OPTIONS[watchAuthentication].label} credentials yet`
                                                        }
                                                    />
                                                </SelectTrigger>
                                            </FormControl>
                                            <SelectContent>
                                                {credentials?.map((credential) => (
                                                    <SelectItem key={credential.id} value={credential.id}>
                                                        {credential.name}
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
                        <FormField
                            control={form.control}
                            name="queryParams"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Query Parameters (Optional)</FormLabel>
                                    <FormControl>
                                        <Textarea
                                            placeholder={"page=1\nsearch={{webhook.query.q}}"}
                                            className="min-h-[70px] font-mono text-sm"
                                            {...field}
                                        />
                                    </FormControl>
                                    <FormDescription>
                                        One <code>name=value</code> per line, or a JSON object.
                                    </FormDescription>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                        <FormField
                            control={form.control}
                            name="headers"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Headers (Optional)</FormLabel>
                                    <FormControl>
                                        <Textarea
                                            placeholder={"Accept: application/json\nX-Request-Id: {{webhook.body.id}}"}
                                            className="min-h-[70px] font-mono text-sm"
                                            {...field}
                                        />
                                    </FormControl>
                                    <FormDescription>
                                        One <code>Name: value</code> per line, or a JSON object.
                                    </FormDescription>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                        {showBodyField && (
                            <FormField
                                control={form.control}
                                name="bodyType"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Body Content Type</FormLabel>
                                        <Select onValueChange={field.onChange} value={field.value}>
                                            <FormControl>
                                                <SelectTrigger className="w-full">
                                                    <SelectValue />
                                                </SelectTrigger>
                                            </FormControl>
                                            <SelectContent>
                                                <SelectItem value="json">JSON</SelectItem>
                                                <SelectItem value="form">Form URL-encoded</SelectItem>
                                                <SelectItem value="raw">Raw</SelectItem>
                                                <SelectItem value="none">No body</SelectItem>
                                            </SelectContent>
                                        </Select>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                        )}
                        {showBodyField && watchBodyType === "raw" && (
                            <FormField
                                control={form.control}
                                name="rawContentType"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Content-Type</FormLabel>
                                        <FormControl>
                                            <Input placeholder="text/plain" {...field} />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                        )}
                        {showBodyField && watchBodyType !== "none" && (
                            <FormField
                                control={form.control}
                                name="body"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Request Body</FormLabel>
                                        <FormControl>
                                            <Textarea
                                                placeholder={
                                                    watchBodyType === "form"
                                                        ? "name={{webhook.body.name}}\nplan=pro"
                                                        : watchBodyType === "raw"
                                                            ? "Any text"
                                                            : '{\n  "userId": "{{webhook.body.id}}",\n  "items": {{json webhook.body.items}}\n}'
                                                }
                                                className="min-h-[120px] font-mono text-sm"
                                                {...field}
                                            />
                                        </FormControl>
                                        <FormDescription>
                                            {watchBodyType === "form"
                                                ? "One name=value per line, or a JSON object."
                                                : "Use {{variables}} for simple values or {{json variable}} to insert objects and lists."}
                                        </FormDescription>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                        )}
                        <FormField
                            control={form.control}
                            name="responseFormat"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Response Format</FormLabel>
                                    <Select onValueChange={field.onChange} value={field.value}>
                                        <FormControl>
                                            <SelectTrigger className="w-full">
                                                <SelectValue />
                                            </SelectTrigger>
                                        </FormControl>
                                        <SelectContent>
                                            <SelectItem value="auto">Text or JSON</SelectItem>
                                            <SelectItem value="file">File (download)</SelectItem>
                                        </SelectContent>
                                    </Select>
                                    <FormDescription>
                                        File stores the response, such as a PDF or an image,
                                        and gives the workflow{" "}
                                        {`${watchVariableName}.httpResponse.file`} to use in
                                        other nodes.
                                    </FormDescription>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                        <FormField
                            control={form.control}
                            name="timeout"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Timeout in ms (Optional)</FormLabel>
                                    <FormControl>
                                        <Input placeholder="30000" inputMode="numeric" {...field} />
                                    </FormControl>
                                    <FormDescription>
                                        How long to wait for the response. Up to 120000.
                                    </FormDescription>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                        <FormField
                            control={form.control}
                            name="neverError"
                            render={({ field }) => (
                                <FormItem className="flex items-center justify-between gap-4 rounded-md border p-3">
                                    <div className="space-y-1">
                                        <FormLabel>Never Error</FormLabel>
                                        <FormDescription>
                                            Continue even when the API answers with a 4xx or 5xx status.
                                            Check {`{{${watchVariableName}.httpResponse.status}}`} yourself.
                                        </FormDescription>
                                    </div>
                                    <FormControl>
                                        <Switch checked={field.value} onCheckedChange={field.onChange} />
                                    </FormControl>
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
    )
}
