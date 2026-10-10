// Looks for secrets typed into the nodes of a template before it is
// published. Pure functions, so the rules can be tested without a database.

import {
  findSecretPatterns,
  hasLiteralValue,
  isSecretHeaderName,
} from "@/lib/redaction";
import type { TemplateNode } from "./template-data";

// Says where a secret is and what kind it is. Never holds the secret.
export type TemplateSecretFinding = {
  nodeId: string;
  nodeType: string;
  // The node's variable name, when it has one: tells two nodes of a type apart
  nodeName?: string;
  // The path of the field inside the node's settings: "headers", "rows[2].value"
  field: string;
  reason: string;
};

// The names a "name and value" row of a header list gives to the name
const PAIR_NAME_KEYS = ["name", "key", "header"];

const headerReason = (header: string) => `a literal value in the ${header} header`;

const scan = (
  value: unknown,
  path: string,
  report: (field: string, reason: string) => void
) => {
  if (typeof value === "string") {
    for (const reason of findSecretPatterns(value)) report(path, reason);
    return;
  }

  if (Array.isArray(value)) {
    value.forEach((item, index) => scan(item, `${path}[${index}]`, report));
    return;
  }

  if (value === null || typeof value !== "object") return;

  const entries = Object.entries(value);

  // { name: "Authorization", value: "Bearer abc" }
  const pairName = entries.find(
    ([key, inner]) => PAIR_NAME_KEYS.includes(key) && typeof inner === "string"
  )?.[1] as string | undefined;

  for (const [key, inner] of entries) {
    const field = path ? `${path}.${key}` : key;

    const header = isSecretHeaderName(key)
      ? key
      : key === "value" && pairName && isSecretHeaderName(pairName.trim())
        ? pairName.trim()
        : null;

    if (header && typeof inner === "string") {
      if (hasLiteralValue(inner)) report(field, headerReason(header));
    } else {
      scan(inner, field, report);
    }
  }
};

/**
 * Every place in a template's nodes where a secret seems to be typed in: the
 * secret shapes the log redaction knows (API keys, tokens, passwords in
 * URLs...) in any field, and any hand-typed value in an Authorization,
 * Cookie or X-API-Key header. Values made only of {{ }} expressions pass.
 */
export const scanTemplateForSecrets = (
  nodes: readonly TemplateNode[]
): TemplateSecretFinding[] => {
  const findings: TemplateSecretFinding[] = [];

  for (const node of nodes) {
    const nodeName =
      typeof node.data?.variableName === "string" && node.data.variableName.trim()
        ? node.data.variableName.trim()
        : undefined;

    const seen = new Set<string>();

    scan(node.data ?? {}, "", (field, reason) => {
      const key = `${field}\n${reason}`;
      if (seen.has(key)) return;
      seen.add(key);

      findings.push({
        nodeId: node.id,
        nodeType: node.type,
        ...(nodeName ? { nodeName } : {}),
        field: field || "(settings)",
        reason,
      });
    });
  }

  return findings;
};
