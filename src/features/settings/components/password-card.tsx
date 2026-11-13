"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { authClient } from "@/lib/auth-client";
import { useTRPC } from "@/trpc/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

// Better Auth's own minimum; the reset-password form asks for the same
export const MIN_PASSWORD_LENGTH = 8;

/**
 * Settings → Security: change the password. Better Auth checks the current
 * password and the new one's length again on the server. An account that
 * signs in with Google or GitHub has no password: "Forgot your password?"
 * on the login page gives it one.
 */
export const PasswordCard = () => {
    const trpc = useTRPC();
    const { data: security, isLoading } = useQuery(trpc.settings.getSecurity.queryOptions());

    const [current, setCurrent] = useState("");
    const [next, setNext] = useState("");
    const [repeat, setRepeat] = useState("");
    const [signOutOthers, setSignOutOthers] = useState(true);
    const [saving, setSaving] = useState(false);

    const tooShort = next.length > 0 && next.length < MIN_PASSWORD_LENGTH;
    const mismatch = repeat.length > 0 && next !== repeat;
    const sameAsOld = next.length > 0 && next === current;
    const ready = !!current && next.length >= MIN_PASSWORD_LENGTH && next === repeat && !sameAsOld;

    const save = async (event: React.FormEvent) => {
        event.preventDefault();
        if (!ready) return;

        setSaving(true);
        const { error } = await authClient.changePassword({
            currentPassword: current,
            newPassword: next,
            revokeOtherSessions: signOutOthers,
        });
        setSaving(false);

        if (error) {
            toast.error(
                error.code === "INVALID_PASSWORD"
                    ? "Your current password is not right"
                    : error.message || "Your password could not be changed"
            );
            return;
        }

        setCurrent("");
        setNext("");
        setRepeat("");
        toast.success(signOutOthers ? "Password changed. Other sessions are signed out." : "Password changed");
    };

    return (
        <Card className="shadow-none">
            <CardHeader>
                <CardTitle className="text-base">Password</CardTitle>
                <CardDescription>The password you sign in with by email.</CardDescription>
            </CardHeader>
            <CardContent>
                {isLoading ? (
                    <p className="text-sm text-muted-foreground">Loading...</p>
                ) : !security?.hasPassword ? (
                    <p className="text-sm text-muted-foreground">
                        You sign in with Google or GitHub, so your account has no password. To add
                        one, use{" "}
                        <Link href="/forgot-password" className="underline">
                            Forgot your password?
                        </Link>{" "}
                        with this account&apos;s email: the link in that email lets you set one.
                    </p>
                ) : (
                    <form onSubmit={save} className="max-w-sm space-y-4">
                        <div className="space-y-2">
                            <Label htmlFor="password-current">Current password</Label>
                            <Input
                                id="password-current"
                                type="password"
                                autoComplete="current-password"
                                value={current}
                                onChange={(event) => setCurrent(event.target.value)}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="password-new">New password</Label>
                            <Input
                                id="password-new"
                                type="password"
                                autoComplete="new-password"
                                value={next}
                                onChange={(event) => setNext(event.target.value)}
                            />
                            {tooShort && (
                                <p className="text-xs text-destructive">
                                    Use at least {MIN_PASSWORD_LENGTH} characters.
                                </p>
                            )}
                            {sameAsOld && (
                                <p className="text-xs text-destructive">
                                    The new password is the same as the current one.
                                </p>
                            )}
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="password-repeat">Repeat the new password</Label>
                            <Input
                                id="password-repeat"
                                type="password"
                                autoComplete="new-password"
                                value={repeat}
                                onChange={(event) => setRepeat(event.target.value)}
                            />
                            {mismatch && <p className="text-xs text-destructive">The passwords do not match.</p>}
                        </div>
                        <div className="flex items-center gap-2">
                            <Checkbox
                                id="password-sign-out"
                                checked={signOutOthers}
                                onCheckedChange={(checked) => setSignOutOthers(checked === true)}
                            />
                            <Label htmlFor="password-sign-out" className="font-normal">
                                Sign out of all other sessions
                            </Label>
                        </div>
                        <Button type="submit" disabled={!ready || saving}>
                            {saving ? "Changing..." : "Change password"}
                        </Button>
                    </form>
                )}
            </CardContent>
        </Card>
    );
};
