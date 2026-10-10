"use client";

import { useEffect, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useTRPC } from "@/trpc/client";
import { isFreeModel } from "@/config/free-models";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FormControl } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import {
  CHINA_DATA_NOTE,
  DEDICATED_CHAT_MODEL_NODES,
  getRetiredModelNote,
  isProcessedInChina,
  resolveChatModelEndpoint,
} from "../lib/chat-model-providers";

export type ChatModelNodeType = "CHAT_MODEL" | "DEEPSEEK" | "KIMI" | "QWEN";

// How many suggestions are drawn at once; typing narrows the list
const MAX_VISIBLE_MODELS = 40;

type Props = {
  nodeType: ChatModelNodeType;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  // The other fields of the form the model depends on
  provider?: string;
  baseUrl?: string;
  credentialId?: string;
};

/**
 * The Model field of the Chat Model, DeepSeek, Kimi and Qwen nodes: a text
 * field (any model ID can be typed), the provider's suggested models to
 * pick from, and "Load models", which replaces the suggestions with the
 * provider's own list.
 */
export const ChatModelField = ({
  nodeType,
  value,
  onChange,
  placeholder,
  provider,
  baseUrl,
  credentialId,
}: Props) => {
  const trpc = useTRPC();

  const endpoint = resolveChatModelEndpoint({
    provider: DEDICATED_CHAT_MODEL_NODES[nodeType] ?? provider,
    baseUrl,
  });
  const providerValue = endpoint?.provider.value;

  // What "Load models" brought back, for the provider and URL it was asked
  const [loaded, setLoaded] = useState<{
    key: string;
    models: string[];
    source: "provider" | "preset";
    error?: string;
  } | null>(null);

  const endpointKey = `${providerValue}|${endpoint?.baseUrl}|${credentialId}`;

  // Another provider, URL or credential: the loaded list no longer applies
  useEffect(() => {
    setLoaded((current) => (current && current.key !== endpointKey ? null : current));
  }, [endpointKey]);

  const loadModels = useMutation(
    trpc.chatModels.list.mutationOptions({
      onSuccess: (result) => setLoaded({ key: endpointKey, ...result }),
      onError: (error) =>
        setLoaded({
          key: endpointKey,
          models: endpoint?.provider.models ?? [],
          source: "preset",
          error: error.message,
        }),
    })
  );

  const fromProvider = loaded?.source === "provider";
  const models = fromProvider ? loaded.models : (endpoint?.provider.models ?? []);

  const typed = value.trim().toLowerCase();
  // Typing narrows the list, until what is typed is one of the models
  const matching =
    typed && !models.some((model) => model.toLowerCase() === typed)
      ? models.filter((model) => model.toLowerCase().includes(typed))
      : models;
  const visible = matching.slice(0, MAX_VISIBLE_MODELS);

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <FormControl>
          <Input
            placeholder={placeholder ?? endpoint?.provider.modelPlaceholder}
            value={value}
            onChange={(event) => onChange(event.target.value)}
          />
        </FormControl>
        <Button
          type="button"
          variant="outline"
          disabled={!credentialId || !endpoint?.baseUrl || loadModels.isPending}
          title={
            credentialId
              ? "Ask the provider for its list of models"
              : "Select a credential first"
          }
          onClick={() =>
            loadModels.mutate({
              nodeType,
              credentialId: credentialId ?? "",
              provider: providerValue,
              baseUrl: endpoint?.baseUrl,
            })
          }
        >
          {loadModels.isPending ? "Loading..." : "Load models"}
        </Button>
      </div>

      {isFreeModel(providerValue, value) && (
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Badge variant="secondary">Free</Badge>
          The provider lists this model as free. Free models have rate limits.
        </p>
      )}

      {getRetiredModelNote(providerValue, value) && (
        <p className="text-xs font-medium text-amber-600 dark:text-amber-500">
          {getRetiredModelNote(providerValue, value)}
        </p>
      )}

      {loaded?.error && (
        <p className="text-xs text-amber-600 dark:text-amber-500">
          Could not load the provider&apos;s list ({loaded.error})
          {models.length > 0 ? " Showing the suggested models instead." : " Type the model ID."}
        </p>
      )}

      {visible.length > 0 && (
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground">
            {fromProvider
              ? `${models.length} model${models.length === 1 ? "" : "s"} from the provider`
              : "Suggested models"}
            {matching.length > visible.length &&
              `, showing ${visible.length}: type to narrow the list`}
          </p>
          <div className="flex max-h-32 flex-wrap gap-1.5 overflow-y-auto">
            {visible.map((model) => (
              <button
                key={model}
                type="button"
                onClick={() => onChange(model)}
                className={`flex items-center gap-1 rounded-md border px-2 py-0.5 font-mono text-xs hover:bg-muted ${
                  model === value ? "border-primary bg-muted" : ""
                }`}
              >
                {model}
                {isFreeModel(providerValue, model) && (
                  <Badge variant="secondary" className="px-1 py-0 font-sans text-[10px]">
                    Free
                  </Badge>
                )}
              </button>
            ))}
          </div>
        </div>
      )}

      {isProcessedInChina(endpoint?.baseUrl) && (
        <p className="text-xs font-medium text-amber-600 dark:text-amber-500">
          {CHINA_DATA_NOTE}: prompts and answers are handled on this
          provider&apos;s servers in mainland China.
        </p>
      )}
    </div>
  );
};
