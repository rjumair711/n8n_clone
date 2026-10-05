import type { NodeExecutor } from "@/features/executions/types";
import { NonRetriableError } from "inngest";
import { BlockedRequestError, safeFetch } from "@/lib/ssrf";
import { MAX_FILE_BYTES, saveWorkflowFile } from "@/lib/workflow-files";
import { extensionForMimeType } from "../../lib/file-formats";
import { renderTemplate } from "../../lib/templates";
import { loadCredentialSecret } from "../../lib/integration";
import { parseKeyValues } from "../../lib/key-values";

export const HTTP_METHODS = [
  "GET",
  "POST",
  "PUT",
  "PATCH",
  "DELETE",
  "HEAD",
  "OPTIONS",
] as const;

type HttpRequestData = {
  variableName?: string;
  endpoint?: string;
  method?: (typeof HTTP_METHODS)[number];

  // "none" | "basic" | "bearer" | "header", with the secret in a credential
  authentication?: string;
  credentialId?: string;

  headers?: string;
  queryParams?: string;

  // "json" | "form" | "raw" | "none"
  bodyType?: string;
  body?: string;
  rawContentType?: string;

  // "auto" reads text or JSON; "file" stores the response as a file
  responseFormat?: string;

  timeout?: string | number;
  // Like n8n's "Never Error": 4xx/5xx responses do not fail the node
  neverError?: boolean | string;
};

const DEFAULT_TIMEOUT_MS = 30_000;
const MAX_TIMEOUT_MS = 120_000;
// Step results are stored by Inngest, which caps their size
const MAX_RESPONSE_BYTES = 3 * 1024 * 1024;

const METHODS_WITH_BODY = ["POST", "PUT", "PATCH", "DELETE"];

const AUTH_LABELS: Record<string, string> = {
  basic: "Basic Auth",
  bearer: "Bearer Auth",
  header: "Header Auth",
};

// The name the server suggests, else the last part of the URL
const fileNameFromResponse = (response: Response, url: URL) => {
  const disposition = response.headers.get("content-disposition") || "";

  const encoded = disposition.match(/filename\*=(?:UTF-8'')?([^;]+)/i)?.[1];
  const plain = disposition.match(/filename="?([^";]+)"?/i)?.[1];

  let name = "";
  try {
    name = encoded ? decodeURIComponent(encoded.trim()) : (plain ?? "").trim();
  } catch {
    name = (plain ?? "").trim();
  }

  if (!name) {
    try {
      name = decodeURIComponent(url.pathname.split("/").filter(Boolean).pop() ?? "");
    } catch {
      name = "";
    }
  }

  if (!name) name = "download";

  return /\.[A-Za-z0-9]{1,8}$/.test(name)
    ? name
    : `${name}.${extensionForMimeType(response.headers.get("content-type") || "")}`;
};

export const applyAuthentication = (
  headers: Headers,
  authentication: string,
  secret: string
) => {
  switch (authentication) {
    case "basic":
      // Stored as "username:password"
      headers.set(
        "Authorization",
        `Basic ${Buffer.from(secret, "utf8").toString("base64")}`
      );
      return;

    case "bearer":
      headers.set("Authorization", `Bearer ${secret.replace(/^Bearer\s+/i, "")}`);
      return;

    case "header": {
      // Stored as "Header-Name: value"
      const separator = secret.indexOf(":");
      const name = secret.slice(0, separator).trim();
      const value = secret.slice(separator + 1).trim();

      if (separator <= 0 || !name || !value) {
        throw new NonRetriableError(
          'HTTP Request node: the Header Auth credential must look like "X-API-Key: your-key"'
        );
      }

      headers.set(name, value);
      return;
    }
  }
};

export const httpRequestExecutor: NodeExecutor<HttpRequestData> = async ({
  data,
  nodeId,
  userId,
  context,
  step,
  executionId,
}) => {
  if (!data.endpoint) {
    throw new NonRetriableError("HTTP Request node: No endpoint configured");
  }

  if (!data.variableName) {
    throw new NonRetriableError(
      "HTTP Request node: Variable name not configured"
    );
  }

  const method = data.method || "GET";
  if (!HTTP_METHODS.includes(method)) {
    throw new NonRetriableError(
      `HTTP Request node: Unsupported method "${method}"`
    );
  }

  const authentication = data.authentication || "none";
  if (authentication !== "none" && !AUTH_LABELS[authentication]) {
    throw new NonRetriableError(
      `HTTP Request node: Unsupported authentication "${authentication}"`
    );
  }

  const secret =
    authentication === "none"
      ? ""
      : await loadCredentialSecret({
          step,
          stepId: `http-request-${nodeId}-get-credential`,
          credentialId: data.credentialId,
          userId,
          label: `HTTP Request (${AUTH_LABELS[authentication]})`,
        });

  const neverError = data.neverError === true || data.neverError === "true";

  const timeout = Math.min(
    Math.max(Number(data.timeout) || DEFAULT_TIMEOUT_MS, 1000),
    MAX_TIMEOUT_MS
  );

  try {
    const result = await step.run("http-request", async () => {
      // Values are inserted as they are: no HTML escaping of & or =
      const endpoint = renderTemplate(data.endpoint, context).trim();

      let url: URL;
      try {
        url = new URL(endpoint);
      } catch {
        throw new NonRetriableError(
          `HTTP Request node: "${endpoint}" is not a valid URL`
        );
      }

      const query = parseKeyValues(
        "HTTP Request",
        "Query Parameters",
        renderTemplate(data.queryParams, context)
      );
      for (const [key, value] of Object.entries(query)) {
        url.searchParams.set(key, value);
      }

      const headers = new Headers(
        parseKeyValues(
          "HTTP Request",
          "Headers",
          renderTemplate(data.headers, context)
        )
      );

      let body: string | undefined;
      // Requests saved before Body Type existed always sent JSON
      const bodyType = data.bodyType || "json";

      if (METHODS_WITH_BODY.includes(method) && bodyType !== "none") {
        const rendered = renderTemplate(data.body, context);

        if (bodyType === "json") {
          const text = rendered.trim() || (method === "DELETE" ? "" : "{}");

          if (text) {
            try {
              JSON.parse(text);
            } catch {
              throw new NonRetriableError(
                "HTTP Request node: the request body is not valid JSON after the variables were filled in"
              );
            }

            body = text;
            if (!headers.has("content-type")) {
              headers.set("Content-Type", "application/json");
            }
          }
        } else if (bodyType === "form") {
          body = new URLSearchParams(
            parseKeyValues("HTTP Request", "Body", rendered)
          ).toString();
          if (!headers.has("content-type")) {
            headers.set("Content-Type", "application/x-www-form-urlencoded");
          }
        } else if (rendered) {
          body = rendered;
          if (!headers.has("content-type")) {
            headers.set(
              "Content-Type",
              renderTemplate(data.rawContentType, context).trim() || "text/plain"
            );
          }
        }
      }

      // Applied last so a header from the list cannot replace the credential
      applyAuthentication(headers, authentication, secret);

      const response = await safeFetch(url, {
        method,
        headers,
        body,
        signal: AbortSignal.timeout(timeout),
      });

      const asFile = data.responseFormat === "file" && method !== "HEAD";
      const maxBytes = asFile ? MAX_FILE_BYTES : MAX_RESPONSE_BYTES;

      const declaredLength = Number(response.headers.get("content-length"));
      if (declaredLength > maxBytes) {
        throw new NonRetriableError(
          `HTTP Request node: the response is larger than ${maxBytes / 1024 / 1024} MB`
        );
      }

      // Response Format "File": a download (a PDF, an image) is stored and
      // the workflow gets a reference to it
      if (asFile && (response.ok || neverError)) {
        const file = await saveWorkflowFile({
          label: "HTTP Request",
          userId,
          executionId,
          fileName: fileNameFromResponse(response, url),
          mimeType:
            response.headers.get("content-type") || "application/octet-stream",
          data: Buffer.from(await response.arrayBuffer()),
        });

        return {
          httpResponse: {
            status: response.status,
            statusText: response.statusText,
            headers: Object.fromEntries(response.headers),
            data: null,
            file,
          },
        };
      }

      const text = method === "HEAD" ? "" : await response.text();
      if (Buffer.byteLength(text) > MAX_RESPONSE_BYTES) {
        throw new NonRetriableError(
          `HTTP Request node: the response is larger than ${MAX_RESPONSE_BYTES / 1024 / 1024} MB`
        );
      }

      let responseData: unknown = text;
      if ((response.headers.get("content-type") || "").includes("json") && text) {
        try {
          responseData = JSON.parse(text);
        } catch {
          // Mislabelled response: keep the text
        }
      }

      if (!response.ok && !neverError) {
        const detail =
          typeof responseData === "string"
            ? responseData.slice(0, 500)
            : JSON.stringify(responseData).slice(0, 500);

        throw new NonRetriableError(
          `Request failed with status ${response.status} ${response.statusText}${detail ? `: ${detail}` : ""}`
        );
      }

      return {
        httpResponse: {
          status: response.status,
          statusText: response.statusText,
          headers: Object.fromEntries(response.headers),
          data: responseData,
        },
      };
    });

    return {
      ...context,
      [data.variableName]: result,
    };
  } catch (error: any) {
    if (error?.name === "TimeoutError") {
      throw new NonRetriableError(
        `HTTP Request node failed: no response within ${timeout / 1000} seconds`
      );
    }

    if (error instanceof BlockedRequestError) {
      throw new NonRetriableError(`HTTP Request node: ${error.message}`);
    }

    const cause = error?.cause?.message ? ` (${error.cause.message})` : "";

    throw new NonRetriableError(
      `HTTP Request node failed: ${error.message}${cause}`
    );
  }
};
