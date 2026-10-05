// The logic of the Edit Fields node. Pure functions: no server-only imports.

export const FIELD_TYPES = ["string", "number", "boolean", "json"] as const;

export type FieldType = (typeof FIELD_TYPES)[number];

export type FieldAssignment = {
  // "address.city" sets a nested field
  name: string;
  type: FieldType;
  // Still a template; the node renders it before converting
  value: string;
};

/**
 * One field per line: `name = value` or `name (type) = value`. Everything
 * after the first "=" is the value, so values may contain "=".
 */
export const parseAssignments = (text: string | undefined): FieldAssignment[] => {
  const assignments: FieldAssignment[] = [];

  for (const line of (text || "").split(/\r?\n/)) {
    if (!line.trim()) continue;

    const separator = line.indexOf("=");
    if (separator === -1) {
      throw new Error(
        `Could not read "${line.trim()}". Write each field as name = value.`
      );
    }

    const match = line
      .slice(0, separator)
      .match(/^\s*([^()]+?)\s*(?:\(\s*(\w+)\s*\))?\s*$/);

    if (!match) {
      throw new Error(
        `Could not read the field name in "${line.trim()}". Write it as name = value or name (number) = value.`
      );
    }

    const type = (match[2] || "string").toLowerCase();
    if (!FIELD_TYPES.includes(type as FieldType)) {
      throw new Error(
        `Unknown type "${match[2]}" for field "${match[1]}". Use string, number, boolean or json.`
      );
    }

    assignments.push({
      name: match[1].trim(),
      type: type as FieldType,
      value: line.slice(separator + 1).trim(),
    });
  }

  return assignments;
};

export const convertFieldValue = (
  name: string,
  type: FieldType,
  value: string
): unknown => {
  switch (type) {
    case "number": {
      const number = Number(value.trim());
      if (value.trim() === "" || Number.isNaN(number)) {
        throw new Error(`Field "${name}": "${value}" is not a number`);
      }
      return number;
    }

    case "boolean":
      return /^(true|yes|1)$/i.test(value.trim());

    case "json":
      try {
        return JSON.parse(value);
      } catch {
        throw new Error(`Field "${name}": the value is not valid JSON`);
      }

    default:
      return value;
  }
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);

const UNSAFE_KEYS = new Set(["__proto__", "constructor", "prototype"]);

const splitPath = (path: string) => {
  const keys = path.split(".").map((key) => key.trim());

  if (keys.some((key) => !key || UNSAFE_KEYS.has(key))) {
    throw new Error(`"${path}" is not a valid field name`);
  }

  return keys;
};

// Copies along the path, so the input object is never changed
const setPath = (
  target: Record<string, unknown>,
  path: string,
  value: unknown
): Record<string, unknown> => {
  const [head, ...rest] = splitPath(path);

  if (rest.length === 0) return { ...target, [head]: value };

  const child = isRecord(target[head]) ? target[head] : {};

  return { ...target, [head]: setPath(child, rest.join("."), value) };
};

const getPath = (source: Record<string, unknown>, path: string): unknown =>
  splitPath(path).reduce<unknown>(
    (current, key) => (isRecord(current) ? current[key] : undefined),
    source
  );

const deletePath = (
  target: Record<string, unknown>,
  path: string
): Record<string, unknown> => {
  const [head, ...rest] = splitPath(path);

  if (rest.length === 0) {
    const { [head]: _removed, ...kept } = target;
    return kept;
  }

  return isRecord(target[head])
    ? { ...target, [head]: deletePath(target[head], rest.join(".")) }
    : target;
};

// "all" | "none" | "selected" (keep only the listed) | "except" (drop the listed)
export type IncludeMode = "all" | "none" | "selected" | "except";

/**
 * Builds the output object: start from the input's fields according to
 * `include`, rename, then set the new values (which win over both).
 */
export const applyEditFields = ({
  input,
  include,
  fieldList,
  renames,
  values,
}: {
  input: Record<string, unknown>;
  include: IncludeMode;
  // For "selected" and "except"
  fieldList: string[];
  renames: { from: string; to: string }[];
  values: { name: string; value: unknown }[];
}): Record<string, unknown> => {
  let output: Record<string, unknown> = {};

  if (include === "all") {
    output = { ...input };
  } else if (include === "selected") {
    for (const field of fieldList) {
      const value = getPath(input, field);
      if (value !== undefined) output = setPath(output, field, value);
    }
  } else if (include === "except") {
    output = { ...input };
    for (const field of fieldList) output = deletePath(output, field);
  }

  for (const { from, to } of renames) {
    // Renaming reads from the input, so it also works with "none"
    const value = getPath(input, from);
    if (value === undefined) continue;

    output = setPath(deletePath(output, from), to, value);
  }

  for (const { name, value } of values) {
    output = setPath(output, name, value);
  }

  return output;
};
