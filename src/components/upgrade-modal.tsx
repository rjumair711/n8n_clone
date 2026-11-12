"use client"

import Link from "next/link";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "./ui/alert-dialog";

interface UpgradeModalProps {
    open: boolean,
    onOpenChange: (open: boolean) => void;
    // What was refused, as the server said it (a node only a self-hosted
    // server offers, the monthly run limit...)
    message?: string;
}

// There are no plans to upgrade to: what has no limits is a server of your
// own, which the managed private server is (see /pricing)
export const UpgradeModal = ({
    open,
    onOpenChange,
    message,
}: UpgradeModalProps) => {
    return (
        <AlertDialog open={open} onOpenChange={onOpenChange}>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>Available on your own server</AlertDialogTitle>
                    <AlertDialogDescription>
                        {message || "This needs a self-hosted or managed RXJ server."}{" "}
                        A managed private server has every feature and no limits, set up
                        and looked after for you.
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel>Close</AlertDialogCancel>
                    <AlertDialogAction asChild>
                        <Link href="/pricing" prefetch={false}>See the managed server</Link>
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    )
}
