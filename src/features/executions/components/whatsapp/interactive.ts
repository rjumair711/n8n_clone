// WhatsApp interactive messages: reply buttons (up to 3) and list menus
// (up to 10 rows). Built from plain lines so a template can fill them:
//
//   Buttons:  yes | Yes, book it        (id | title, or just a title)
//   List:     # Haircuts                (a line starting with # opens a section)
//             cut | Haircut | 30 min, Rs 800
//
// When the customer taps one, the WhatsApp Trigger gives its title as
// {{whatsapp.text}} and its id as {{whatsapp.replyId}}.
// Limits are Meta's: https://developers.facebook.com/docs/whatsapp/cloud-api/messages/interactive-reply-buttons-messages

export const WHATSAPP_LIMITS = {
  body: 1024,
  header: 60,
  footer: 60,
  buttons: 3,
  buttonTitle: 20,
  listButton: 20,
  rows: 10,
  sections: 10,
  rowTitle: 24,
  rowDescription: 72,
  sectionTitle: 24,
  id: 200,
} as const;

const tooLong = (label: string, text: string, max: number) =>
  new Error(`${label} "${text}" is ${[...text].length} characters; WhatsApp allows ${max}`);

const length = (text: string) => [...text].length;

const check = (label: string, text: string, max: number) => {
  if (length(text) > max) throw tooLong(label, text, max);
  return text;
};

// An id made from the title when none is given: "Yes, book it" -> "yes_book_it"
export const slugId = (title: string): string =>
  title
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\p{L}\p{N}]+/gu, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, WHATSAPP_LIMITS.id) || "option";

const splitLine = (line: string) => line.split("|").map((part) => part.trim());

const lines = (text: string | undefined) =>
  (text ?? "").split(/\r?\n/).map((line) => line.trim()).filter(Boolean);

const uniqueIds = (ids: string[]) => {
  const seen = new Set<string>();
  for (const id of ids) {
    if (seen.has(id)) throw new Error(`Two options have the id "${id}"; each must be different`);
    seen.add(id);
  }
};

export type ReplyButton = { id: string; title: string };

export const parseButtons = (text: string | undefined): ReplyButton[] => {
  const buttons = lines(text).map((line) => {
    const parts = splitLine(line);
    const [id, title] = parts.length >= 2 ? [parts[0], parts.slice(1).join(" | ")] : [slugId(parts[0]), parts[0]];
    if (!title) throw new Error(`Button "${line}" has no title`);
    return { id: check("Button id", id || slugId(title), WHATSAPP_LIMITS.id), title: check("Button title", title, WHATSAPP_LIMITS.buttonTitle) };
  });
  if (buttons.length === 0) throw new Error("Add at least one button, one per line");
  if (buttons.length > WHATSAPP_LIMITS.buttons) {
    throw new Error(`WhatsApp allows ${WHATSAPP_LIMITS.buttons} reply buttons; there are ${buttons.length}. Use a List Menu for more`);
  }
  uniqueIds(buttons.map((button) => button.id));
  return buttons;
};

export type ListSection = { title?: string; rows: { id: string; title: string; description?: string }[] };

export const parseListSections = (text: string | undefined): ListSection[] => {
  const sections: ListSection[] = [];
  for (const line of lines(text)) {
    if (line.startsWith("#")) {
      const title = line.replace(/^#+/, "").trim();
      sections.push({ title: check("Section title", title, WHATSAPP_LIMITS.sectionTitle), rows: [] });
      continue;
    }
    if (sections.length === 0) sections.push({ rows: [] });
    const parts = splitLine(line);
    // "title" | "id | title" | "id | title | description"
    const [id, title, description] =
      parts.length === 1 ? [slugId(parts[0]), parts[0], ""] : [parts[0] || slugId(parts[1]), parts[1], parts.slice(2).join(" | ")];
    if (!title) throw new Error(`Row "${line}" has no title`);
    sections[sections.length - 1].rows.push({
      id: check("Row id", id, WHATSAPP_LIMITS.id),
      title: check("Row title", title, WHATSAPP_LIMITS.rowTitle),
      ...(description ? { description: check("Row description", description, WHATSAPP_LIMITS.rowDescription) } : {}),
    });
  }

  const filled = sections.filter((section) => section.rows.length > 0);
  const rowCount = filled.reduce((sum, section) => sum + section.rows.length, 0);
  if (rowCount === 0) throw new Error("Add at least one row, one per line");
  if (rowCount > WHATSAPP_LIMITS.rows) throw new Error(`WhatsApp allows ${WHATSAPP_LIMITS.rows} rows in a list; there are ${rowCount}`);
  if (filled.length > 1 && filled.some((section) => !section.title)) {
    throw new Error("With more than one section, every section needs a title (a line starting with #)");
  }
  uniqueIds(filled.flatMap((section) => section.rows.map((row) => row.id)));
  return filled;
};

type Common = { body: string; header?: string; footer?: string };

const common = ({ body, header, footer }: Common) => {
  if (!body) throw new Error("Message is required");
  check("Message", body, WHATSAPP_LIMITS.body);
  return {
    ...(header ? { header: { type: "text", text: check("Header", header, WHATSAPP_LIMITS.header) } } : {}),
    body: { text: body },
    ...(footer ? { footer: { text: check("Footer", footer, WHATSAPP_LIMITS.footer) } } : {}),
  };
};

/** The `interactive` payload of a reply-button message. */
export const buildButtonsMessage = (options: Common & { buttons: string }) => ({
  type: "interactive",
  interactive: {
    type: "button",
    ...common(options),
    action: {
      buttons: parseButtons(options.buttons).map((button) => ({ type: "reply", reply: button })),
    },
  },
});

/** The `interactive` payload of a list menu. */
export const buildListMessage = (options: Common & { listButton: string; sections: string }) => {
  const button = options.listButton || "Choose";
  return {
    type: "interactive",
    interactive: {
      type: "list",
      ...common(options),
      action: {
        button: check("Menu button", button, WHATSAPP_LIMITS.listButton),
        sections: parseListSections(options.sections),
      },
    },
  };
};

/** The id of the button or row a customer tapped, from a webhook message. */
export const replyIdOf = (message: any): string | undefined =>
  message?.interactive?.button_reply?.id ??
  message?.interactive?.list_reply?.id ??
  // Quick-reply buttons of a template message
  message?.button?.payload ??
  undefined;
