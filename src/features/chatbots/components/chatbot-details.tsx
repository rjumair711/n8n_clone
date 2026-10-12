"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { generateSecret } from "@/lib/generate-secret";
import { useTRPC } from "@/trpc/client";
import { CHATBOT_FILE_ACCEPT, parseUrlList } from "../lib/chatbot";
import { WhatsappFields } from "./create-chatbot";
import { SourceProgressList, getFileProblem, useAddSources } from "./use-add-sources";

const Copyable = ({ label, value, help }: { label: string; value: string; help: string }) => (
    <div className="space-y-1.5">
        <Label>{label}</Label>
        <div className="flex gap-2">
            <Input
                value={value}
                readOnly
                className="font-mono text-xs"
                onFocus={(event) => event.target.select()}
            />
            <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() =>
                    navigator.clipboard
                        .writeText(value)
                        .then(() => toast.success("Copied"))
                        .catch(() => toast.error("Could not copy: select the text instead"))
                }
            >
                Copy
            </Button>
        </div>
        <p className="text-xs text-muted-foreground">{help}</p>
    </div>
);

/**
 * A chatbot's page: where to put it (website widget, share link, WhatsApp)
 * and what it knows. Everything here is read from the chatbot's workflow.
 */
export const ChatbotDetails = ({ id }: { id: string }) => {
    const trpc = useTRPC();
    const queryClient = useQueryClient();

    const query = trpc.chatbots.get.queryOptions({ id });
    const { data, isLoading, error } = useQuery(query);
    const { data: options } = useQuery(trpc.chatbots.getOptions.queryOptions());

    const refresh = () => queryClient.invalidateQueries(query);

    const setActive = useMutation(
        trpc.workflows.setActive.mutationOptions({
            onSuccess: (workflow) => {
                toast.success(workflow.active ? "The chatbot is on" : "The chatbot is off");
                refresh();
                queryClient.invalidateQueries(trpc.chatbots.list.queryOptions());
            },
            onError: (failure) => toast.error(failure.message),
        })
    );

    const removeSource = useMutation(
        trpc.chatbots.removeSource.mutationOptions({
            onSuccess: () => {
                toast.success("Removed");
                refresh();
            },
            onError: (failure) => toast.error(failure.message),
        })
    );

    const connectWhatsapp = useMutation(
        trpc.chatbots.connectWhatsapp.mutationOptions({
            onSuccess: () => {
                toast.success("WhatsApp is connected. Finish the setup in Meta below.");
                refresh();
            },
            onError: (failure) => toast.error(failure.message),
        })
    );

    const sources = useAddSources();
    const fileInput = useRef<HTMLInputElement>(null);
    const [urlText, setUrlText] = useState("");
    const [whatsappCredentialId, setWhatsappCredentialId] = useState("");
    const [appSecret, setAppSecret] = useState("");
    const [verifyToken, setVerifyToken] = useState(() => generateSecret().slice(0, 24));

    if (isLoading) {
        return <p className="p-8 text-sm text-muted-foreground">Loading the chatbot...</p>;
    }

    if (!data) {
        return (
            <div className="mx-auto w-full max-w-3xl space-y-3 p-4 md:p-8">
                <p className="text-sm">{error?.message ?? "Chatbot not found."}</p>
                <Button asChild variant="outline" size="sm">
                    <Link href="/chatbots">Back to chatbots</Link>
                </Button>
            </div>
        );
    }

    const { urls, invalid: invalidUrls } = parseUrlList(urlText);
    const whatsappCredentials = options?.whatsappCredentials ?? [];
    const whatsappCredential =
        whatsappCredentials.find((item) => item.id === whatsappCredentialId) ??
        whatsappCredentials[0];
    const live = data.active && data.chatPublic;

    const addSources = async (files: File[], pages: string[]) => {
        const problems = files.flatMap((file) => {
            const problem = getFileProblem(file);

            return problem ? [`${file.name}: ${problem}`] : [];
        });

        if (problems.length > 0) {
            toast.error(problems.join("; "));
            return;
        }

        const failed = await sources.run(id, files, pages);

        if (failed === 0) {
            setUrlText("");
            if (fileInput.current) fileInput.current.value = "";
        }

        refresh();
    };

    return (
        <div className="mx-auto w-full max-w-3xl space-y-6 p-4 md:p-8">
            <Card className="shadow-none">
                <CardHeader className="flex flex-row items-start justify-between gap-4">
                    <div className="space-y-1.5">
                        <CardTitle>{data.name}</CardTitle>
                        <CardDescription>
                            {live
                                ? "The chatbot is on: its widget and link answer."
                                : !data.active
                                    ? "The chatbot is off: its widget, link and WhatsApp do not answer."
                                    : "\"Make chat public\" is off on the Chat Trigger: the widget and link do not answer. Switch it on in the editor."}
                        </CardDescription>
                    </div>
                    <label className="flex shrink-0 items-center gap-2 text-sm">
                        <Switch
                            checked={data.active}
                            disabled={setActive.isPending}
                            onCheckedChange={(active) => setActive.mutate({ id, active })}
                        />
                        On
                    </label>
                </CardHeader>
                <CardContent className="flex flex-wrap gap-2">
                    <Button asChild size="sm" variant="outline">
                        <a href={data.chatUrl} target="_blank" rel="noreferrer">
                            Try the chat
                        </a>
                    </Button>
                    <Button asChild size="sm" variant="outline">
                        <Link href={`/workflows/${data.id}`}>Open the workflow in the editor</Link>
                    </Button>
                    <Button asChild size="sm" variant="ghost">
                        <Link href="/chatbots">All chatbots</Link>
                    </Button>
                </CardContent>
            </Card>

            <Card className="shadow-none">
                <CardHeader>
                    <CardTitle className="text-base">Put it on your website, or share it</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <Copyable
                        label="Website widget"
                        value={data.embedSnippet}
                        help="Paste it before </body> on your website. It adds a floating chat button."
                    />
                    <Copyable
                        label="Share link"
                        value={data.chatUrl}
                        help="The chat on a page of its own, for a message, an email or a QR code."
                    />
                    <p className="text-xs text-muted-foreground">
                        Title, colour, welcome message, allowed websites and the &quot;Talk to a
                        human&quot; button are on the Chat Trigger node in the editor.
                    </p>
                </CardContent>
            </Card>

            <Card className="shadow-none">
                <CardHeader>
                    <CardTitle className="text-base">WhatsApp</CardTitle>
                    <CardDescription>
                        The same bot answers messages sent to your WhatsApp Business number.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    {data.whatsapp ? (
                        <>
                            <Copyable
                                label="Webhook URL (Callback URL)"
                                value={data.whatsapp.webhookUrl}
                                help="In your Meta app: WhatsApp > Configuration > Webhook > Edit."
                            />
                            <Copyable
                                label="Verify Token"
                                value={data.whatsapp.verifyToken}
                                help="Type the same into Meta's Verify token field, then Verify and save."
                            />
                            <ol className="list-decimal space-y-1 pl-5 text-xs text-muted-foreground">
                                <li>Keep the chatbot on: Meta checks the Webhook URL when you save it.</li>
                                <li>After saving, subscribe to the <span className="font-mono">messages</span> field.</li>
                                <li>
                                    Send a message to your number. The reply goes out from the
                                    number that received it.
                                </li>
                            </ol>
                            {!data.whatsapp.hasAppSecret && (
                                <p className="text-xs text-destructive">
                                    The WhatsApp Trigger has no App Secret, so messages are
                                    rejected. Add it on the node in the editor.
                                </p>
                            )}
                        </>
                    ) : data.whatsappPlan ? (
                        <p className="text-sm text-muted-foreground">
                            WhatsApp requires the {data.whatsappPlan} plan.{" "}
                            <Link href="/pricing" className="underline">
                                See the plans
                            </Link>
                            .
                        </p>
                    ) : (
                        <>
                            <WhatsappFields
                                credentials={whatsappCredentials}
                                credentialId={whatsappCredential?.id ?? ""}
                                onCredentialId={setWhatsappCredentialId}
                                appSecret={appSecret}
                                onAppSecret={setAppSecret}
                                verifyToken={verifyToken}
                                onVerifyToken={setVerifyToken}
                                disabled={connectWhatsapp.isPending}
                            />
                            {whatsappCredentials.length > 0 && (
                                <div className="flex justify-end">
                                    <Button
                                        size="sm"
                                        disabled={
                                            connectWhatsapp.isPending ||
                                            !whatsappCredential ||
                                            !appSecret.trim() ||
                                            verifyToken.trim().length < 8
                                        }
                                        onClick={() =>
                                            whatsappCredential &&
                                            connectWhatsapp.mutate({
                                                id,
                                                credentialId: whatsappCredential.id,
                                                appSecret: appSecret.trim(),
                                                verifyToken: verifyToken.trim(),
                                            })
                                        }
                                    >
                                        Connect WhatsApp
                                    </Button>
                                </div>
                            )}
                        </>
                    )}
                </CardContent>
            </Card>

            <Card className="shadow-none">
                <CardHeader>
                    <CardTitle className="text-base">What it knows</CardTitle>
                    <CardDescription>
                        The documents and pages the bot answers from. Adding one that is
                        already here replaces it.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    {!data.knowledge ? (
                        <p className="text-sm text-muted-foreground">
                            This chatbot has no knowledge base: its AI Agent has no Vector Store
                            (Search Documents) on the Tools port. Add one in the editor.
                        </p>
                    ) : (
                        <>
                            {data.knowledge.sources.length === 0 ? (
                                <p className="text-sm text-muted-foreground">
                                    Nothing yet: the bot will say it does not know. Add a document
                                    or a page below.
                                </p>
                            ) : (
                                <ul className="divide-y text-sm">
                                    {data.knowledge.sources.map((source) => (
                                        <li key={source.id} className="flex items-center justify-between gap-4 py-2">
                                            <span className="min-w-0">
                                                <span className="block break-all">{source.name}</span>
                                                <span className="text-xs text-muted-foreground">
                                                    {source.kind === "url" ? "Web page" : "Document"},{" "}
                                                    {source.chunks} part{source.chunks === 1 ? "" : "s"}
                                                </span>
                                            </span>
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                disabled={removeSource.isPending || sources.busy}
                                                onClick={() => removeSource.mutate({ id, sourceId: source.id })}
                                            >
                                                Remove
                                            </Button>
                                        </li>
                                    ))}
                                </ul>
                            )}

                            <div className="space-y-1.5">
                                <Label htmlFor="chatbot-add-files">Add documents</Label>
                                <Input
                                    id="chatbot-add-files"
                                    ref={fileInput}
                                    type="file"
                                    multiple
                                    accept={CHATBOT_FILE_ACCEPT}
                                    disabled={sources.busy}
                                    onChange={(event) => {
                                        const files = [...(event.target.files ?? [])];
                                        if (files.length > 0) addSources(files, []);
                                    }}
                                />
                                <p className="text-xs text-muted-foreground">
                                    PDF, Word (.docx), .txt, .md or .csv, up to{" "}
                                    {Math.round(data.limits.maxFileBytes / 1024 / 1024)} MB each. Up
                                    to {data.limits.maxSources} documents and pages in all.
                                </p>
                            </div>

                            <div className="space-y-1.5">
                                <Label htmlFor="chatbot-add-urls">Add website pages</Label>
                                <Textarea
                                    id="chatbot-add-urls"
                                    rows={2}
                                    value={urlText}
                                    onChange={(event) => setUrlText(event.target.value)}
                                    placeholder="https://example.com/faq"
                                    className="font-mono text-sm"
                                    disabled={sources.busy}
                                />
                                {invalidUrls.length > 0 && (
                                    <p className="text-xs text-destructive">
                                        Not a web address: {invalidUrls.join(", ")}
                                    </p>
                                )}
                                <div className="flex items-center justify-between gap-3">
                                    <p className="text-xs text-muted-foreground">
                                        One address per line; each is one page. Add it again to
                                        read the page afresh.
                                    </p>
                                    <Button
                                        size="sm"
                                        disabled={sources.busy || urls.length === 0 || invalidUrls.length > 0}
                                        onClick={() => addSources([], urls)}
                                    >
                                        {sources.busy ? "Reading..." : "Add pages"}
                                    </Button>
                                </div>
                            </div>

                            <SourceProgressList items={sources.progress} />
                        </>
                    )}
                </CardContent>
            </Card>
        </div>
    );
};
