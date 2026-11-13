// What an account may set as its name. No server imports: the Profile form
// and the auth hook that checks /update-user both read it.

export const MAX_NAME_LENGTH = 80;

/**
 * Why a name sent to /update-user is refused, or null when it is fine (or
 * the request does not change the name).
 */
export const getNameProblem = (body: unknown): string | null => {
  if (!body || typeof body !== "object" || !("name" in body)) return null;

  const name = (body as { name?: unknown }).name;

  if (typeof name !== "string" || !name.trim()) return "Your name cannot be empty.";
  if (name.trim().length > MAX_NAME_LENGTH) return `Use at most ${MAX_NAME_LENGTH} characters for your name.`;
  // One line: a name is shown in the sidebar, emails and the audit log
  if (/[\r\n\t]/.test(name)) return "Your name has to be on one line.";

  return null;
};
