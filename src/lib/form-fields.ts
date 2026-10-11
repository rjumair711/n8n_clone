// Hosted forms: the fields of a Form Trigger, a Form node and the Wait
// node's "On Form Submitted", and the check of what was submitted. Nothing
// here touches the database, and there are no server-only imports: the
// editor and the hosted page use it too.

export const FORM_FIELD_TYPES = [
  { value: "text", label: "Text" },
  { value: "email", label: "Email" },
  { value: "number", label: "Number" },
  { value: "dropdown", label: "Dropdown" },
  { value: "date", label: "Date" },
  { value: "file", label: "File Upload" },
  { value: "checkbox", label: "Checkbox" },
] as const;

export type FormFieldType = (typeof FORM_FIELD_TYPES)[number]["value"];

export type FormField = {
  // The key of the value in the workflow data: {{form.<name>}}
  name: string;
  label: string;
  type: FormFieldType;
  required: boolean;
  // Dropdown only
  options: string[];
};

// What the hosted page shows
export type FormPage = {
  title: string;
  description: string;
  fields: FormField[];
  submitLabel: string;
  // Shown after the form was submitted, unless there is a redirect
  thankYouMessage: string;
  redirectUrl: string;
};

export const MAX_FORM_FIELDS = 30;
export const MAX_TEXT_LENGTH = 5000;
export const DEFAULT_THANK_YOU_MESSAGE = "Thank you. Your response was received.";

// Sent when a page of a waiting execution was submitted
export const FORM_SUBMITTED_EVENT = "workflows/form.submitted";

// Execution.waitingFor: a page is shown, then it was submitted
export const WAITING_FOR_FORM = "form";
export const WAITING_FOR_FORM_SUBMITTED = "form-submitted";

const isFieldType = (value: unknown): value is FormFieldType =>
  FORM_FIELD_TYPES.some((type) => type.value === value);

/**
 * "Your name" -> "your_name". Field values are read by this name, so it
 * only has letters, digits and underscores and never starts with a digit.
 */
export const toFieldName = (label: string): string => {
  const name = label
    .normalize("NFKD")
    .replace(/[^\x20-\x7e]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40);

  if (!name) return "field";

  return /^\d/.test(name) ? `field_${name}` : name;
};

const splitOptions = (value: unknown): string[] => {
  const list = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? value.split(/[\n,]/)
      : [];

  return [
    ...new Set(
      list
        .map((option) => String(option ?? "").trim().slice(0, 200))
        .filter(Boolean)
    ),
  ].slice(0, 100);
};

/**
 * The fields as they are saved on a node (a JSON string, or the list
 * itself) read into a clean list: entries without a label are dropped,
 * unknown types become text, and every field gets a name of its own.
 */
export const parseFormFields = (value: unknown): FormField[] => {
  let entries: unknown = value;

  if (typeof value === "string") {
    try {
      entries = value.trim() ? JSON.parse(value) : [];
    } catch {
      return [];
    }
  }

  if (!Array.isArray(entries)) return [];

  const taken = new Set<string>();
  const fields: FormField[] = [];

  for (const entry of entries.slice(0, MAX_FORM_FIELDS)) {
    if (!entry || typeof entry !== "object") continue;

    const raw = entry as Record<string, unknown>;
    const label = String(raw.label ?? "").trim().slice(0, 200);
    if (!label) continue;

    const base = toFieldName(label);
    let name = base;
    for (let suffix = 2; taken.has(name); suffix++) name = `${base}_${suffix}`;
    taken.add(name);

    const type = isFieldType(raw.type) ? raw.type : "text";

    fields.push({
      name,
      label,
      type,
      required: raw.required === true || raw.required === "true",
      options: type === "dropdown" ? splitOptions(raw.options) : [],
    });
  }

  return fields;
};

// A row of the editor: like a field, with the options still as typed
export type FormFieldEntry = {
  label: string;
  type: FormFieldType;
  required: boolean;
  options: string;
};

export const readFormFieldEntries = (value: string): FormFieldEntry[] => {
  try {
    const parsed = value.trim() ? JSON.parse(value) : [];
    if (!Array.isArray(parsed)) return [];

    return parsed
      .filter((entry) => entry && typeof entry === "object")
      .map((entry) => ({
        label: String(entry.label ?? ""),
        type: isFieldType(entry.type) ? entry.type : "text",
        required: entry.required === true,
        options: Array.isArray(entry.options)
          ? entry.options.join(", ")
          : String(entry.options ?? ""),
      }));
  } catch {
    return [];
  }
};

// Rows that were left without a label are dropped when the dialog saves
export const cleanFormFields = (value: string): string =>
  JSON.stringify(
    readFormFieldEntries(value)
      .filter((entry) => entry.label.trim())
      .slice(0, MAX_FORM_FIELDS)
  );

/**
 * The problem with a list of fields that cannot be shown as a form, or
 * null. Checked when a run reaches a form, and by the hosted page.
 */
export const getFormFieldsProblem = (fields: FormField[]): string | null => {
  if (fields.length === 0) return "the form has no fields";

  const emptyDropdown = fields.find(
    (field) => field.type === "dropdown" && field.options.length === 0
  );

  return emptyDropdown
    ? `the dropdown "${emptyDropdown.label}" has no options`
    : null;
};

const cleanRedirect = (value: string) => {
  const url = value.trim();

  return /^https?:\/\//i.test(url) ? url.slice(0, 2000) : "";
};

/**
 * A node's settings as the page the hosted form shows. `render` fills in
 * {{variables}} for the pages a running workflow shows; a Form Trigger's
 * page is shown before any run exists, so it has none.
 */
export const buildFormPage = (
  data: Record<string, unknown>,
  render: (text: string) => string = (text) => text
): FormPage => {
  const text = (value: unknown, limit: number) =>
    render(String(value ?? "")).trim().slice(0, limit);

  return {
    title: text(data.formTitle, 200) || "Form",
    description: text(data.formDescription, 2000),
    fields: parseFormFields(data.formFields),
    submitLabel: text(data.submitLabel, 60) || "Submit",
    thankYouMessage: text(data.thankYouMessage, 2000) || DEFAULT_THANK_YOU_MESSAGE,
    redirectUrl:
      data.afterSubmit === "redirect" ? cleanRedirect(text(data.redirectUrl, 2000)) : "",
  };
};

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

const isRealDate = (value: string) => {
  if (!DATE.test(value)) return false;

  const date = new Date(`${value}T00:00:00Z`);

  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
};

export type FormValue = string | number | boolean | null;

/**
 * Checks what was submitted against the form's fields. Only the form's own
 * fields are read: anything else that was sent is ignored. File fields are
 * checked by whether a file came with them; the files themselves are
 * stored by the caller.
 */
export const validateFormValues = (
  fields: FormField[],
  raw: Record<string, string | undefined>,
  // Names of the file fields a file was uploaded for
  uploaded: ReadonlySet<string> = new Set()
): { values: Record<string, FormValue>; errors: Record<string, string> } => {
  const values: Record<string, FormValue> = {};
  const errors: Record<string, string> = {};

  for (const field of fields) {
    const text = (raw[field.name] ?? "").trim();

    if (field.type === "checkbox") {
      const checked = text === "on" || text === "true" || text === "1";
      values[field.name] = checked;
      if (field.required && !checked) errors[field.name] = "This box has to be ticked";
      continue;
    }

    if (field.type === "file") {
      // Replaced by the stored file's reference once it is saved
      values[field.name] = null;
      if (field.required && !uploaded.has(field.name)) {
        errors[field.name] = "A file is required";
      }
      continue;
    }

    if (!text) {
      values[field.name] = null;
      if (field.required) errors[field.name] = "This field is required";
      continue;
    }

    if (text.length > MAX_TEXT_LENGTH) {
      errors[field.name] = `At most ${MAX_TEXT_LENGTH} characters`;
      continue;
    }

    switch (field.type) {
      case "email":
        if (!EMAIL.test(text) || text.length > 254) {
          errors[field.name] = "Enter an email address";
        } else {
          values[field.name] = text;
        }
        break;

      case "number": {
        const number = Number(text);

        if (!Number.isFinite(number)) {
          errors[field.name] = "Enter a number";
        } else {
          values[field.name] = number;
        }
        break;
      }

      case "dropdown":
        if (!field.options.includes(text)) {
          errors[field.name] = "Choose one of the options";
        } else {
          values[field.name] = text;
        }
        break;

      case "date":
        if (!isRealDate(text)) {
          errors[field.name] = "Enter a date";
        } else {
          values[field.name] = text;
        }
        break;

      default:
        values[field.name] = text;
    }
  }

  return { values, errors };
};

/**
 * Sample values in the shape a submission has, for the editor's test run.
 */
export const buildSampleFormValues = (fields: FormField[]): Record<string, FormValue> =>
  Object.fromEntries(
    fields.map((field): [string, FormValue] => {
      switch (field.type) {
        case "email":
          return [field.name, "ali@example.com"];
        case "number":
          return [field.name, 42];
        case "dropdown":
          return [field.name, field.options[0] ?? null];
        case "date":
          return [field.name, "2026-01-15"];
        case "checkbox":
          return [field.name, true];
        case "file":
          return [field.name, null];
        default:
          return [field.name, `Sample ${field.label}`];
      }
    })
  );
