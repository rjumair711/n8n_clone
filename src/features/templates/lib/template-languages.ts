// The languages a template can be written in. No server imports: the
// gallery uses it too.

export const TEMPLATE_LANGUAGES = [
  { value: "en", label: "English", dir: "ltr" },
  { value: "ur", label: "اردو (Urdu)", dir: "rtl" },
  { value: "ar", label: "العربية (Arabic)", dir: "rtl" },
] as const;

export type TemplateLanguage = (typeof TEMPLATE_LANGUAGES)[number]["value"];

export const TEMPLATE_LANGUAGE_CODES = TEMPLATE_LANGUAGES.map(
  (language) => language.value
) as [TemplateLanguage, ...TemplateLanguage[]];

// What a template without a language is: every template made before the
// field existed is English
export const DEFAULT_TEMPLATE_LANGUAGE: TemplateLanguage = "en";

export const isTemplateLanguage = (value: unknown): value is TemplateLanguage =>
  TEMPLATE_LANGUAGES.some((language) => language.value === value);

/**
 * A stored language as one of the known ones: a value the app does not know
 * (a row written by hand) is shown as English, not hidden.
 */
export const getTemplateLanguage = (value: unknown) =>
  TEMPLATE_LANGUAGES.find((language) => language.value === value) ?? TEMPLATE_LANGUAGES[0];
