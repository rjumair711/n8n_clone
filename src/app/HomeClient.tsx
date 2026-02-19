"use client"

import { useTRPC } from "@/trpc/client"
import { useMutation, useQuery } from "@tanstack/react-query"
import { Button } from "@/components/ui/button"
import { LogoutButton } from "./logout"
import { toast } from "sonner"

export default function HomeClient() {
  const trpc = useTRPC()

  const { data } = useQuery(trpc.getWorkflows.queryOptions())

  const create = useMutation(
    trpc.createWorkflow.mutationOptions({
      onSuccess: () => {
        toast.success("Job queued")
      },
    })
  )

  return (
    <div className="min-w-screen justify-center flex-col text-black min-h-screen flex items-center gap-y-6">
      Protected server component
      <pre className="text-xs">{JSON.stringify(data)}</pre>

      <Button disabled={create.isPending} onClick={() => create.mutate()}>
        Create Workflow
      </Button>
      <LogoutButton />
    </div>
  )
}
