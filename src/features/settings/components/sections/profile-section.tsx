"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getInitials } from "@/lib/initials";
import { authClient } from "@/lib/auth-client";
import { MAX_NAME_LENGTH } from "@/lib/profile";
import { SectionSkeleton } from "../settings-section";

const formatDate = (value: Date | string) =>
    new Date(value).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });

/**
 * The name field: saved through Better Auth's own update-user endpoint,
 * which only changes the name (and picture) of the signed-in account. The
 * session refreshes itself, so the sidebar shows the new name at once.
 */
const NameForm = ({ current }: { current: string }) => {
    const [name, setName] = useState(current);
    const [saving, setSaving] = useState(false);

    const trimmed = name.trim();
    const unchanged = trimmed === current.trim();

    const save = async (event: React.FormEvent) => {
        event.preventDefault();
        if (!trimmed || unchanged) return;

        setSaving(true);
        const { error } = await authClient.updateUser({ name: trimmed });
        setSaving(false);

        if (error) {
            toast.error(error.message || "Your name could not be saved");
            return;
        }

        setName(trimmed);
        toast.success("Name saved");
    };

    return (
        <form onSubmit={save} className="space-y-2">
            <Label htmlFor="profile-name">Name</Label>
            <div className="flex flex-col gap-2 sm:flex-row">
                <Input
                    id="profile-name"
                    value={name}
                    maxLength={MAX_NAME_LENGTH}
                    autoComplete="name"
                    onChange={(event) => setName(event.target.value)}
                    className="sm:max-w-sm"
                />
                <Button type="submit" disabled={saving || !trimmed || unchanged}>
                    {saving ? "Saving..." : "Save"}
                </Button>
            </div>
            {!trimmed && <p className="text-xs text-destructive">Your name cannot be empty.</p>}
        </form>
    );
};

/** Settings → Account → Profile: the user's name, and who they are signed in as. */
export const ProfileSection = () => {
    const { data, isPending } = authClient.useSession();

    if (isPending || !data) return <SectionSkeleton rows={2} />;

    const { user } = data;

    return (
        <Card className="shadow-none">
            <CardContent className="space-y-6">
                <div className="flex items-center gap-4">
                    <Avatar className="size-14">
                        {user.image && <AvatarImage src={user.image} alt="" />}
                        <AvatarFallback className="text-base">{getInitials(user.name, user.email)}</AvatarFallback>
                    </Avatar>
                    <div className="min-w-0">
                        <p className="truncate font-medium">{user.name || user.email}</p>
                        <p className="truncate text-sm text-muted-foreground">{user.email}</p>
                    </div>
                </div>
                <NameForm key={user.id} current={user.name ?? ""} />
                <dl className="grid gap-4 text-sm sm:grid-cols-2">
                    <div>
                        <dt className="text-xs text-muted-foreground">Email</dt>
                        <dd className="mt-1 flex flex-wrap items-center gap-2">
                            <span className="break-all">{user.email}</span>
                            <Badge variant={user.emailVerified ? "secondary" : "outline"}>
                                {user.emailVerified ? "Verified" : "Not verified"}
                            </Badge>
                        </dd>
                    </div>
                    <div>
                        <dt className="text-xs text-muted-foreground">Member since</dt>
                        <dd className="mt-1">{formatDate(user.createdAt)}</dd>
                    </div>
                </dl>
            </CardContent>
        </Card>
    );
};
