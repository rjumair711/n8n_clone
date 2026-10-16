"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
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
import { authClient } from "@/lib/auth-client";
import {
    SECRET_STORE_LABELS,
    SECRET_STORE_TYPES,
    formatSecretRef,
    isSecretStoreType,
    type SecretStoreType,
} from "@/lib/secret-refs";
import {
    buildSsoRegistration,
    getSsoDnsRecord,
    getSsoUrls,
    type SsoForm,
} from "@/lib/sso-config";
import { useTRPC } from "@/trpc/client";
import { useInvalidateUsage } from "@/features/subscription/hook/use-current-plan";
import {
    ENVIRONMENT_LABELS,
    WORKSPACE_ENVIRONMENTS,
    isWorkspaceEnvironment,
    type WorkspaceEnvironment,
} from "../lib/git-settings";

const onError = (error: { message: string }) => {
    toast.error(error.message);
};

const PlanNote = ({ plan }: { plan: string | null }) =>
    plan ? (
        <p className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">
            This needs the {plan} plan (the plan of the workspace&apos;s owner).
        </p>
    ) : null;

const Field = ({
    id,
    label,
    value,
    onChange,
    placeholder,
    type,
}: {
    id: string;
    label: string;
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
    type?: string;
}) => (
    <div className="space-y-1.5">
        <Label htmlFor={id}>{label}</Label>
        <Input
            id={id}
            type={type}
            value={value}
            onChange={(event) => onChange(event.target.value)}
            placeholder={placeholder}
            autoComplete="off"
        />
    </div>
);

// =========================================================================
// GIT SYNC
// =========================================================================
/**
 * Settings: the repository this workspace's workflows are pushed to and
 * pulled from, and whether the workspace is development or production.
 */
export const GitSyncCard = () => {
    const trpc = useTRPC();
    const queryClient = useQueryClient();
    const invalidateUsage = useInvalidateUsage();
    const query = trpc.enterprise.getGit.queryOptions();
    const { data } = useQuery(query);

    const [repo, setRepo] = useState("");
    const [branch, setBranch] = useState("main");
    const [folder, setFolder] = useState("workflows");
    const [credentialId, setCredentialId] = useState("");
    const [environment, setEnvironment] = useState<WorkspaceEnvironment>("development");
    const [report, setReport] = useState<string[]>([]);

    useEffect(() => {
        if (!data) return;

        setRepo(data.settings?.repo ?? "");
        setBranch(data.settings?.branch ?? "main");
        setFolder(data.settings?.folder ?? "workflows");
        setCredentialId(data.settings?.credentialId ?? data.credentials[0]?.id ?? "");
        setEnvironment(isWorkspaceEnvironment(data.environment) ? data.environment : "development");
    }, [data]);

    // Workflows changed: every list of them is stale
    const refresh = () => queryClient.invalidateQueries();

    const save = useMutation(
        trpc.enterprise.saveGit.mutationOptions({
            onSuccess: () => {
                toast.success("Git sync saved");
                refresh();
            },
            onError,
        })
    );
    const remove = useMutation(
        trpc.enterprise.removeGit.mutationOptions({
            onSuccess: () => {
                toast.success("Git sync removed");
                setReport([]);
                refresh();
            },
            onError,
        })
    );
    const push = useMutation(
        trpc.enterprise.pushGit.mutationOptions({
            onSuccess: (result) => {
                toast.success(
                    result.changed
                        ? `Pushed ${result.files} workflows (commit ${result.commit.slice(0, 7)})`
                        : "Nothing to push: the branch already has these workflows"
                );
                setReport(result.removed > 0 ? [`Removed ${result.removed} files of workflows that are gone`] : []);
                refresh();
            },
            onError,
        })
    );
    const pull = useMutation(
        trpc.enterprise.pullGit.mutationOptions({
            onSuccess: (result) => {
                toast.success(`Pulled: ${result.created} new, ${result.updated} updated`);
                invalidateUsage();
                setReport([
                    ...result.skipped.map((line) => `Not applied: ${line}`),
                    ...result.warnings,
                    ...(result.notInRepository.length > 0
                        ? [`Not in the repository (left as they are): ${result.notInRepository.join(", ")}`]
                        : []),
                ]);
                refresh();
            },
            onError,
        })
    );

    if (!data) return null;

    const busy = save.isPending || remove.isPending || push.isPending || pull.isPending;
    const isProduction = data.environment === "production";

    return (
        <Card>
            <CardHeader>
                <CardTitle>Environments and Git sync</CardTitle>
                <CardDescription>
                    Keep this workspace&apos;s workflows as JSON files in a GitHub repository. Build
                    in a <strong>development</strong> workspace and push; a{" "}
                    <strong>production</strong> workspace pulls, and its workflows cannot be
                    edited by hand. Credentials are never written to the repository: a workflow
                    names the credential it uses, and the workspace that pulls has to have one
                    of the same type and name.
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                <PlanNote plan={data.requiredPlan} />

                <div className="grid gap-3 sm:grid-cols-2">
                    <Field id="git-repo" label="Repository" value={repo} onChange={setRepo} placeholder="owner/name" />
                    <Field id="git-branch" label="Branch" value={branch} onChange={setBranch} placeholder="main" />
                    <Field id="git-folder" label="Folder" value={folder} onChange={setFolder} placeholder="workflows" />
                    <div className="space-y-1.5">
                        <Label>GitHub credential</Label>
                        <Select value={credentialId} onValueChange={setCredentialId}>
                            <SelectTrigger className="w-full">
                                <SelectValue placeholder={data.credentials.length === 0 ? "Add a GitHub credential first" : "Select a credential"} />
                            </SelectTrigger>
                            <SelectContent>
                                {data.credentials.map((credential) => (
                                    <SelectItem key={credential.id} value={credential.id}>
                                        {credential.name}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="space-y-1.5">
                        <Label>This workspace is</Label>
                        <Select
                            value={environment}
                            onValueChange={(value) => isWorkspaceEnvironment(value) && setEnvironment(value)}
                        >
                            <SelectTrigger className="w-full">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                {WORKSPACE_ENVIRONMENTS.map((value) => (
                                    <SelectItem key={value} value={value}>
                                        {ENVIRONMENT_LABELS[value]}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                </div>
                <p className="text-xs text-muted-foreground">
                    The credential&apos;s token needs access to the repository, with &quot;Contents:
                    read and write&quot; to push. The branch has to exist. A workflow with a
                    secret typed into a node (an API key in a header) is not pushed.
                </p>

                <div className="flex flex-wrap gap-2">
                    <Button
                        disabled={busy || !repo.trim() || !branch.trim() || !credentialId}
                        onClick={() => save.mutate({ repo, branch, folder, credentialId, environment })}
                    >
                        Save
                    </Button>
                    {data.settings && (
                        <>
                            <Button
                                variant="outline"
                                disabled={busy || isProduction}
                                title={isProduction ? "A production workspace only pulls" : undefined}
                                onClick={() => push.mutate({ message: "" })}
                            >
                                {push.isPending ? "Pushing..." : "Push to Git"}
                            </Button>
                            <Button
                                variant="outline"
                                disabled={busy}
                                onClick={() => {
                                    if (window.confirm("Pull from Git? Workflows that are in the repository are replaced by what the repository has.")) {
                                        pull.mutate();
                                    }
                                }}
                            >
                                {pull.isPending ? "Pulling..." : "Pull from Git"}
                            </Button>
                            <Button variant="ghost" disabled={busy} onClick={() => remove.mutate()}>
                                Remove
                            </Button>
                        </>
                    )}
                </div>

                {data.settings?.lastSyncAt && (
                    <p className="text-xs text-muted-foreground">
                        Last {data.settings.lastSyncAction}: {new Date(data.settings.lastSyncAt).toLocaleString()}
                        {data.settings.lastCommit ? `, commit ${data.settings.lastCommit.slice(0, 7)}` : ""}
                    </p>
                )}
                {report.length > 0 && (
                    <ul className="list-disc space-y-0.5 rounded-md border p-3 pl-7 text-xs">
                        {report.map((line) => (
                            <li key={line}>{line}</li>
                        ))}
                    </ul>
                )}
            </CardContent>
        </Card>
    );
};

// =========================================================================
// EXTERNAL SECRETS
// =========================================================================
const EMPTY_STORE = { url: "", token: "", mount: "secret", kvVersion: "2", namespace: "", region: "", accessKeyId: "", secretAccessKey: "" };

/**
 * Settings: the HashiCorp Vault or AWS Secrets Manager that credentials of
 * this workspace can read their values from.
 */
export const SecretStoresCard = () => {
    const trpc = useTRPC();
    const queryClient = useQueryClient();
    const query = trpc.enterprise.getSecretStores.queryOptions();
    const { data } = useQuery(query);

    const [name, setName] = useState("vault");
    const [type, setType] = useState<SecretStoreType>("vault");
    const [config, setConfig] = useState(EMPTY_STORE);
    const [testing, setTesting] = useState<{ id: string; secret: string }>({ id: "", secret: "" });
    const [testResult, setTestResult] = useState("");

    const set = (key: keyof typeof EMPTY_STORE) => (value: string) =>
        setConfig((current) => ({ ...current, [key]: value }));

    const refresh = () => queryClient.invalidateQueries(query);

    const save = useMutation(
        trpc.enterprise.saveSecretStore.mutationOptions({
            onSuccess: (saved) => {
                toast.success(`Secret store "${saved.name}" saved`);
                // What reaches the store does not stay on the page
                setConfig(EMPTY_STORE);
                refresh();
            },
            onError,
        })
    );
    const remove = useMutation(
        trpc.enterprise.removeSecretStore.mutationOptions({ onSuccess: refresh, onError })
    );
    const test = useMutation(
        trpc.enterprise.testSecret.mutationOptions({
            onSuccess: (result) =>
                setTestResult(
                    result.found
                        ? result.fields.length > 0
                            ? `Found. Fields: ${result.fields.join(", ")}`
                            : "Found: one text, without fields."
                        : result.error
                ),
            onError,
        })
    );

    if (!data) return null;

    const existing = data.stores.find((store) => store.name === name.trim().toLowerCase());

    return (
        <Card>
            <CardHeader>
                <CardTitle>External secrets</CardTitle>
                <CardDescription>
                    Let credentials read their value from your HashiCorp Vault or AWS Secrets
                    Manager instead of storing it here. In a credential&apos;s field write{" "}
                    <code>{formatSecretRef("vault", "team/openai", "api_key")}</code>: the store&apos;s
                    name, the secret&apos;s path or name, and after <code>#</code> the field. The
                    value is read when the credential is used, kept in memory for a few minutes,
                    and never saved.
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                <PlanNote plan={data.requiredPlan} />

                {data.stores.length > 0 && (
                    <ul className="divide-y rounded-md border">
                        {data.stores.map((store) => (
                            <li key={store.id} className="space-y-2 p-3 text-sm">
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                    <span>
                                        <code>{store.name}</code>{" "}
                                        <Badge variant="secondary">
                                            {isSecretStoreType(store.type) ? SECRET_STORE_LABELS[store.type] : store.type}
                                        </Badge>
                                    </span>
                                    <Button
                                        size="sm"
                                        variant="outline"
                                        disabled={remove.isPending}
                                        onClick={() => {
                                            if (window.confirm(`Delete the secret store "${store.name}"? Credentials that read from it stop working.`)) {
                                                remove.mutate({ id: store.id });
                                            }
                                        }}
                                    >
                                        Delete
                                    </Button>
                                </div>
                                <div className="flex flex-wrap gap-2">
                                    <Input
                                        className="min-w-48 flex-1"
                                        placeholder="A secret to try: team/openai"
                                        value={testing.id === store.id ? testing.secret : ""}
                                        onChange={(event) => {
                                            setTesting({ id: store.id, secret: event.target.value });
                                            setTestResult("");
                                        }}
                                    />
                                    <Button
                                        size="sm"
                                        variant="outline"
                                        disabled={test.isPending || testing.id !== store.id || !testing.secret.trim()}
                                        onClick={() => test.mutate(testing)}
                                    >
                                        Test
                                    </Button>
                                </div>
                                {testing.id === store.id && testResult && (
                                    <p className="text-xs text-muted-foreground">{testResult}</p>
                                )}
                            </li>
                        ))}
                    </ul>
                )}

                <div className="grid gap-3 sm:grid-cols-2">
                    <Field id="store-name" label="Name (used in references)" value={name} onChange={setName} placeholder="vault" />
                    <div className="space-y-1.5">
                        <Label>Kind</Label>
                        <Select value={type} onValueChange={(value) => isSecretStoreType(value) && setType(value)}>
                            <SelectTrigger className="w-full">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                {SECRET_STORE_TYPES.map((value) => (
                                    <SelectItem key={value} value={value}>
                                        {SECRET_STORE_LABELS[value]}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                    {type === "vault" ? (
                        <>
                            <Field id="vault-url" label="Vault address" value={config.url} onChange={set("url")} placeholder="https://vault.example.com" />
                            <Field id="vault-token" label="Token" type="password" value={config.token} onChange={set("token")} />
                            <Field id="vault-mount" label="KV mount" value={config.mount} onChange={set("mount")} placeholder="secret" />
                            <div className="space-y-1.5">
                                <Label>KV version</Label>
                                <Select value={config.kvVersion} onValueChange={set("kvVersion")}>
                                    <SelectTrigger className="w-full">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="2">2</SelectItem>
                                        <SelectItem value="1">1</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                            <Field id="vault-namespace" label="Namespace (optional)" value={config.namespace} onChange={set("namespace")} />
                        </>
                    ) : (
                        <>
                            <Field id="aws-region" label="Region" value={config.region} onChange={set("region")} placeholder="eu-west-1" />
                            <Field id="aws-key" label="Access key ID" value={config.accessKeyId} onChange={set("accessKeyId")} />
                            <Field id="aws-secret" label="Secret access key" type="password" value={config.secretAccessKey} onChange={set("secretAccessKey")} />
                        </>
                    )}
                </div>
                <p className="text-xs text-muted-foreground">
                    Use a token or key that can only read the secrets these credentials need (for
                    AWS: <code>secretsmanager:GetSecretValue</code>). It is stored encrypted and
                    never shown again. Saving a name that exists replaces that store&apos;s settings.
                </p>
                <Button
                    disabled={save.isPending || !name.trim()}
                    onClick={() =>
                        save.mutate({
                            id: existing?.id,
                            name,
                            type,
                            config:
                                type === "vault"
                                    ? { url: config.url, token: config.token, mount: config.mount, kvVersion: config.kvVersion, namespace: config.namespace }
                                    : { region: config.region, accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
                        })
                    }
                >
                    {existing ? "Replace store" : "Add store"}
                </Button>
            </CardContent>
        </Card>
    );
};

// =========================================================================
// SINGLE SIGN-ON
// =========================================================================
type Provider = { providerId: string; domain: string; issuer: string; type?: string; domainVerified?: boolean };

const EMPTY_SSO: SsoForm = {
    providerId: "",
    domain: "",
    issuer: "",
    clientId: "",
    clientSecret: "",
};

/**
 * Settings: the identity providers the account registered for single
 * sign-on. A provider is the account's own, whatever workspace is open.
 */
export const SsoCard = () => {
    const trpc = useTRPC();
    const { data } = useQuery(trpc.enterprise.getSso.queryOptions());

    const [providers, setProviders] = useState<Provider[] | null>(null);
    const [form, setForm] = useState<SsoForm>(EMPTY_SSO);
    const [busy, setBusy] = useState(false);
    // The DNS record of a provider that was just registered or asked about
    const [record, setRecord] = useState<{ providerId: string; host: string; value: string } | null>(null);

    const set = (key: keyof SsoForm) => (value: string) =>
        setForm((current) => ({ ...current, [key]: value }));

    const load = async () => {
        const result = await authClient.sso.providers();

        setProviders(
            result.error
                ? []
                : ((result.data as { providers?: Provider[] } | null)?.providers ?? [])
        );
    };

    useEffect(() => {
        void load();
    }, []);

    if (!data || providers === null) return null;

    const appUrl = data.appUrl;

    // Better Auth's own client: the calls answer { data, error }
    const run = async <T,>(call: () => Promise<{ data: T | null; error: { message?: string } | null }>) => {
        setBusy(true);
        try {
            const result = await call();

            if (result.error) {
                toast.error(result.error.message || "That did not work");
                return null;
            }

            return result.data ?? ({} as T);
        } finally {
            setBusy(false);
        }
    };

    const register = async () => {
        const registration = buildSsoRegistration(form, appUrl);

        if ("error" in registration) {
            toast.error(registration.error);
            return;
        }

        const result = await run(() => authClient.sso.register(registration.body));
        if (!result) return;

        const token = (result as { domainVerificationToken?: string }).domainVerificationToken;

        if (token) {
            setRecord({
                providerId: registration.body.providerId,
                ...getSsoDnsRecord(registration.body.providerId, registration.body.domain, token),
            });
        }

        toast.success("Provider registered. Verify its domain to turn it on.");
        setForm(EMPTY_SSO);
        await load();
    };

    const showRecord = async (provider: Provider) => {
        const result = await run(() =>
            authClient.sso.requestDomainVerification({ providerId: provider.providerId })
        );
        const token = (result as { domainVerificationToken?: string } | null)?.domainVerificationToken;

        if (token) {
            setRecord({ providerId: provider.providerId, ...getSsoDnsRecord(provider.providerId, provider.domain, token) });
        }
    };

    const verify = async (provider: Provider) => {
        const result = await run(() => authClient.sso.verifyDomain({ providerId: provider.providerId }));
        if (!result) return;

        toast.success(`${provider.domain} is verified. People with that address can now sign in with SSO.`);
        setRecord(null);
        await load();
    };

    const remove = async (provider: Provider) => {
        if (!window.confirm(`Delete the provider "${provider.providerId}"? People of ${provider.domain} can no longer sign in through it.`)) {
            return;
        }

        const result = await run(() => authClient.sso.deleteProvider({ providerId: provider.providerId }));
        if (!result) return;

        await load();
    };

    const urls = getSsoUrls(appUrl, form.providerId.trim().toLowerCase() || "<id>");

    return (
        <Card>
            <CardHeader>
                <CardTitle>Single sign-on (SSO)</CardTitle>
                <CardDescription>
                    Let people of your company sign in through its identity provider (Okta,
                    Microsoft Entra ID, Google Workspace, Keycloak...) with OpenID Connect
                    (OIDC). SAML is not available yet. They press &quot;Sign in with SSO&quot; on the login page after typing
                    their work email. Someone whose account is made that way joins your workspace
                    as a Viewer.
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                {providers.length > 0 && (
                    <ul className="divide-y rounded-md border">
                        {providers.map((provider) => (
                            <li key={provider.providerId} className="flex flex-wrap items-center justify-between gap-2 p-3 text-sm">
                                <span>
                                    <code>{provider.providerId}</code> for {provider.domain}{" "}
                                    <Badge variant={provider.domainVerified ? "secondary" : "destructive"}>
                                        {provider.domainVerified ? "Domain verified" : "Domain not verified: off"}
                                    </Badge>
                                </span>
                                <span className="flex gap-2">
                                    {!provider.domainVerified && (
                                        <>
                                            <Button size="sm" variant="outline" disabled={busy} onClick={() => showRecord(provider)}>
                                                DNS record
                                            </Button>
                                            <Button size="sm" disabled={busy} onClick={() => verify(provider)}>
                                                Verify domain
                                            </Button>
                                        </>
                                    )}
                                    <Button size="sm" variant="outline" disabled={busy} onClick={() => remove(provider)}>
                                        Delete
                                    </Button>
                                </span>
                            </li>
                        ))}
                    </ul>
                )}

                {record && (
                    <div className="space-y-1 rounded-md border p-3 text-sm">
                        <p className="font-medium">Add this DNS record to prove the domain is yours</p>
                        <p>Type: <code>TXT</code></p>
                        <p className="break-all">Name: <code>{record.host}</code></p>
                        <p className="break-all">Value: <code>{record.value}</code></p>
                        <p className="text-xs text-muted-foreground">
                            Then press &quot;Verify domain&quot; on <code>{record.providerId}</code>. DNS
                            changes can take a while to be seen. The record is valid for a week.
                        </p>
                    </div>
                )}

                {data.limit === 0 ? (
                    <p className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">
                        Registering an identity provider needs the Pro plan on your own account.
                    </p>
                ) : providers.length >= data.limit ? (
                    <p className="text-sm text-muted-foreground">
                        Your account can register {data.limit} providers. Delete one to add another.
                    </p>
                ) : (
                    <>
                        <div className="grid gap-3 sm:grid-cols-2">
                            <Field id="sso-id" label="Provider id" value={form.providerId} onChange={set("providerId")} placeholder="acme-okta" />
                            <Field id="sso-domain" label="Email domain" value={form.domain} onChange={set("domain")} placeholder="acme.com" />
                            <Field id="sso-issuer" label="Issuer URL" value={form.issuer} onChange={set("issuer")} placeholder="https://acme.okta.com" />
                            <Field id="sso-client-id" label="Client ID" value={form.clientId} onChange={set("clientId")} />
                            <Field id="sso-client-secret" label="Client secret" type="password" value={form.clientSecret} onChange={set("clientSecret")} />
                        </div>
                        <div className="space-y-1 text-xs text-muted-foreground">
                            <p className="break-all">
                                Give this redirect URI to the identity provider: <code>{urls.oidcRedirect}</code>
                            </p>
                            <p>
                                The provider&apos;s address also has to be listed in this app&apos;s{" "}
                                <code>TRUSTED_ORIGINS</code> setting, by whoever runs it, before it can be
                                registered.
                            </p>
                        </div>
                        <Button disabled={busy} onClick={register}>
                            Register provider
                        </Button>
                    </>
                )}
            </CardContent>
        </Card>
    );
};
