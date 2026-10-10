"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { QRCodeSVG } from "qrcode.react";
import { toast } from "sonner";
import { useTRPC } from "@/trpc/client";
import { authClient } from "@/lib/auth-client";
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

// What the card is asking for at the moment
type Step =
    | { name: "idle" }
    // Confirming with the password before turning on or off, or new codes
    | { name: "password"; action: "enable" | "disable" | "codes" }
    // Scanning the QR code and typing the first code from the app
    | { name: "verify"; totpURI: string; backupCodes: string[] }
    // New backup codes, shown once
    | { name: "codes"; backupCodes: string[] };

const BackupCodes = ({ codes }: { codes: string[] }) => (
    <div className="space-y-2">
        <p className="text-sm font-medium">Backup codes</p>
        <p className="text-xs text-muted-foreground">
            Each code signs you in once if you lose your authenticator app. They
            are shown only now: keep them somewhere safe.
        </p>
        <div className="grid grid-cols-2 gap-1 rounded-md border bg-muted/40 p-3 font-mono text-sm">
            {codes.map((code) => (
                <span key={code}>{code}</span>
            ))}
        </div>
        <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() =>
                navigator.clipboard
                    .writeText(codes.join("\n"))
                    .then(() => toast.success("Backup codes copied"))
                    .catch(() => toast.error("Could not copy the codes"))
            }
        >
            Copy codes
        </Button>
    </div>
);

export const TwoFactorCard = () => {
    const trpc = useTRPC();
    const queryClient = useQueryClient();

    const { data: security, isLoading } = useQuery(trpc.settings.getSecurity.queryOptions());

    const [step, setStep] = useState<Step>({ name: "idle" });
    const [password, setPassword] = useState("");
    const [code, setCode] = useState("");
    const [isPending, setIsPending] = useState(false);

    const enabled = !!security?.twoFactorEnabled;
    const hasPassword = !!security?.hasPassword;

    const reset = () => {
        setStep({ name: "idle" });
        setPassword("");
        setCode("");
    };

    const refresh = () => {
        queryClient.invalidateQueries(trpc.settings.getSecurity.queryOptions());
        // Admin buttons on the Templates page depend on it
        queryClient.invalidateQueries(trpc.templates.getMany.queryOptions());
    };

    const run = async (action: "enable" | "disable" | "codes") => {
        setIsPending(true);

        // Accounts without a password (Google, GitHub) confirm with nothing
        const body = hasPassword ? { password } : {};

        if (action === "enable") {
            const { data, error } = await authClient.twoFactor.enable(body as { password: string });

            if (error || !data) toast.error(error?.message || "Could not start two-factor setup");
            else {
                setPassword("");
                setStep({ name: "verify", totpURI: data.totpURI, backupCodes: data.backupCodes });
            }
        } else if (action === "disable") {
            const { error } = await authClient.twoFactor.disable(body as { password: string });

            if (error) toast.error(error.message || "Could not turn two-factor off");
            else {
                toast.success("Two-factor authentication is off");
                reset();
                refresh();
            }
        } else {
            const { data, error } = await authClient.twoFactor.generateBackupCodes(
                body as { password: string }
            );

            if (error || !data) toast.error(error?.message || "Could not make new backup codes");
            else {
                setPassword("");
                setStep({ name: "codes", backupCodes: data.backupCodes });
            }
        }

        setIsPending(false);
    };

    // Straight to the action when there is no password to ask for
    const start = (action: "enable" | "disable" | "codes") => {
        if (hasPassword) setStep({ name: "password", action });
        else run(action);
    };

    const verify = async () => {
        setIsPending(true);

        const { error } = await authClient.twoFactor.verifyTotp({
            code: code.replace(/\s+/g, ""),
        });

        setIsPending(false);

        if (error) {
            toast.error(error.message || "That code did not work");
            return;
        }

        toast.success("Two-factor authentication is on");
        reset();
        refresh();
    };

    // For typing into the app when the QR code cannot be scanned
    const setupKey =
        step.name === "verify" ? new URLSearchParams(step.totpURI.split("?")[1]).get("secret") : null;

    return (
        <Card className="shadow-none">
            <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                    Two-factor authentication
                    {!isLoading && (
                        <Badge variant={enabled ? "default" : "secondary"}>{enabled ? "On" : "Off"}</Badge>
                    )}
                </CardTitle>
                <CardDescription>
                    After your password, sign-in also asks for a code from an authenticator
                    app (Google Authenticator, Authy, 1Password...).
                    {security?.isAdmin && !enabled && " Admins need it to manage templates."}
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                {step.name === "idle" && (
                    <div className="flex flex-wrap gap-2">
                        {enabled ? (
                            <>
                                <Button variant="outline" disabled={isPending} onClick={() => start("codes")}>
                                    New backup codes
                                </Button>
                                <Button variant="destructive" disabled={isPending} onClick={() => start("disable")}>
                                    Turn off
                                </Button>
                            </>
                        ) : (
                            <Button disabled={isLoading || isPending} onClick={() => start("enable")}>
                                Turn on two-factor authentication
                            </Button>
                        )}
                    </div>
                )}

                {step.name === "password" && (
                    <form
                        className="space-y-3"
                        onSubmit={(event) => {
                            event.preventDefault();
                            run(step.action);
                        }}
                    >
                        <div className="space-y-2">
                            <Label htmlFor="two-factor-password">Confirm your password</Label>
                            <Input
                                id="two-factor-password"
                                type="password"
                                autoFocus
                                autoComplete="current-password"
                                value={password}
                                onChange={(event) => setPassword(event.target.value)}
                            />
                        </div>
                        <div className="flex gap-2">
                            <Button type="submit" disabled={isPending || !password}>
                                Continue
                            </Button>
                            <Button type="button" variant="ghost" onClick={reset}>
                                Cancel
                            </Button>
                        </div>
                    </form>
                )}

                {step.name === "verify" && (
                    <div className="space-y-4">
                        <div className="space-y-2">
                            <p className="text-sm font-medium">1. Scan this with your authenticator app</p>
                            <div className="inline-block rounded-md bg-white p-3">
                                <QRCodeSVG value={step.totpURI} size={176} />
                            </div>
                            {setupKey && (
                                <p className="text-xs text-muted-foreground">
                                    Or type this key into the app:{" "}
                                    <code className="break-all font-mono">{setupKey}</code>
                                </p>
                            )}
                        </div>

                        <BackupCodes codes={step.backupCodes} />

                        <form
                            className="space-y-3"
                            onSubmit={(event) => {
                                event.preventDefault();
                                verify();
                            }}
                        >
                            <div className="space-y-2">
                                <Label htmlFor="two-factor-setup-code">2. Enter the 6-digit code the app shows</Label>
                                <Input
                                    id="two-factor-setup-code"
                                    className="max-w-40"
                                    inputMode="numeric"
                                    autoComplete="one-time-code"
                                    placeholder="123456"
                                    value={code}
                                    onChange={(event) => setCode(event.target.value)}
                                />
                            </div>
                            <div className="flex gap-2">
                                <Button type="submit" disabled={isPending || !code.trim()}>
                                    Turn on
                                </Button>
                                <Button type="button" variant="ghost" onClick={reset}>
                                    Cancel
                                </Button>
                            </div>
                        </form>
                    </div>
                )}

                {step.name === "codes" && (
                    <div className="space-y-3">
                        <BackupCodes codes={step.backupCodes} />
                        <p className="text-xs text-muted-foreground">Your old backup codes no longer work.</p>
                        <Button variant="outline" onClick={reset}>
                            Done
                        </Button>
                    </div>
                )}
            </CardContent>
        </Card>
    );
};
