"use client"

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CopyIcon, RefreshCwIcon } from "lucide-react";
import { useParams } from "next/navigation";
import { useEffect } from "react";
import { toast } from "sonner";

interface Props {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    secret?: string;
    onSecretChange: (secret: string) => void;
}

const generateSecret = () => {
    const bytes = new Uint8Array(24)
    crypto.getRandomValues(bytes)
    return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("")
}

export const WebhookTriggerDialog = ({
    open,
    onOpenChange,
    secret,
    onSecretChange,
}: Props) => {

    const params = useParams()
    const workflowId = params.workflowId as string;

    // Construct the webhook URL
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"
    const webhookUrl = `${baseUrl}/api/webhooks/trigger/${workflowId}`

    // The route rejects requests without the secret, so every node needs one
    useEffect(() => {
        if (open && !secret) {
            onSecretChange(generateSecret())
        }
    }, [open, secret, onSecretChange])

    const copyToClipboard = async (value: string, label: string) => {
        try {
            await navigator.clipboard.writeText(value);
            toast.success(`${label} copied to clipboard`)
        } catch {
            toast.error(`Failed to copy ${label}`)
        }
    }

    const curlExample = `curl -X POST "${webhookUrl}" \\
  -H "Content-Type: application/json" \\
  -H "x-webhook-secret: ${secret || "<secret>"}" \\
  -d '{"hello":"world"}'`

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>Webhook Trigger Configuration</DialogTitle>
                    <DialogDescription>
                        Send an HTTP request to this URL to run the workflow.
                        Save the workflow after opening this dialog so the
                        secret is stored.
                    </DialogDescription>
                </DialogHeader>
                <div className="space-y-4">
                    <div className="space-y-2">
                        <Label htmlFor="webhook-url">
                            Webhook URL
                        </Label>
                        <div className="flex gap-2">
                            <Input
                                id="webhook-url"
                                value={webhookUrl}
                                readOnly
                                className="font-mono text-sm" />
                            <Button
                                type="button"
                                size="icon"
                                variant="outline"
                                onClick={() => copyToClipboard(webhookUrl, "Webhook URL")}
                            >
                                <CopyIcon className="size-4" />
                            </Button>
                        </div>
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="webhook-secret">
                            Secret
                        </Label>
                        <div className="flex gap-2">
                            <Input
                                id="webhook-secret"
                                value={secret || ""}
                                readOnly
                                className="font-mono text-sm" />
                            <Button
                                type="button"
                                size="icon"
                                variant="outline"
                                onClick={() => copyToClipboard(secret || "", "Secret")}
                            >
                                <CopyIcon className="size-4" />
                            </Button>
                            <Button
                                type="button"
                                size="icon"
                                variant="outline"
                                onClick={() => onSecretChange(generateSecret())}
                            >
                                <RefreshCwIcon className="size-4" />
                            </Button>
                        </div>
                        <p className="text-sm text-muted-foreground">
                            Send it in the <code>x-webhook-secret</code> header,
                            or as a <code>?secret=</code> query parameter.
                            Requests without it are rejected.
                        </p>
                    </div>
                    <div className="rounded-lg bg-muted p-4 space-y-3">
                        <h4 className="font-medium text-sm">Example request:</h4>
                        <pre className="text-xs overflow-x-auto whitespace-pre-wrap break-all">{curlExample}</pre>
                        <Button
                            type="button"
                            variant="outline"
                            onClick={() => copyToClipboard(curlExample, "Example request")}
                        >
                            <CopyIcon className="size-4 mr-2" />
                            Copy example
                        </Button>
                    </div>
                    <div className="rounded-lg bg-muted p-4 space-y-2">
                        <h4 className="font-medium text-sm">Available Variables</h4>
                        <ul className="text-sm text-muted-foreground space-y-1">
                            <li>
                                <code className="bg-background px-1 py-0.5 rounded">
                                    {"{{webhook.body.fieldName}}"}
                                </code>
                                - A field from the request body
                            </li>
                            <li>
                                <code className="bg-background px-1 py-0.5 rounded">
                                    {"{{webhook.query.name}}"}
                                </code>
                                - A query string parameter
                            </li>
                            <li>
                                <code className="bg-background px-1 py-0.5 rounded">
                                    {"{{webhook.method}}"}
                                </code>
                                - The HTTP method
                            </li>
                            <li>
                                <code className="bg-background px-1 py-0.5 rounded">
                                    {"{{json webhook.body}}"}
                                </code>
                                - The whole body as JSON
                            </li>
                        </ul>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    )
}
