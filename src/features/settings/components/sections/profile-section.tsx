"use client";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { getInitials } from "@/lib/initials";
import { authClient } from "@/lib/auth-client";
import { SectionSkeleton } from "../settings-section";

const formatDate = (value: Date | string) =>
    new Date(value).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });

/** Settings → Account → Profile: who the user is signed in as. */
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
