"use client"

import { useRef } from "react"
import { useRouter } from "next/navigation"
import { UploadIcon } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { useUpgradeModal } from "@/hooks/use-upgrade-modal"
import { MAX_IMPORT_BYTES } from "../lib/workflow-json"
import { useImportWorkflow } from "../hooks/use-workflows"

// Workflows page: pick a file made with "Download as JSON" and open the new
// workflow
export const ImportWorkflowButton = ({ disabled }: { disabled?: boolean }) => {
    const input = useRef<HTMLInputElement>(null)
    const importWorkflow = useImportWorkflow()
    const { handleError, modal } = useUpgradeModal()
    const router = useRouter()

    const handleFile = async (file: File | undefined) => {
        if (!file) return
        if (file.size > MAX_IMPORT_BYTES) {
            toast.error("The file is larger than 2 MB, so it is not an RXJ workflow")
            return
        }

        const json = await file.text()
        importWorkflow.mutate({ json }, {
            onSuccess: (data) => router.push(`/workflows/${data.id}`),
            onError: (error) => {
                if (!handleError(error)) toast.error(`Import failed: ${error.message}`)
            },
        })
    }

    return (
        <>
            {modal}
            <input
                ref={input}
                type="file"
                accept="application/json,.json"
                className="hidden"
                onChange={(event) => {
                    void handleFile(event.target.files?.[0])
                    // The same file can be picked again after a failure
                    event.target.value = ""
                }}
            />
            <Button
                size="sm"
                variant="outline"
                disabled={disabled || importWorkflow.isPending}
                onClick={() => input.current?.click()}
            >
                <UploadIcon className="size-4" />
                {importWorkflow.isPending ? "Importing..." : "Import"}
            </Button>
        </>
    )
}
