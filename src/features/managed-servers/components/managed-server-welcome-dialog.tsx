"use client";

import Link from "next/link";
import { ServerIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import {
    INSTALL_STEPS_FOOTER,
    MANAGED_SERVER_INSTALL_STEPS,
    PRIVATE_SERVER_SETTINGS_HREF,
} from "../lib/install-steps";

/** The numbered steps, also used outside the popup. */
export const InstallStepsList = () => (
    <ol className="space-y-3">
        {MANAGED_SERVER_INSTALL_STEPS.map((step, index) => (
            <li key={step.title} className="flex gap-3">
                <span
                    className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground"
                    aria-hidden
                >
                    {index + 1}
                </span>
                <div className="space-y-0.5">
                    <p className="text-sm font-medium">{step.title}</p>
                    <p className="text-sm text-muted-foreground">{step.description}</p>
                </div>
            </li>
        ))}
    </ol>
);

/**
 * The popup after paying for the managed private server: how to connect
 * the server to RXJ.
 */
export const ManagedServerWelcomeDialog = ({
    open,
    onOpenChange,
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
}) => (
    <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
            <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                    <ServerIcon className="size-5" aria-hidden />
                    Your private server is ready to connect
                </DialogTitle>
                <DialogDescription>
                    Thank you for subscribing. Connect your own server to RXJ in five steps:
                </DialogDescription>
            </DialogHeader>

            <InstallStepsList />

            <p className="rounded-md bg-muted p-3 text-xs text-muted-foreground">
                {INSTALL_STEPS_FOOTER}
            </p>

            <DialogFooter className="gap-2 sm:gap-0">
                <Button variant="outline" onClick={() => onOpenChange(false)}>
                    Later
                </Button>
                <Button asChild>
                    <Link href={PRIVATE_SERVER_SETTINGS_HREF} onClick={() => onOpenChange(false)}>
                        Open Private server settings
                    </Link>
                </Button>
            </DialogFooter>
        </DialogContent>
    </Dialog>
);
