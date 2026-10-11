import { NonRetriableError } from "inngest";
import {
  MAX_FILE_BYTES,
  saveWorkflowFile,
  type FileReference,
} from "@/lib/workflow-files";
import {
  validateFormValues,
  type FormField,
  type FormValue,
} from "@/lib/form-fields";

// One megabyte for everything that is not a file
const TEXT_ALLOWANCE_BYTES = 1024 * 1024;

export type SubmittedValue = FormValue | FileReference;

export type SubmissionResult =
  | { ok: true; values: Record<string, SubmittedValue> }
  | { ok: false; status: number; error: string; errors?: Record<string, string> };

/**
 * The largest request a form with these fields may send: every file field
 * at the file size limit, plus room for the text. Checked against
 * Content-Length before the body is read.
 */
export const getMaxSubmissionBytes = (fields: FormField[]) =>
  fields.filter((field) => field.type === "file").length * MAX_FILE_BYTES +
  TEXT_ALLOWANCE_BYTES;

/**
 * Reads the body of a submitted form (multipart/form-data or urlencoded),
 * unless it says it is larger than the form allows.
 */
export const readFormData = async (
  request: Request,
  fields: FormField[]
): Promise<
  { ok: true; form: FormData } | { ok: false; status: number; error: string }
> => {
  const declared = Number(request.headers.get("content-length"));

  if (Number.isFinite(declared) && declared > getMaxSubmissionBytes(fields)) {
    return { ok: false, status: 413, error: "The form is too large to submit" };
  }

  try {
    return { ok: true, form: await request.formData() };
  } catch {
    return { ok: false, status: 400, error: "The form could not be read" };
  }
};

/**
 * Checks a submitted form against the form's fields and stores its files. The files are stored like
 * every other workflow file, for the workflow's owner, with the same limits
 * (size per file, the owner's storage, removal after the retention period).
 *
 * Nothing is stored unless the whole submission is valid.
 */
export const readFormSubmission = async ({
  form,
  fields,
  userId,
  executionId,
}: {
  form: FormData;
  fields: FormField[];
  // The workflow's owner
  userId: string;
  executionId?: string;
}): Promise<SubmissionResult> => {
  const raw: Record<string, string | undefined> = {};
  const files = new Map<string, File>();

  for (const field of fields) {
    const entry = form.get(field.name);

    if (field.type === "file") {
      // A browser sends an empty file for a file input that was left empty
      if (entry instanceof File && entry.size > 0) files.set(field.name, entry);
    } else if (typeof entry === "string") {
      raw[field.name] = entry;
    }
  }

  const { values, errors } = validateFormValues(fields, raw, new Set(files.keys()));

  for (const [name, file] of files) {
    if (file.size > MAX_FILE_BYTES) {
      errors[name] = `The file is too large. The limit is ${Math.round(MAX_FILE_BYTES / 1024 / 1024)} MB`;
    }
  }

  if (Object.keys(errors).length > 0) {
    return {
      ok: false,
      status: 400,
      error: "Some fields need your attention",
      errors,
    };
  }

  const stored: Record<string, SubmittedValue> = { ...values };

  for (const [name, file] of files) {
    try {
      stored[name] = await saveWorkflowFile({
        label: "Form",
        userId,
        executionId,
        fileName: file.name || "upload",
        mimeType: file.type || "application/octet-stream",
        data: Buffer.from(await file.arrayBuffer()),
      });
    } catch (error) {
      // The size limit or the owner's storage being full. Not the
      // visitor's doing, and not something to explain to them in detail.
      if (error instanceof NonRetriableError) {
        return {
          ok: false,
          status: 413,
          error: "The file could not be stored",
          errors: { [name]: "This file could not be stored. Try a smaller one." },
        };
      }

      throw error;
    }
  }

  return { ok: true, values: stored };
};
