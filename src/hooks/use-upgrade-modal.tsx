import { UpgradeModal } from "@/components/upgrade-modal"
import { TRPCClientError } from "@trpc/client"
import { useState } from "react"
import { OWN_SERVER_MESSAGE } from "@/config/plans"

// A FORBIDDEN answer from the server (a node only a self-hosted server
// offers, the monthly run limit) opens the dialog with the server's message
export const useUpgradeModal = () => {
    const [open, setOpen] = useState(false)
    const [message, setMessage] = useState<string | undefined>()

    const handleError = (error: unknown) => {
        if (error instanceof TRPCClientError) {
            // Only what a server of your own changes; a role error (a viewer
            // who may not edit) is shown as the error it is
            if (
                error.data?.code === "FORBIDDEN" &&
                (error.message.includes(OWN_SERVER_MESSAGE) || /limit/i.test(error.message))
            ) {
                setMessage(error.message || undefined)
                setOpen(true)
                return true
            }
        }
        return false;
    }

    const modal = <UpgradeModal open={open} onOpenChange={setOpen} message={message} />

    return { handleError, modal }
}
