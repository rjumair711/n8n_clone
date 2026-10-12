// Git sync: the settings a workspace has for it, and what they may hold.
// No server imports: the settings page uses the same checks.

export const WORKSPACE_ENVIRONMENTS = ["development", "production"] as const;

export type WorkspaceEnvironment = (typeof WORKSPACE_ENVIRONMENTS)[number];

export const isWorkspaceEnvironment = (value: unknown): value is WorkspaceEnvironment =>
  (WORKSPACE_ENVIRONMENTS as readonly unknown[]).includes(value);

export const ENVIRONMENT_LABELS: Record<WorkspaceEnvironment, string> = {
  development: "Development",
  production: "Production",
};

export const WORKFLOW_FILE_FORMAT = 1;
export const GIT_MAX_WORKFLOWS = 300;
export const GIT_MAX_FILE_BYTES = 1024 * 1024;

// "owner/name"
// The name becomes part of the address that is called at GitHub: an owner
// and a repository as GitHub names them, and never "." or ".."
export const isRepoName = (value: string) => {
  const [owner, name, ...rest] = value.split("/");

  return (
    rest.length === 0 &&
    /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/.test(owner ?? "") &&
    /^[A-Za-z0-9_.-]{1,100}$/.test(name ?? "") &&
    name !== "." &&
    name !== ".."
  );
};

// A branch name Git accepts, without the forms that mean something else
export const isBranchName = (value: string) =>
  /^[A-Za-z0-9._/-]{1,200}$/.test(value) &&
  !value.includes("..") &&
  !value.startsWith("/") &&
  !value.endsWith("/") &&
  !value.endsWith(".lock");

// The folder in the repository: plain names, no way out of it
export const isFolderPath = (value: string) =>
  /^[A-Za-z0-9._/-]{1,200}$/.test(value) &&
  !value.startsWith("/") &&
  !value.endsWith("/") &&
  value.split("/").every((part) => part !== "" && part !== "." && part !== "..");
