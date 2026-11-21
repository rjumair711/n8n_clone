"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { usePathname } from "next/navigation";
import { SELF_HOSTED } from "@/config/self-hosted";
import { useTRPC } from "@/trpc/client";
import { PRIVATE_SERVER_SETTINGS_HREF } from "../lib/install-steps";
import { ManagedServerWelcomeDialog } from "./managed-server-welcome-dialog";

/**
 * Opens the "how to connect your server" popup once, the first time a
 * customer is in the app after paying for a managed private server (also
 * when they paid before they had an account). Closing it remembers that,
 * per server. Nothing on a self-hosted server.
 */
export const ManagedServerWelcomeGate = () => {
    const trpc = useTRPC();
    const queryClient = useQueryClient();
    const pathname = usePathname();
    const [open, setOpen] = useState(false);

    const { data } = useQuery({
        ...trpc.managedServers.welcome.queryOptions(),
        enabled: !SELF_HOSTED,
        staleTime: Infinity,
        retry: false,
    });
    const serverId = data?.serverId ?? null;

    const dismiss = useMutation(
        trpc.managedServers.dismissWelcome.mutationOptions({
            onSettled: () =>
                queryClient.invalidateQueries(trpc.managedServers.welcome.queryOptions()),
        })
    );

    // Not on the page the steps lead to: it shows them, so being there
    // counts as having seen them
    useEffect(() => {
        if (!serverId) return;
        if (pathname === PRIVATE_SERVER_SETTINGS_HREF) {
            setOpen(false);
            if (!dismiss.isPending) dismiss.mutate({ serverId });
        } else {
            setOpen(true);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps -- once per server and page
    }, [serverId, pathname]);

    if (!serverId) return null;

    return (
        <ManagedServerWelcomeDialog
            open={open}
            onOpenChange={(next) => {
                setOpen(next);
                if (!next && !dismiss.isPending) dismiss.mutate({ serverId });
            }}
        />
    );
};
