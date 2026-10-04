// Shared by Filter, IF and Switch. No server-only imports: dialogs use the
// operator list too.

export const CONDITION_OPERATORS = [
  { value: "equals", label: "Equals" },
  { value: "not_equals", label: "Not equals" },
  { value: "contains", label: "Contains" },
  { value: "not_contains", label: "Does not contain" },
  { value: "starts_with", label: "Starts with" },
  { value: "ends_with", label: "Ends with" },
  { value: "greater_than", label: "Greater than" },
  { value: "less_than", label: "Less than" },
  { value: "exists", label: "Exists" },
  { value: "not_exists", label: "Does not exist" },
] as const;

// Operators that ignore the comparison value
export const UNARY_OPERATORS = ["exists", "not_exists"];

export const getValueByPath = (
  object: Record<string, unknown>,
  path: string
): unknown => {
  // Accept "{{user.email}}" as well as "user.email"
  const cleanPath = path.replace(/^\s*\{\{\s*|\s*\}\}\s*$/g, "").trim();

  return cleanPath.split(".").reduce<unknown>((current, key) => {
    if (current !== null && typeof current === "object" && key in current) {
      return (current as Record<string, unknown>)[key];
    }

    return undefined;
  }, object);
};

const isPresent = (value: unknown) =>
  value !== undefined && value !== null && value !== "";

/**
 * Returns `null` when the operator is not supported, so each node can raise
 * its own error message.
 */
export const evaluateCondition = (
  actualValue: unknown,
  operator: string,
  expectedValue?: string
): boolean | null => {
  switch (operator) {
    case "equals":
      return String(actualValue) === String(expectedValue);

    case "not_equals":
      return String(actualValue) !== String(expectedValue);

    case "contains":
      return String(actualValue).includes(String(expectedValue));

    case "not_contains":
      return !String(actualValue).includes(String(expectedValue));

    case "starts_with":
      return String(actualValue).startsWith(String(expectedValue));

    case "ends_with":
      return String(actualValue).endsWith(String(expectedValue));

    case "greater_than":
      return Number(actualValue) > Number(expectedValue);

    case "less_than":
      return Number(actualValue) < Number(expectedValue);

    case "exists":
      return isPresent(actualValue);

    case "not_exists":
      return !isPresent(actualValue);

    default:
      return null;
  }
};
