"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
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
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { INCLUDED_CREDENTIAL_ID } from "@/config/ai-credits";
import { CHAT_MODEL_PROVIDERS } from "@/features/executions/lib/chat-model-providers";
import {
    getBuilderDefaultModel,
    isBuilderCredentialType,
} from "@/features/ai-builder/lib/builder-models";
import { generateSecret } from "@/lib/generate-secret";
import { useTRPC } from "@/trpc/client";
import {
    CHATBOT_EMBEDDING_PROVIDERS,
    CHATBOT_FILE_ACCEPT,
    CHATBOT_MAX_FILE_BYTES,
    CHATBOT_MAX_INSTRUCTIONS_LENGTH,
    CHATBOT_MAX_NAME_LENGTH,
    CHATBOT_MAX_SOURCES,
    parseUrlList,
} from "../lib/chatbot";
import { SourceProgressList, getFileProblem, useAddSources } from "./use-add-sources";
import { useInvalidateUsage } from "@/features/subscription/hook/use-current-plan";

/**
 * "Create a chatbot": documents and web pages, a model, and one button. It
 * makes an ordinary workflow, adds the documents to its knowledge base and
 * opens the chatbot's page with the widget, the share link and WhatsApp.
 */
export const CreateChatbot = () => {
    const trpc = useTRPC();
    const router = useRouter();
    const queryClient = useQueryClient();

    const { data: options } = useQuery(trpc.chatbots.getOptions.queryOptions());
    const { data: modelCredentials, isLoading: modelsLoading } = useQuery(
        trpc.aiBuilder.getModelCredentials.queryOptions()
    );
    const { data: chatbots } = useQuery(trpc.chatbots.list.queryOptions());

    const invalidateUsage = useInvalidateUsage();
    const create = useMutation(
        trpc.chatbots.create.mutationOptions({ onSuccess: () => invalidateUsage() })
    );
    const sources = useAddSources();

    const [name, setName] = useState("");
    const [instructions, setInstructions] = useState("");
    const [welcomeMessage, setWelcomeMessage] = useState("");
    const [files, setFiles] = useState<File[]>([]);
    const [urlText, setUrlText] = useState("");
    const [modelCredentialId, setModelCredentialId] = useState("");
    const [model, setModel] = useState("");
    const [provider, setProvider] = useState("openrouter");
    const [baseUrl, setBaseUrl] = useState("");
    const [embeddingCredentialId, setEmbeddingCredentialId] = useState("");
    const [withWhatsapp, setWithWhatsapp] = useState(false);
    const [whatsappCredentialId, setWhatsappCredentialId] = useState("");
    const [appSecret, setAppSecret] = useState("");
    const [verifyToken, setVerifyToken] = useState(() => generateSecret().slice(0, 24));
    // Set once the workflow exists: the documents are added next
    const [createdId, setCreatedId] = useState("");
    const [failed, setFailed] = useState(0);

    const modelCredential =
        modelCredentials?.find((item) => item.id === modelCredentialId) ?? modelCredentials?.[0];
    const isIncluded = modelCredential?.type === INCLUDED_CREDENTIAL_ID;
    const isCompatible = modelCredential?.type === "OPENAI_COMPATIBLE";
    const providerPreset = CHAT_MODEL_PROVIDERS.find((item) => item.value === provider);
    // "Custom base URL" has no address of its own
    const needsBaseUrl = isCompatible && !providerPreset?.baseUrl;
    const defaultModel = isIncluded
        ? (modelCredential?.models[0] ?? "")
        : modelCredential && isBuilderCredentialType(modelCredential.type)
            ? getBuilderDefaultModel(modelCredential.type, isCompatible ? provider : undefined)
            : "";

    // The model's own credential also embeds, when it is OpenAI or Gemini
    const embeddingCredentials = options?.embeddingCredentials ?? [];
    const embeddingCredential =
        embeddingCredentials.find((item) => item.id === embeddingCredentialId) ??
        embeddingCredentials.find((item) => item.id === modelCredential?.id) ??
        embeddingCredentials[0];

    const whatsappCredentials = options?.whatsappCredentials ?? [];
    const whatsappCredential =
        whatsappCredentials.find((item) => item.id === whatsappCredentialId) ??
        whatsappCredentials[0];

    const { urls, invalid: invalidUrls } = parseUrlList(urlText);
    const fileProblems = files.flatMap((file) => {
        const problem = getFileProblem(file);

        return problem ? [`${file.name}: ${problem}`] : [];
    });
    const tooMany = files.length + urls.length > CHATBOT_MAX_SOURCES;

    const blocked = options?.agentPlan
        ? `A chatbot uses an AI Agent, which requires the ${options.agentPlan} plan.`
        : options?.workflowLimitReached
            ? `Workflow limit reached: your plan allows up to ${options.workflowLimit} workflows.`
            : null;

    const whatsappReady =
        !withWhatsapp || (!!whatsappCredential && !!appSecret.trim() && verifyToken.trim().length >= 8);

    const ready =
        !blocked &&
        !!name.trim() &&
        !!modelCredential &&
        (!!model.trim() || !!defaultModel) &&
        (!needsBaseUrl || !!baseUrl.trim()) &&
        !!embeddingCredential &&
        invalidUrls.length === 0 &&
        fileProblems.length === 0 &&
        !tooMany &&
        whatsappReady;

    const working = create.isPending || sources.busy;

    const handleCreate = async () => {
        if (!modelCredential || !embeddingCredential) return;

        let id: string;

        try {
            const created = await create.mutateAsync({
                name: name.trim(),
                instructions: instructions.trim() || undefined,
                welcomeMessage: welcomeMessage.trim() || undefined,
                model: {
                    credentialId: modelCredential.id,
                    model: model.trim() || undefined,
                    ...(isCompatible ? { provider, baseUrl: baseUrl.trim() || undefined } : {}),
                },
                embeddingCredentialId: embeddingCredential.id,
                ...(withWhatsapp && whatsappCredential
                    ? {
                        whatsapp: {
                            credentialId: whatsappCredential.id,
                            appSecret: appSecret.trim(),
                            verifyToken: verifyToken.trim(),
                        },
                    }
                    : {}),
            });

            id = created.id;
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "The chatbot could not be created");
            return;
        }

        setCreatedId(id);
        queryClient.invalidateQueries(trpc.chatbots.list.queryOptions());
        queryClient.invalidateQueries(trpc.workflows.getMany.queryFilter());

        const failures = await sources.run(id, files, urls);
        setFailed(failures);

        // With a failure the list stays, so it can be read
        if (failures === 0) router.push(`/chatbots/${id}`);
    };

    return (
        <div className="mx-auto w-full max-w-3xl space-y-6 p-4 md:p-8">
            <Card className="shadow-none">
                <CardHeader>
                    <CardTitle>Create a chatbot</CardTitle>
                    <CardDescription>
                        Give it your documents or website pages and pick a model. You get a
                        chat widget for your website, a link to share and, if you like, a
                        WhatsApp connection. Behind it is an ordinary workflow (Chat Trigger,
                        AI Agent, Vector Store, Memory) that you can open and change in the
                        editor.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                    {blocked && (
                        <p className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm">
                            {blocked}{" "}
                            <Link href="/pricing" className="underline">
                                See the plans
                            </Link>
                            .
                        </p>
                    )}

                    <div className="space-y-1.5">
                        <Label htmlFor="chatbot-name">Name</Label>
                        <Input
                            id="chatbot-name"
                            value={name}
                            maxLength={CHATBOT_MAX_NAME_LENGTH}
                            onChange={(event) => setName(event.target.value)}
                            placeholder="Acme Support"
                            disabled={!!createdId}
                        />
                        <p className="text-xs text-muted-foreground">
                            Your business or product. It is the title of the chat and tells
                            the bot who it speaks for.
                        </p>
                    </div>

                    <div className="space-y-3 rounded-lg border p-3">
                        <div>
                            <p className="text-sm font-medium">1. What it knows</p>
                            <p className="text-xs text-muted-foreground">
                                The bot answers from these. Up to {CHATBOT_MAX_SOURCES} documents
                                and pages; you can add and remove them later.
                            </p>
                        </div>

                        <div className="space-y-1.5">
                            <Label htmlFor="chatbot-files">Documents</Label>
                            <Input
                                id="chatbot-files"
                                type="file"
                                multiple
                                accept={CHATBOT_FILE_ACCEPT}
                                disabled={!!createdId}
                                onChange={(event) => setFiles([...(event.target.files ?? [])])}
                            />
                            <p className="text-xs text-muted-foreground">
                                PDF, Word (.docx), .txt, .md or .csv, up to{" "}
                                {Math.round(CHATBOT_MAX_FILE_BYTES / 1024 / 1024)} MB each. A scanned
                                PDF has no text to read.
                            </p>
                            {fileProblems.map((problem) => (
                                <p key={problem} className="text-xs text-destructive">
                                    {problem}
                                </p>
                            ))}
                        </div>

                        <div className="space-y-1.5">
                            <Label htmlFor="chatbot-urls">Website pages</Label>
                            <Textarea
                                id="chatbot-urls"
                                rows={3}
                                value={urlText}
                                onChange={(event) => setUrlText(event.target.value)}
                                placeholder={"https://example.com/pricing\nhttps://example.com/faq"}
                                className="font-mono text-sm"
                                disabled={!!createdId}
                            />
                            <p className="text-xs text-muted-foreground">
                                One address per line. Each address is one page: links on it are
                                not followed.
                            </p>
                            {invalidUrls.length > 0 && (
                                <p className="text-xs text-destructive">
                                    Not a web address: {invalidUrls.join(", ")}
                                </p>
                            )}
                            {tooMany && (
                                <p className="text-xs text-destructive">
                                    That is more than {CHATBOT_MAX_SOURCES} documents and pages.
                                </p>
                            )}
                        </div>
                    </div>

                    <div className="space-y-3 rounded-lg border p-3">
                        <p className="text-sm font-medium">2. Model</p>

                        {!modelsLoading && (modelCredentials?.length ?? 0) === 0 ? (
                            <p className="text-sm text-muted-foreground">
                                The bot answers with one of your model credentials (OpenAI,
                                Anthropic, Gemini, DeepSeek, Kimi, Qwen or any OpenAI-compatible
                                provider).{" "}
                                <Link href="/credentials/new" className="underline">
                                    Add a credential
                                </Link>{" "}
                                first.
                            </p>
                        ) : (
                            <div className="grid gap-3 sm:grid-cols-2">
                                <div className="space-y-1.5">
                                    <Label>Answers with</Label>
                                    <Select
                                        value={modelCredential?.id ?? ""}
                                        onValueChange={(id) => {
                                            setModelCredentialId(id);
                                            setModel("");
                                        }}
                                        disabled={modelsLoading || !!createdId}
                                    >
                                        <SelectTrigger className="w-full">
                                            <SelectValue placeholder={modelsLoading ? "Loading..." : "Select a credential"} />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {modelCredentials?.map((item) => (
                                                <SelectItem key={item.id} value={item.id}>
                                                    {item.name}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div className="space-y-1.5">
                                    <Label htmlFor="chatbot-model">Model</Label>
                                    <Input
                                        id="chatbot-model"
                                        value={model}
                                        onChange={(event) => setModel(event.target.value)}
                                        placeholder={defaultModel || "model-name"}
                                        disabled={!!createdId}
                                    />
                                </div>
                                {isCompatible && (
                                    <div className="space-y-1.5">
                                        <Label>Provider</Label>
                                        <Select
                                            value={provider}
                                            onValueChange={(value) => {
                                                setProvider(value);
                                                setModel("");
                                            }}
                                            disabled={!!createdId}
                                        >
                                            <SelectTrigger className="w-full">
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {CHAT_MODEL_PROVIDERS.map((item) => (
                                                    <SelectItem key={item.value} value={item.value}>
                                                        {item.label}
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </div>
                                )}
                                {isCompatible && (
                                    <div className="space-y-1.5">
                                        <Label htmlFor="chatbot-base-url">Base URL</Label>
                                        <Input
                                            id="chatbot-base-url"
                                            value={baseUrl}
                                            onChange={(event) => setBaseUrl(event.target.value)}
                                            placeholder={providerPreset?.baseUrl || "https://api.example.com/v1"}
                                            disabled={!!createdId}
                                        />
                                    </div>
                                )}
                                <p className="text-xs text-muted-foreground sm:col-span-2">
                                    {isIncluded
                                        ? `Paid with your AI credits (see Billing). Included models: ${modelCredential?.models.join(", ")}.`
                                        : defaultModel
                                            ? `Leave Model empty for ${defaultModel}.`
                                            : "Type the model's ID as the provider lists it."}
                                </p>
                            </div>
                        )}

                        <div className="space-y-1.5">
                            <Label>Reads your documents with</Label>
                            {embeddingCredentials.length === 0 ? (
                                <p className="text-sm text-muted-foreground">
                                    Finding the right passage needs an embedding model: an OpenAI
                                    or a Gemini credential.{" "}
                                    <Link href="/credentials/new" className="underline">
                                        Add one
                                    </Link>{" "}
                                    first (a Gemini key is free to get).
                                </p>
                            ) : (
                                <>
                                    <Select
                                        value={embeddingCredential?.id ?? ""}
                                        onValueChange={setEmbeddingCredentialId}
                                        disabled={!!createdId}
                                    >
                                        <SelectTrigger className="w-full">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {embeddingCredentials.map((item) => (
                                                <SelectItem key={item.id} value={item.id}>
                                                    {item.name} (
                                                    {CHATBOT_EMBEDDING_PROVIDERS[item.type] === "gemini"
                                                        ? "Gemini"
                                                        : "OpenAI"}
                                                    )
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                    <p className="text-xs text-muted-foreground">
                                        An OpenAI or Gemini credential. It turns your documents,
                                        and each question, into numbers that can be compared (an
                                        embedding model). This is a separate, small cost on that
                                        credential.
                                    </p>
                                </>
                            )}
                        </div>
                    </div>

                    <div className="space-y-3 rounded-lg border p-3">
                        <p className="text-sm font-medium">3. How it behaves (optional)</p>
                        <div className="space-y-1.5">
                            <Label htmlFor="chatbot-welcome">Welcome message</Label>
                            <Input
                                id="chatbot-welcome"
                                value={welcomeMessage}
                                maxLength={1000}
                                onChange={(event) => setWelcomeMessage(event.target.value)}
                                placeholder="Hi! How can I help you today?"
                                dir="auto"
                                disabled={!!createdId}
                            />
                        </div>
                        <div className="space-y-1.5">
                            <Label htmlFor="chatbot-instructions">Extra instructions</Label>
                            <Textarea
                                id="chatbot-instructions"
                                rows={3}
                                value={instructions}
                                maxLength={CHATBOT_MAX_INSTRUCTIONS_LENGTH}
                                onChange={(event) => setInstructions(event.target.value)}
                                placeholder="Our support hours are 9 to 5, Monday to Friday. For refunds, ask for the order number."
                                dir="auto"
                                disabled={!!createdId}
                            />
                            <p className="text-xs text-muted-foreground">
                                The bot is already told to answer only from your documents and
                                to say so when it does not know.
                            </p>
                        </div>
                    </div>

                    <div className="space-y-3 rounded-lg border p-3">
                        <div className="flex items-center justify-between gap-4">
                            <div>
                                <p className="text-sm font-medium">4. WhatsApp (optional)</p>
                                <p className="text-xs text-muted-foreground">
                                    The same bot answers messages sent to your WhatsApp Business
                                    number. You can also connect it later.
                                </p>
                            </div>
                            <Switch
                                checked={withWhatsapp}
                                onCheckedChange={setWithWhatsapp}
                                disabled={!!options?.whatsappPlan || !!createdId}
                            />
                        </div>

                        {options?.whatsappPlan && (
                            <p className="text-xs text-muted-foreground">
                                WhatsApp requires the {options.whatsappPlan} plan.{" "}
                                <Link href="/pricing" className="underline">
                                    See the plans
                                </Link>
                                .
                            </p>
                        )}

                        {withWhatsapp && (
                            <WhatsappFields
                                credentials={whatsappCredentials}
                                credentialId={whatsappCredential?.id ?? ""}
                                onCredentialId={setWhatsappCredentialId}
                                appSecret={appSecret}
                                onAppSecret={setAppSecret}
                                verifyToken={verifyToken}
                                onVerifyToken={setVerifyToken}
                                disabled={!!createdId}
                            />
                        )}
                    </div>

                    {createdId ? (
                        <div className="space-y-3 rounded-lg border bg-muted/20 p-3">
                            <p className="text-sm font-medium">
                                {sources.busy
                                    ? "The chatbot is created. Reading your documents..."
                                    : failed > 0
                                        ? `The chatbot is created, but ${failed} of your documents could not be added.`
                                        : "The chatbot is created."}
                            </p>
                            <SourceProgressList items={sources.progress} />
                            {!sources.busy && (
                                <Button asChild>
                                    <Link href={`/chatbots/${createdId}`}>Open the chatbot</Link>
                                </Button>
                            )}
                        </div>
                    ) : (
                        <div className="flex flex-wrap items-center justify-between gap-3">
                            <p className="max-w-md text-xs text-muted-foreground">
                                The chatbot is switched on right away, so its widget and link
                                work. Nobody can reach it until you share them.
                            </p>
                            <Button onClick={handleCreate} disabled={!ready || working}>
                                {working ? "Creating..." : "Create chatbot"}
                            </Button>
                        </div>
                    )}
                </CardContent>
            </Card>

            {(chatbots?.length ?? 0) > 0 && (
                <Card className="shadow-none">
                    <CardHeader>
                        <CardTitle className="text-base">Your chatbots</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <ul className="divide-y text-sm">
                            {chatbots?.map((chatbot) => (
                                <li key={chatbot.id} className="flex items-center justify-between gap-4 py-2">
                                    <Link href={`/chatbots/${chatbot.id}`} className="font-medium hover:underline">
                                        {chatbot.name}
                                    </Link>
                                    <span className="text-xs text-muted-foreground">
                                        {chatbot.active ? "On" : "Off"}
                                    </span>
                                </li>
                            ))}
                        </ul>
                    </CardContent>
                </Card>
            )}
        </div>
    );
};

/**
 * What the WhatsApp side needs: the credential that sends the replies, and
 * the two values Meta checks incoming messages with.
 */
export const WhatsappFields = ({
    credentials,
    credentialId,
    onCredentialId,
    appSecret,
    onAppSecret,
    verifyToken,
    onVerifyToken,
    disabled,
}: {
    credentials: { id: string; name: string }[];
    credentialId: string;
    onCredentialId: (id: string) => void;
    appSecret: string;
    onAppSecret: (value: string) => void;
    verifyToken: string;
    onVerifyToken: (value: string) => void;
    disabled?: boolean;
}) =>
    credentials.length === 0 ? (
        <p className="text-sm text-muted-foreground">
            The replies are sent with a WhatsApp credential (the access token of your
            WhatsApp Business app).{" "}
            <Link href="/credentials/new" className="underline">
                Add one
            </Link>{" "}
            first.
        </p>
    ) : (
        <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5 sm:col-span-2">
                <Label>WhatsApp credential</Label>
                <Select value={credentialId} onValueChange={onCredentialId} disabled={disabled}>
                    <SelectTrigger className="w-full">
                        <SelectValue placeholder="Select a credential" />
                    </SelectTrigger>
                    <SelectContent>
                        {credentials.map((item) => (
                            <SelectItem key={item.id} value={item.id}>
                                {item.name}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>
            <div className="space-y-1.5">
                <Label htmlFor="chatbot-app-secret">App Secret</Label>
                <Input
                    id="chatbot-app-secret"
                    type="password"
                    autoComplete="off"
                    value={appSecret}
                    onChange={(event) => onAppSecret(event.target.value)}
                    placeholder="From Meta app > App settings > Basic"
                    disabled={disabled}
                />
                <p className="text-xs text-muted-foreground">
                    Checks that each message really comes from Meta.
                </p>
            </div>
            <div className="space-y-1.5">
                <Label htmlFor="chatbot-verify-token">Verify Token</Label>
                <Input
                    id="chatbot-verify-token"
                    value={verifyToken}
                    onChange={(event) => onVerifyToken(event.target.value)}
                    className="font-mono text-xs"
                    disabled={disabled}
                />
                <p className="text-xs text-muted-foreground">
                    Any text of 8 or more characters. You type the same into Meta.
                </p>
            </div>
        </div>
    );
