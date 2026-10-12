// "Build with AI": the catalogue of node types that is sent to the model.
// It is made from the node registry (src/config/node-components.ts), the
// node selector's labels and descriptions, and each node's settings. No
// React and no server-only imports: the editor builds the catalogue, the
// server checks the model's answer against it, and the tests run it too.

import z from "zod";
import type {
  IntegrationConfig,
  IntegrationField,
} from "@/features/executions/components/integration-dialog";
import { getNodeLabel } from "@/config/node-labels";
import { isPrivateKey } from "./private-keys";

export type CataloguePort = {
  id: string;
  label: string;
  // For a sub-port: the node types that can be plugged into it. Absent:
  // any node
  accepts?: string[];
};

export type CatalogueField = {
  name: string;
  label?: string;
  // "text", "textarea", "select", "switch" ("true" / "false"), "number",
  // "boolean", "json" (a JSON string) or "list" (a real JSON array)
  type: string;
  description?: string;
  example?: string;
  // The values a select accepts
  options?: string[];
  required?: boolean;
  default?: string | number | boolean;
  // The field only matters for these operations
  operations?: string[];
  // The field depends on another field in a way the catalogue cannot say
  conditional?: boolean;
};

export type CatalogueNode = {
  type: string;
  label: string;
  description: string;
  category: string;
  trigger: boolean;
  // The stored credential the user has to pick; never filled in by the model
  credential?: string;
  credentialOptional?: boolean;
  // Other settings only the user can fill in: secrets, their own workflows
  userConfigured?: string[];
  // Later nodes read the result at {{<variableName>...}}
  variableName?: string;
  operations?: { value: string; label: string }[];
  fields: CatalogueField[];
  inputs: CataloguePort[];
  outputs: CataloguePort[];
  // How the outputs follow from the settings, for nodes where they do
  dynamicOutputs?: string;
  // What the result looks like, and anything else worth knowing
  notes?: string;
  // Every setting is saved as a string (nodes made from an integration
  // config): numbers and booleans from the model are turned into strings
  stringValues?: boolean;
};

// The handles every ordinary node has (see base-execution-node.tsx)
export const MAIN_INPUT: CataloguePort = { id: "target-1", label: "Main" };
export const MAIN_OUTPUT: CataloguePort = { id: "source-1", label: "Main" };

const MODEL_TYPES = [
  "OPENAI",
  "ANTHROPIC",
  "GEMINI",
  "CHAT_MODEL",
  "DEEPSEEK",
  "KIMI",
  "QWEN",
];

// What may be plugged into a sub-port, by port id. A port that is not
// listed (Tools) takes any node.
export const SUB_PORT_ACCEPTS: Record<string, string[]> = {
  "sub-model": [...MODEL_TYPES, "MODEL_ROUTER"],
  // The Model Router's own ports take a model, not another router
  "sub-model-cheap": MODEL_TYPES,
  "sub-model-strong": MODEL_TYPES,
  "sub-memory": ["BUFFER_MEMORY", "POSTGRES_MEMORY"],
  "sub-parser": ["STRUCTURED_OUTPUT_PARSER"],
};

const withAccepts = (port: { id: string; label: string }): CataloguePort => ({
  id: port.id,
  label: port.label,
  ...(SUB_PORT_ACCEPTS[port.id] ? { accepts: SUB_PORT_ACCEPTS[port.id] } : {}),
});

/**
 * A node whose dialog is written by hand: its settings cannot be read from
 * a config, so they are written down in manual-specs.ts.
 */
export type ManualSpec = {
  trigger?: boolean;
  credential?: string;
  credentialOptional?: boolean;
  userConfigured?: string[];
  variableName?: string;
  operations?: { value: string; label: string }[];
  fields: CatalogueField[];
  inputs?: CataloguePort[];
  outputs?: CataloguePort[];
  dynamicOutputs?: string;
  notes?: string;
};

export type SelectorOption = {
  type: string;
  label: string;
  description: string;
  category: string;
};

// The most the server accepts of each part of the catalogue (see
// catalogueSchema below). The catalogue is cut to these when it is built,
// so a node with a very long description or option list is shortened
// instead of making every request fail.
const LIMITS = {
  nodes: 300,
  fields: 80,
  options: 120,
  operations: 60,
  ports: 20,
  userConfigured: 20,
  name: 80,
  label: 120,
  description: 300,
  fieldDescription: 320,
  example: 160,
  default: 400,
  notes: 600,
};

const cut = (text: string | undefined, max: number, keepLines = false) => {
  const clean = keepLines
    ? (text ?? "").replace(/[ \t]+/g, " ").replace(/\s*\n\s*/g, "\n").trim()
    : (text ?? "").replace(/\s+/g, " ").trim();
  if (!clean) return undefined;

  return clean.length > max ? `${clean.slice(0, max - 3)}...` : clean;
};

const FIELD_TYPES: Record<string, string> = {
  text: "text",
  textarea: "textarea",
  select: "select",
  switch: "switch",
  model: "text",
  // Saved as JSON strings (see fallback-models-field.tsx, form-fields.ts)
  fallbacks: "json",
  formFields: "json",
};

const FORM_FIELDS_NOTE =
  'A JSON string: [{"label":"Your name","type":"text","required":true,"options":""}]. type is text, email, number, dropdown, date, file or checkbox; options is a comma-separated list for a dropdown. A value is read at {{form.<label in camelCase>}}.';

const toCatalogueField = (field: IntegrationField): CatalogueField | null => {
  const type = FIELD_TYPES[field.type ?? "text"];
  // "credential" and "workflow" fields point at something in the user's
  // account, and a private key is a secret
  if (!type || isPrivateKey(field.name)) return null;

  return {
    name: field.name,
    label: field.label,
    type,
    description:
      field.type === "formFields"
        ? FORM_FIELDS_NOTE
        : field.description,
    example: field.type === "formFields" ? undefined : field.placeholder,
    options:
      field.type === "switch"
        ? ["true", "false"]
        : field.options?.map((option) => option.value),
    // A field shown only for some values of another field is not
    // "required" in a way that can be checked here
    required: field.required && !field.showWhen ? true : undefined,
    default: field.defaultValue || undefined,
    operations: field.operations,
    conditional: field.showWhen ? true : undefined,
  };
};

const fromConfig = (
  config: IntegrationConfig
): ManualSpec & { stringValues: true } => {
  const userConfigured = config.fields
    .filter((field) => !toCatalogueField(field))
    .map((field) => field.label);

  let outputs: CataloguePort[] = [MAIN_OUTPUT];
  if (config.getOutputs) {
    try {
      outputs = config.getOutputs({}).map(({ id, label }) => ({ id, label }));
    } catch {
      // Outputs that need settings to exist are described by dynamicOutputs
    }
  }

  return {
    trigger: config.trigger === true,
    credential:
      config.credentialType ??
      (config.credentialTypeFor ? "depends on the settings" : undefined),
    credentialOptional: config.credentialOptional,
    userConfigured,
    variableName: config.defaultVariableName,
    operations: config.operations,
    fields: config.fields.flatMap((field) => toCatalogueField(field) ?? []),
    inputs: config.trigger
      ? []
      : [MAIN_INPUT, ...(config.subInputs ?? []).map(withAccepts)],
    outputs,
    notes: config.hint,
    stringValues: true,
  };
};

// Outputs that follow from a node's settings
const DYNAMIC_OUTPUTS: Record<string, string> = {
  TEXT_CLASSIFIER:
    'One output per line of "categories": its id is "category-" plus the category name in lower case with dashes (Billing question -> category-billing-question). "other" is always there.',
};

const fitField = (field: CatalogueField): CatalogueField => ({
  ...field,
  label: cut(field.label, LIMITS.label),
  description: cut(field.description, LIMITS.fieldDescription),
  // Many fields take one entry per line: the example has to show that
  example: cut(field.example, LIMITS.example, true),
  // An option that long is not one a model could pick by reading it
  options: field.options
    ?.filter((option) => option.length <= LIMITS.label)
    .slice(0, LIMITS.options),
  default:
    typeof field.default === "string"
      ? field.default.length > LIMITS.default
        ? undefined
        : field.default
      : field.default,
});

// Never offered to the model: the empty canvas's placeholder
const HIDDEN_TYPES = new Set(["INITIAL"]);

/**
 * The catalogue: one entry per node type in the registry.
 *
 * `types` are the registry's keys, `options` the node selector's entries,
 * `configs` the integration config of each node that is made from one, and
 * `manual` the hand-written specs of the others. A type with neither still
 * gets an entry (name and description only), so a node added without a
 * spec can be used, just not configured, by the model.
 */
export const buildNodeCatalogue = ({
  types,
  options,
  configs,
  manual,
}: {
  types: string[];
  options: SelectorOption[];
  configs: Record<string, IntegrationConfig | undefined>;
  manual: Record<string, ManualSpec | undefined>;
}): CatalogueNode[] => {
  const optionByType = new Map(options.map((option) => [option.type, option]));

  return types
    .filter((type) => !HIDDEN_TYPES.has(type))
    .slice(0, LIMITS.nodes)
    .map((type): CatalogueNode => {
      const option = optionByType.get(type);
      const config = configs[type];
      const spec = manual[type];
      const fromSettings = spec ?? (config ? fromConfig(config) : undefined);
      const trigger = fromSettings?.trigger === true;

      const node: CatalogueNode = {
        type,
        label:
          cut(option?.label ?? config?.label, LIMITS.label) ?? getNodeLabel(type),
        description:
          cut(option?.description ?? config?.description, LIMITS.description) ?? "",
        category: option?.category ?? "Other",
        trigger,
        credential: cut(fromSettings?.credential, LIMITS.label),
        credentialOptional: fromSettings?.credentialOptional || undefined,
        userConfigured: fromSettings?.userConfigured?.length
          ? fromSettings.userConfigured
              .slice(0, LIMITS.userConfigured)
              .map((item) => cut(item, LIMITS.label) ?? "")
          : undefined,
        variableName: fromSettings?.variableName,
        operations: fromSettings?.operations?.slice(0, LIMITS.operations),
        fields: (fromSettings?.fields ?? []).slice(0, LIMITS.fields).map(fitField),
        inputs: (fromSettings?.inputs ?? (trigger ? [] : [MAIN_INPUT])).slice(0, LIMITS.ports),
        outputs: (fromSettings?.outputs ?? [MAIN_OUTPUT]).slice(0, LIMITS.ports),
        dynamicOutputs: cut(
          fromSettings?.dynamicOutputs ?? DYNAMIC_OUTPUTS[type],
          LIMITS.fieldDescription
        ),
        notes: cut(fromSettings?.notes, LIMITS.notes),
        stringValues: !spec && config ? true : undefined,
      };

      // JSON.stringify drops undefined, so the catalogue stays small
      return JSON.parse(JSON.stringify(node)) as CatalogueNode;
    });
};

// ---------------------------------------------------------------------------
// The catalogue arrives from the browser, so its shape is checked. What it
// says is not trusted for anything but the prompt and the check of the
// model's answer: which node types exist and which the user's plan allows
// is decided on the server (see server/routers.ts).

// Names (a type, a field, an option value, a port id) are short by nature;
// the bound only stops a request from carrying megabytes
const name = z.string().max(200);

const portSchema = z.object({
  id: name.min(1),
  label: name,
  accepts: z.array(name).max(40).optional(),
});

const fieldSchema = z.object({
  name: name.min(1),
  label: z.string().max(LIMITS.label).optional(),
  type: name,
  description: z.string().max(LIMITS.fieldDescription).optional(),
  example: z.string().max(LIMITS.example).optional(),
  options: z.array(z.string().max(LIMITS.label)).max(LIMITS.options).optional(),
  required: z.boolean().optional(),
  default: z
    .union([z.string().max(LIMITS.default), z.number(), z.boolean()])
    .optional(),
  operations: z.array(name).max(200).optional(),
  conditional: z.boolean().optional(),
});

export const catalogueNodeSchema = z.object({
  type: name.min(1),
  label: name,
  description: z.string().max(LIMITS.description),
  category: name,
  trigger: z.boolean(),
  credential: z.string().max(LIMITS.label).optional(),
  credentialOptional: z.boolean().optional(),
  userConfigured: z
    .array(z.string().max(LIMITS.label))
    .max(LIMITS.userConfigured)
    .optional(),
  variableName: name.optional(),
  operations: z
    .array(z.object({ value: name, label: name }))
    .max(LIMITS.operations)
    .optional(),
  fields: z.array(fieldSchema).max(LIMITS.fields),
  inputs: z.array(portSchema).max(LIMITS.ports),
  outputs: z.array(portSchema).max(LIMITS.ports),
  dynamicOutputs: z.string().max(LIMITS.fieldDescription).optional(),
  notes: z.string().max(LIMITS.notes).optional(),
  stringValues: z.boolean().optional(),
});

export const catalogueSchema = z
  .array(catalogueNodeSchema)
  .min(1)
  .max(LIMITS.nodes);
