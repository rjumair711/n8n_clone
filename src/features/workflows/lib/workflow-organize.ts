// Folders and tags on the Workflows page, like n8n's. Pure rules, so they
// can be tested; the procedures are in server/folders.ts.

export const FOLDER_NAME_MAX = 60;
export const TAG_NAME_MAX = 30;
export const MAX_TAGS_PER_WORKFLOW = 10;
export const MAX_FOLDERS = 200;
export const MAX_TAGS = 200;

// The Workflows page's "folder" filter: an id, or this for "no folder"
export const NO_FOLDER = "none";

export class OrganizeError extends Error {}

const cleanName = (raw: string, what: string, max: number) => {
  const name = raw.trim().replace(/\s+/g, " ");
  if (!name) throw new OrganizeError(`The ${what} needs a name`);
  if (name.length > max) throw new OrganizeError(`A ${what} name is at most ${max} characters`);
  return name;
};

export const normalizeFolderName = (raw: string) => cleanName(raw, "folder", FOLDER_NAME_MAX);

/** Tags are short and compared without case: "Sales", "sales" are one tag. */
export const normalizeTagName = (raw: string) => cleanName(raw.replace(/^#/, ""), "tag", TAG_NAME_MAX).toLowerCase();

/** "sales, WhatsApp ,sales" -> ["sales", "whatsapp"] */
export const parseTagList = (names: string[]): string[] => {
  const unique = [...new Set(names.filter((name) => name.trim()).map(normalizeTagName))];
  if (unique.length > MAX_TAGS_PER_WORKFLOW) {
    throw new OrganizeError(`A workflow can have at most ${MAX_TAGS_PER_WORKFLOW} tags`);
  }
  return unique;
};

/** The Prisma filter for the Workflows list's folder and tag choice. */
export const workflowListFilter = ({ folder, tag }: { folder?: string; tag?: string }) => ({
  ...(folder === NO_FOLDER ? { folderId: null } : folder ? { folderId: folder } : {}),
  ...(tag ? { tags: { some: { tagId: tag } } } : {}),
});
