"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useTRPC } from "@/trpc/client";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

/**
 * Settings → Profile: "Email me when a workflow fails". On by default; at
 * most one email an hour per workflow (src/lib/failure-alerts.ts).
 */
export const NotificationsCard = () => {
    const trpc = useTRPC();
    const queryClient = useQueryClient();
    const settings = useQuery(trpc.settings.getNotifications.queryOptions());

    const update = useMutation(trpc.settings.setFailureAlertEmails.mutationOptions({
        onSuccess: (data) => {
            toast.success(data.failureAlertEmails ? "Failure emails are on" : "Failure emails are off");
            queryClient.invalidateQueries(trpc.settings.getNotifications.queryOptions());
        },
        onError: (error) => toast.error(`Could not save: ${error.message}`),
    }));

    const enabled = settings.data?.failureAlertEmails ?? true;

    return (
        <Card className="shadow-none">
            <CardContent className="flex items-start justify-between gap-4">
                <div className="space-y-1">
                    <Label htmlFor="failure-alert-emails">Email me when a workflow fails</Label>
                    <p className="text-sm text-muted-foreground">
                        One email per workflow an hour at most, with the failed node, the error and a
                        link to the execution. Not sent for test runs from the editor, or for a
                        workflow whose failures an Error Trigger handles.
                    </p>
                    {settings.data && !settings.data.emailAvailable && (
                        <p className="text-xs text-muted-foreground">
                            This server has no email service set up (RESEND_API_KEY), so no emails are sent.
                        </p>
                    )}
                </div>
                <Switch
                    id="failure-alert-emails"
                    checked={enabled}
                    disabled={settings.isPending || update.isPending}
                    onCheckedChange={(checked) => update.mutate({ enabled: checked })}
                />
            </CardContent>
        </Card>
    );
};
