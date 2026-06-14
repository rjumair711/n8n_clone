"use client";

import { useEffect } from "react";
import { useExecutionStore } from "@/features/executions/store/execution-store";

export function useExecutionSubscription(executionId: string | null) {
  const setNodeStatus = useExecutionStore((s) => s.setNodeStatus);
  const setExecutionActive = useExecutionStore((s) => s.setExecutionActive);

  useEffect(() => {
    if (!executionId) return;

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