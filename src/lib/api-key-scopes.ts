// What an API key may do. Used by the /api/v1 routes, the API Keys page and
// the tests: keep this file free of server-only imports.

export const API_SCOPES = [
    "workflows:read",
    "workflows:execute",
    "executions:read",
    "executions:retry",
] as const;

export type ApiScope = (typeof API_SCOPES)[number];

export const API_SCOPE_DESCRIPTIONS: Record<ApiScope, string> = {
    "workflows:read": "List your workflows",
    "workflows:execute": "Run a workflow",
    "executions:read": "Read executions and their output",
    "executions:retry": "Run an execution again",
};

// Known scopes only, each once, in the order of API_SCOPES
export const normalizeScopes = (scopes: readonly unknown[]): ApiScope[] =>
    API_SCOPES.filter((scope) => scopes.includes(scope));

export const hasScope = (granted: readonly string[], scope: ApiScope) =>
    granted.includes(scope);

export const missingScopeMessage = (scope: ApiScope) =>
    `This API key is missing the scope '${scope}'. Create a key that includes it.`;

// A key without an expiry date never expires
export const isKeyExpired = (
    expiresAt: Date | string | null | undefined,
    now: Date = new Date()
) => !!expiresAt && new Date(expiresAt).getTime() <= now.getTime();

/**
 * The moment a key stops working, from the date picked on the API Keys page
 * ("2026-12-31"): the end of that day, UTC. Empty means no expiry. Throws on
 * a date that is not valid or not in the future.
 */
export const parseExpiryDate = (
    value: string | null | undefined,
    now: Date = new Date()
): Date | null => {
    const text = (value ?? "").trim();
    if (!text) return null;

    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
    const expiresAt = match ? new Date(`${text}T23:59:59.999Z`) : null;

    // "2026-02-31" must not roll over into March
    if (
        !match ||
        !expiresAt ||
        Number.isNaN(expiresAt.getTime()) ||
        expiresAt.getUTCDate() !== Number(match[3])
    ) {
        throw new Error("The expiry date must be a date like 2026-12-31.");
    }

    if (expiresAt.getTime() <= now.getTime()) {
        throw new Error("The expiry date must be in the future.");
    }

    return expiresAt;
};
