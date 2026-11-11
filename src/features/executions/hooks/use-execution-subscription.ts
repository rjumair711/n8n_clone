"use client";

import { useEffect } from "react";
import { useExecutionStore } from "@/features/executions/store/execution-store";
import { SELF_HOSTED } from "@/config/self-hosted";

export function useExecutionSubscription(executionId: string | null) {
  const setNodeStatus = useExecutionStore((s) => s.setNodeStatus);
  const setExecutionActive = useExecutionStore((s) => s.setExecutionActive);

  useEffect(() => {
    // The stream below is Inngest Cloud's. A self-hosted server runs its own
    // Inngest, so the editor relies on polling the run (use-execution-nodes)
    if (!executionId || SELF_HOSTED) return;

    let eventSource: EventSource;

    async function subscribe() {
      // 1. Get a realtime token for the code-execution channel
      const res = await fetch(`/api/realtime-token/code-execution`);
      const { token } = await res.json();

      // 2. Open SSE connection with the token
      eventSource = new EventSource(
        `https://inn.gs/e/${token}` // Inngest realtime SSE URL
      );

      eventSource.addEventListener("status", (e) => {
        const data = JSON.parse(e.data);

        // 3. Filter to events for this execution only
        if (data.executionId !== executionId) return;

        // 4. Write to the store — this is what feeds useNodeStatus
        setNodeStatus(data.nodeId, {
          status: data.status,
          error: data.status === "error" ? data.message : undefined,
        });

        if (data.status === "success" || data.status === "error") {
          setExecutionActive(false);
        }
      });
    }

    subscribe();

    return () => eventSource?.close();
  }, [executionId, setNodeStatus, setExecutionActive]);
}