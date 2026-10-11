// Choices shown in the Vector Store and Document Loader dialogs (in the
// browser) and read by their executors, so nothing here may import server
// code.

export const RERANKERS = [
  { value: "none", label: "No reranking" },
  { value: "cohere", label: "Cohere Rerank" },
  { value: "jina", label: "Jina Reranker" },
  { value: "model", label: "Connected chat model" },
];

export const DEFAULT_RERANK_MODELS: Record<"cohere" | "jina", string> = {
  cohere: "rerank-v3.5",
  jina: "jina-reranker-v2-base-multilingual",
};

export const EMBEDDING_PROVIDERS = [
  { value: "openai", label: "OpenAI" },
  { value: "gemini", label: "Google Gemini" },
  { value: "compatible", label: "OpenAI-compatible (Ollama, Together...)" },
];

export const DEFAULT_EMBEDDING_MODELS: Record<string, string> = {
  openai: "text-embedding-3-small",
  gemini: "gemini-embedding-001",
};

// Document Loader: how many documents one run reads
export const LOADER_DEFAULT_DOCUMENTS = 25;
export const LOADER_MAX_DOCUMENTS = 100;
