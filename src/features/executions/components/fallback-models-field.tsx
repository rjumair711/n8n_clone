"use client";

import { ArrowDown, ArrowUp, Plus, X } from "lucide-react";
import { CredentialType } from "@prisma/client";
import { useCredentialsByType } from "@/features/credentials/hooks/use-credentials";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CHAT_MODEL_PROVIDERS } from "../lib/chat-model-providers";
import {
  MAX_FALLBACK_MODELS,
  parseFallbackModels,
  serializeFallbackModels,
  type FallbackEntry,
} from "../lib/model-fallback";

// A select cannot hold an empty value: this stands for "the node's own"
const SAME = "__same__";

// A custom base URL has no address of its own to fall back to
const FALLBACK_PROVIDERS = CHAT_MODEL_PROVIDERS.filter(
  (provider) => provider.value !== "custom" && provider.baseUrl
);

type Props = {
  // The list as it is saved on the node: a JSON string
  value: string;
  onChange: (value: string) => void;
};

/**
 * The Chat Model node's "Fallback models": an ordered list of models that
 * are tried when the node's own model times out or answers 429 or 5xx.
 * Each line can use another provider and another credential.
 */
export const FallbackModelsField = ({ value, onChange }: Props) => {
  const { data: credentials } = useCredentialsByType(CredentialType.OPENAI_COMPATIBLE);

  // Lines being typed have no model yet: they are kept until the dialog saves
  const entries = readEntries(value);

  const update = (next: FallbackEntry[]) => onChange(JSON.stringify(next));

  const setEntry = (index: number, patch: Partial<FallbackEntry>) =>
    update(entries.map((entry, position) => (position === index ? { ...entry, ...patch } : entry)));

  const move = (index: number, by: number) => {
    const next = [...entries];
    const [entry] = next.splice(index, 1);
    next.splice(index + by, 0, entry);
    update(next);
  };

  return (
    <div className="space-y-2">
      {entries.map((entry, index) => (
        <div key={index} className="space-y-2 rounded-md border bg-muted/20 p-2">
          <div className="flex items-center gap-2">
            <span className="w-5 shrink-0 text-center text-xs text-muted-foreground">
              {index + 1}
            </span>
            <Input
              className="font-mono text-sm"
              placeholder="Model ID"
              aria-label={`Fallback ${index + 1}: model`}
              value={entry.model}
              onChange={(event) => setEntry(index, { model: event.target.value })}
            />
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="size-8 shrink-0"
              disabled={index === 0}
              onClick={() => move(index, -1)}
              aria-label="Try earlier"
            >
              <ArrowUp className="size-4" />
            </Button>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="size-8 shrink-0"
              disabled={index === entries.length - 1}
              onClick={() => move(index, 1)}
              aria-label="Try later"
            >
              <ArrowDown className="size-4" />
            </Button>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="size-8 shrink-0"
              onClick={() => update(entries.filter((_, position) => position !== index))}
              aria-label="Remove fallback"
            >
              <X className="size-4" />
            </Button>
          </div>
          <div className="grid gap-2 pl-7 sm:grid-cols-2">
            <Select
              value={entry.provider || SAME}
              onValueChange={(provider) =>
                setEntry(index, { provider: provider === SAME ? "" : provider })
              }
            >
              <SelectTrigger className="w-full" aria-label={`Fallback ${index + 1}: provider`}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={SAME}>Same provider as this node</SelectItem>
                {FALLBACK_PROVIDERS.map((provider) => (
                  <SelectItem key={provider.value} value={provider.value}>
                    {provider.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={entry.credentialId || SAME}
              onValueChange={(credentialId) =>
                setEntry(index, { credentialId: credentialId === SAME ? "" : credentialId })
              }
            >
              <SelectTrigger className="w-full" aria-label={`Fallback ${index + 1}: credential`}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={SAME}>Same credential as this node</SelectItem>
                {credentials?.map((credential) => (
                  <SelectItem key={credential.id} value={credential.id}>
                    {credential.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {entry.provider && !entry.credentialId && (
            <p className="pl-7 text-xs text-amber-600 dark:text-amber-500">
              Another provider needs its own API key: pick its credential.
            </p>
          )}
        </div>
      ))}

      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={entries.length >= MAX_FALLBACK_MODELS}
        onClick={() => update([...entries, { provider: "", credentialId: "", model: "" }])}
      >
        <Plus className="size-4" />
        Add fallback model
      </Button>
    </div>
  );
};

// What the editor shows: the saved list, including lines without a model yet
const readEntries = (value: string): FallbackEntry[] => {
  try {
    const list: unknown = value.trim() ? JSON.parse(value) : [];
    if (!Array.isArray(list)) return [];

    return list.slice(0, MAX_FALLBACK_MODELS).map((entry) => {
      const { provider, credentialId, model } = (entry ?? {}) as Record<string, unknown>;

      return {
        provider: typeof provider === "string" ? provider : "",
        credentialId: typeof credentialId === "string" ? credentialId : "",
        model: typeof model === "string" ? model : "",
      };
    });
  } catch {
    return [];
  }
};

// What is saved on the node: complete lines only, or nothing
export const cleanFallbackModels = (value: string | undefined) =>
  serializeFallbackModels(parseFallbackModels(value ?? ""));
