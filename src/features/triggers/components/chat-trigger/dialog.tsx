"use client"

import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { useCredentialsByType } from "@/features/credentials/hooks/use-credentials";
import {
    CHAT_DIRECTIONS,
    DEFAULT_CHAT_COLOR,
    DEFAULT_CHAT_TITLE,
    DEFAULT_HANDOFF_LABEL,
    HANDOFF_CHANNELS,
    buildChatPageUrl,
    buildEmbedSnippet,
    parseAllowedDomains,
} from "@/lib/chat-widget";

// What "Make chat public" saves on the Chat Trigger node
export type ChatTriggerValues = {
    chatPublic: boolean;
    chatTitle: string;
    chatColor: string;
    chatWelcome: string;
    chatAvatarUrl: string;
    // "auto" | "ltr" | "rtl"
    chatDirection: string;
    // Hosts, separated by commas or new lines; empty means any site
    chatAllowedDomains: string;
    handoffEnabled: boolean;
    handoffLabel: string;
    // "email" | "slack" | "whatsapp"
    handoffChannel: string;
    handoffCredentialId: string;
    handoffRecipient: string;
    handoffWebhookUrl: string;
    handoffPhoneNumberId: string;
};

interface Props {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onSubmit: (values: ChatTriggerValues) => void;
    defaultValues?: Partial<ChatTriggerValues>;
    // The Chat Trigger node: the widget's id
    nodeId: string;
}

const getValues = (saved: Partial<ChatTriggerValues> = {}): ChatTriggerValues => ({
    chatPublic: saved.chatPublic === true,
    chatTitle: saved.chatTitle || "",
    chatColor: saved.chatColor || DEFAULT_CHAT_COLOR,
    chatWelcome: saved.chatWelcome || "",
    chatAvatarUrl: saved.chatAvatarUrl || "",
    chatDirection: saved.chatDirection || "auto",
    chatAllowedDomains: saved.chatAllowedDomains || "",
    handoffEnabled: saved.handoffEnabled === true,
    handoffLabel: saved.handoffLabel || "",
    handoffChannel: saved.handoffChannel || "email",
    handoffCredentialId: saved.handoffCredentialId || "",
    handoffRecipient: saved.handoffRecipient || "",
    handoffWebhookUrl: saved.handoffWebhookUrl || "",
    handoffPhoneNumberId: saved.handoffPhoneNumberId || "",
});

const Copyable = ({ label, value, help }: { label: string; value: string; help: string }) => (
    <div className="space-y-1.5">
        <Label>{label}</Label>
        <Input
            value={value}
            readOnly
            className="font-mono text-xs"
            onFocus={(event) => event.target.select()}
        />
        <p className="text-xs text-muted-foreground">{help}</p>
    </div>
);

export const ChatTriggerDialog = ({
    open,
    onOpenChange,
    onSubmit,
    defaultValues,
    nodeId,
}: Props) => {
    const [values, setValues] = useState(() => getValues(defaultValues));
    const [error, setError] = useState("");

    useEffect(() => {
        if (open) {
            setValues(getValues(defaultValues));
            setError("");
        }
    }, [open, defaultValues]);

    const set = <K extends keyof ChatTriggerValues>(key: K, value: ChatTriggerValues[K]) =>
        setValues((current) => ({ ...current, [key]: value }));

    const needsCredential = values.handoffChannel === "email" || values.handoffChannel === "whatsapp";
    const { data: credentials } = useCredentialsByType(
        // The hook needs a type even when Slack is chosen
        values.handoffChannel === "whatsapp" ? "WHATSAPP" : "SMTP"
    );

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
    const domains = parseAllowedDomains(values.chatAllowedDomains);

    const handleSave = () => {
        if (values.chatColor && !/^#[0-9a-f]{6}$/i.test(values.chatColor.trim())) {
            setError("Colour must be a hex colour like #2563eb.");
            return;
        }

        if (values.chatAvatarUrl.trim() && !/^https:\/\//i.test(values.chatAvatarUrl.trim())) {
            setError("Avatar must be the https:// address of an image.");
            return;
        }

        if (values.chatPublic && values.handoffEnabled) {
            const missing =
                values.handoffChannel === "slack"
                    ? !values.handoffWebhookUrl.trim() && "the Slack webhook URL"
                    : !values.handoffCredentialId
                        ? "a credential"
                        : !values.handoffRecipient.trim()
                            ? "who the conversation is sent to"
                            : values.handoffChannel === "whatsapp" && !values.handoffPhoneNumberId.trim()
                                ? "the WhatsApp Phone Number ID"
                                : false;

            if (missing) {
                setError(`"Talk to a human" needs ${missing}.`);
                return;
            }
        }

        onSubmit({ ...values, chatColor: values.chatColor.trim() || DEFAULT_CHAT_COLOR });
        onOpenChange(false);
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-h-[90vh] max-w-xl overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>Chat Trigger</DialogTitle>
                    <DialogDescription>
                        Runs the workflow every time a chat message is sent.
                        Connect it to an AI Agent to build a chatbot; the
                        message is at {"{{chatInput}}"} and the conversation
                        is identified by {"{{sessionId}}"} (used by Memory).
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-5">
                    <div className="flex items-center justify-between gap-4 rounded-lg border bg-muted/20 p-3">
                        <div className="space-y-0.5">
                            <Label>Make chat public</Label>
                            <p className="text-sm text-muted-foreground">
                                Anyone can chat with this workflow on a hosted
                                page, and you can put the chat on your website.
                                The workflow has to be saved and active.
                            </p>
                        </div>
                        <Switch
                            checked={values.chatPublic}
                            onCheckedChange={(checked) => set("chatPublic", checked)}
                        />
                    </div>

                    {values.chatPublic && (
                        <>
                            <Copyable
                                label="Embed snippet"
                                value={buildEmbedSnippet(appUrl, nodeId)}
                                help="Paste it before </body> on your website. It adds a floating chat button."
                            />
                            <Copyable
                                label="Hosted chat page"
                                value={buildChatPageUrl(appUrl, nodeId)}
                                help="A link to the chat on a page of its own."
                            />

                            <div className="grid grid-cols-[1fr_auto] gap-3">
                                <div className="space-y-1.5">
                                    <Label htmlFor="chat-title">Title</Label>
                                    <Input
                                        id="chat-title"
                                        placeholder={DEFAULT_CHAT_TITLE}
                                        value={values.chatTitle}
                                        onChange={(event) => set("chatTitle", event.target.value)}
                                        data-variable-picker="off"
                                    />
                                </div>
                                <div className="space-y-1.5">
                                    <Label htmlFor="chat-color">Colour</Label>
                                    <div className="flex items-center gap-2">
                                        <input
                                            type="color"
                                            aria-label="Pick a colour"
                                            value={/^#[0-9a-f]{6}$/i.test(values.chatColor) ? values.chatColor : DEFAULT_CHAT_COLOR}
                                            onChange={(event) => set("chatColor", event.target.value)}
                                            className="h-9 w-10 cursor-pointer rounded border bg-transparent p-0.5"
                                        />
                                        <Input
                                            id="chat-color"
                                            className="w-28 font-mono"
                                            value={values.chatColor}
                                            onChange={(event) => set("chatColor", event.target.value)}
                                            data-variable-picker="off"
                                        />
                                    </div>
                                </div>
                            </div>

                            <div className="space-y-1.5">
                                <Label htmlFor="chat-welcome">Welcome message</Label>
                                <Textarea
                                    id="chat-welcome"
                                    placeholder="Hi! How can I help you today?"
                                    value={values.chatWelcome}
                                    onChange={(event) => set("chatWelcome", event.target.value)}
                                    dir="auto"
                                    data-variable-picker="off"
                                />
                                <p className="text-xs text-muted-foreground">
                                    Shown as the first message. It is not sent to the workflow.
                                </p>
                            </div>

                            <div className="space-y-1.5">
                                <Label htmlFor="chat-avatar">Avatar</Label>
                                <Input
                                    id="chat-avatar"
                                    placeholder="https://example.com/logo.png"
                                    value={values.chatAvatarUrl}
                                    onChange={(event) => set("chatAvatarUrl", event.target.value)}
                                    data-variable-picker="off"
                                />
                                <p className="text-xs text-muted-foreground">
                                    The https address of a small square image, shown next to the title.
                                </p>
                            </div>

                            <div className="space-y-1.5">
                                <Label>Text direction</Label>
                                <Select
                                    value={values.chatDirection}
                                    onValueChange={(direction) => set("chatDirection", direction)}
                                >
                                    <SelectTrigger className="w-full">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {CHAT_DIRECTIONS.map((direction) => (
                                            <SelectItem key={direction.value} value={direction.value}>
                                                {direction.label}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                                <p className="text-xs text-muted-foreground">
                                    Automatic follows the title and welcome message. Each
                                    message is always shown in the direction of its own text.
                                </p>
                            </div>

                            <div className="space-y-1.5">
                                <Label htmlFor="chat-domains">Allowed domains</Label>
                                <Textarea
                                    id="chat-domains"
                                    placeholder={"example.com\n*.example.com"}
                                    value={values.chatAllowedDomains}
                                    onChange={(event) => set("chatAllowedDomains", event.target.value)}
                                    className="font-mono text-sm"
                                    data-variable-picker="off"
                                />
                                <p className="text-xs text-muted-foreground">
                                    {domains.length === 0
                                        ? "Empty: any website may show the widget. List your sites to keep others from embedding it."
                                        : `Only these sites may show the widget: ${domains.join(", ")}. The hosted chat page still works for everyone.`}
                                </p>
                            </div>

                            <div className="space-y-4 rounded-lg border p-3">
                                <div className="flex items-center justify-between gap-4">
                                    <div className="space-y-0.5">
                                        <Label>&quot;Talk to a human&quot; button</Label>
                                        <p className="text-sm text-muted-foreground">
                                            Sends the conversation to a person and stops
                                            the bot from answering in that conversation.
                                        </p>
                                    </div>
                                    <Switch
                                        checked={values.handoffEnabled}
                                        onCheckedChange={(checked) => set("handoffEnabled", checked)}
                                    />
                                </div>

                                {values.handoffEnabled && (
                                    <>
                                        <div className="space-y-1.5">
                                            <Label htmlFor="handoff-label">Button label</Label>
                                            <Input
                                                id="handoff-label"
                                                placeholder={DEFAULT_HANDOFF_LABEL}
                                                value={values.handoffLabel}
                                                onChange={(event) => set("handoffLabel", event.target.value)}
                                                dir="auto"
                                                data-variable-picker="off"
                                            />
                                        </div>

                                        <div className="space-y-1.5">
                                            <Label>Send the conversation by</Label>
                                            <Select
                                                value={values.handoffChannel}
                                                onValueChange={(channel) =>
                                                    setValues((current) => ({
                                                        ...current,
                                                        handoffChannel: channel,
                                                        // Another channel has other credentials
                                                        handoffCredentialId: "",
                                                    }))
                                                }
                                            >
                                                <SelectTrigger className="w-full">
                                                    <SelectValue />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    {HANDOFF_CHANNELS.map((channel) => (
                                                        <SelectItem key={channel.value} value={channel.value}>
                                                            {channel.label}
                                                        </SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                        </div>

                                        {values.handoffChannel === "slack" && (
                                            <div className="space-y-1.5">
                                                <Label htmlFor="handoff-webhook">Slack webhook URL</Label>
                                                <Input
                                                    id="handoff-webhook"
                                                    placeholder="https://hooks.slack.com/services/..."
                                                    value={values.handoffWebhookUrl}
                                                    onChange={(event) => set("handoffWebhookUrl", event.target.value)}
                                                    data-variable-picker="off"
                                                />
                                            </div>
                                        )}

                                        {needsCredential && (
                                            <>
                                                <div className="space-y-1.5">
                                                    <Label>
                                                        {values.handoffChannel === "email"
                                                            ? "SMTP credential"
                                                            : "WhatsApp credential"}
                                                    </Label>
                                                    <Select
                                                        value={values.handoffCredentialId}
                                                        onValueChange={(id) => set("handoffCredentialId", id)}
                                                        disabled={!credentials?.length}
                                                    >
                                                        <SelectTrigger className="w-full">
                                                            <SelectValue
                                                                placeholder={
                                                                    credentials?.length
                                                                        ? "Select a credential"
                                                                        : "No credentials of this kind yet"
                                                                }
                                                            />
                                                        </SelectTrigger>
                                                        <SelectContent>
                                                            {credentials?.map((credential) => (
                                                                <SelectItem key={credential.id} value={credential.id}>
                                                                    {credential.name}
                                                                </SelectItem>
                                                            ))}
                                                        </SelectContent>
                                                    </Select>
                                                </div>

                                                <div className="space-y-1.5">
                                                    <Label htmlFor="handoff-recipient">
                                                        {values.handoffChannel === "email"
                                                            ? "Email address"
                                                            : "WhatsApp number"}
                                                    </Label>
                                                    <Input
                                                        id="handoff-recipient"
                                                        placeholder={
                                                            values.handoffChannel === "email"
                                                                ? "support@example.com"
                                                                : "923001234567"
                                                        }
                                                        value={values.handoffRecipient}
                                                        onChange={(event) => set("handoffRecipient", event.target.value)}
                                                        data-variable-picker="off"
                                                    />
                                                </div>
                                            </>
                                        )}

                                        {values.handoffChannel === "whatsapp" && (
                                            <div className="space-y-1.5">
                                                <Label htmlFor="handoff-phone-id">Phone Number ID</Label>
                                                <Input
                                                    id="handoff-phone-id"
                                                    placeholder="123456789012345"
                                                    value={values.handoffPhoneNumberId}
                                                    onChange={(event) => set("handoffPhoneNumberId", event.target.value)}
                                                    data-variable-picker="off"
                                                />
                                                <p className="text-xs text-muted-foreground">
                                                    WhatsApp only delivers free text to someone who
                                                    wrote to this number in the last 24 hours.
                                                </p>
                                            </div>
                                        )}
                                    </>
                                )}
                            </div>
                        </>
                    )}

                    {!values.chatPublic && (
                        <div className="rounded-lg bg-muted p-4 space-y-2">
                            <h4 className="font-medium text-sm">How to use</h4>
                            <ol className="text-sm text-muted-foreground space-y-1 list-decimal list-inside">
                                <li>Connect this trigger to an AI Agent node</li>
                                <li>Connect a Chat Model to the agent (and optionally Memory and Tools)</li>
                                <li>Save the workflow</li>
                                <li>Click &quot;Open chat&quot; at the bottom of the canvas</li>
                            </ol>
                        </div>
                    )}

                    {error && <p className="text-sm text-red-600">{error}</p>}
                </div>

                <DialogFooter>
                    <Button type="button" onClick={handleSave}>Save</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
