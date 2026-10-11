import { toTemplateData, type TemplateConnection, type TemplateNode } from "./template-data";

// Templates that ship with the app. They are put into the template gallery
// by migrations: each group below was added by one
// (prisma/migrations/*_analyze_document, *_shopify_woocommerce), which holds
// exactly what `buildSeedSql(<the group>)` returns; a test compares the two.
// To change a template, add a new migration: an applied one is never edited.

export type BuiltinTemplate = {
  // Fixed, so the migration's INSERT can be run twice
  id: string;
  name: string;
  description: string;
  category: string;
  nodes: TemplateNode[];
  connections: TemplateConnection[];
};

// The handles of an ordinary connection, and of a model plugged into a
// node's Model port
const flow = (fromNodeId: string, toNodeId: string): TemplateConnection => ({
  fromNodeId,
  toNodeId,
  fromOutput: "source-1",
  toInput: "target-1",
});

const model = (fromNodeId: string, toNodeId: string): TemplateConnection => ({
  fromNodeId,
  toNodeId,
  fromOutput: "source-1",
  toInput: "sub-model",
});

const fields = (list: { label: string; type: string; required?: boolean }[]) =>
  JSON.stringify(
    list.map((field) => ({
      label: field.label,
      type: field.type,
      required: field.required === true,
      options: "",
    }))
  );

const INVOICE_TO_SHEETS: BuiltinTemplate = {
  id: "tpl_invoice_to_google_sheets",
  name: "Invoice to Google Sheets",
  description:
    "Upload an invoice (a photo, a scan or a PDF) on a form; a vision model reads the vendor, number, dates and amounts, and a row is added to a Google Sheet. To set it up: pick a credential on the Gemini node (or connect another vision model), and choose your Google credential and spreadsheet on the Google Sheets node. The sheet's columns are: Vendor, Invoice number, Invoice date, Due date, Currency, Subtotal, Tax, Total, File name. Activate the workflow and open the Form Trigger's Form URL.",
  category: "Documents",
  nodes: [
    {
      id: "tpl_inv_form",
      type: "FORM_TRIGGER",
      position: { x: 0, y: 0 },
      data: {
        formTitle: "Upload an invoice",
        formDescription: "A photo, a scan or a PDF of the invoice.",
        formFields: fields([{ label: "Invoice", type: "file", required: true }]),
        submitLabel: "Upload",
        afterSubmit: "message",
        thankYouMessage: "Thank you. The invoice was received.",
      },
    },
    {
      id: "tpl_inv_model",
      type: "GEMINI",
      position: { x: 260, y: 220 },
      data: { variableName: "visionModel" },
    },
    {
      id: "tpl_inv_analyze",
      type: "ANALYZE_DOCUMENT",
      position: { x: 320, y: 0 },
      data: {
        variableName: "invoice",
        operation: "extract_fields",
        file: "form.invoice",
        attributes: [
          "vendor: the company that issued the invoice",
          "invoiceNumber",
          "invoiceDate (date)",
          "dueDate (date)",
          "currency: three-letter code such as USD or PKR",
          "subtotal (number): the amount before tax",
          "tax (number)",
          "total (number): the amount to pay",
        ].join("\n"),
        maxPages: "3",
      },
    },
    {
      id: "tpl_inv_sheet",
      type: "GOOGLE_SHEETS",
      position: { x: 640, y: 0 },
      data: {
        variableName: "sheetRow",
        sheetName: "Sheet1",
        // One value per column, separated by commas
        rowData:
          "{{invoice.output.vendor}}, {{invoice.output.invoiceNumber}}, {{invoice.output.invoiceDate}}, {{invoice.output.dueDate}}, {{invoice.output.currency}}, {{invoice.output.subtotal}}, {{invoice.output.tax}}, {{invoice.output.total}}, {{form.invoice.fileName}}",
      },
    },
  ],
  connections: [
    flow("tpl_inv_form", "tpl_inv_analyze"),
    model("tpl_inv_model", "tpl_inv_analyze"),
    flow("tpl_inv_analyze", "tpl_inv_sheet"),
  ],
};

const CV_SCREENING: BuiltinTemplate = {
  id: "tpl_cv_screening_score_and_email",
  name: "CV screening: score and email",
  description:
    "A candidate uploads their CV on a form; a vision model reads it (scanned CVs too), a second step scores it from 0 to 100 against your job description, and the result is emailed to you. To set it up: pick a credential on the Gemini node (or connect another vision model), replace the job description in the Information Extractor's System Prompt, and choose an SMTP credential and your address on the Email node. The score is a first look to help you sort applications, not a decision: read the CV before you reject anyone.",
  category: "Documents",
  nodes: [
    {
      id: "tpl_cv_form",
      type: "FORM_TRIGGER",
      position: { x: 0, y: 0 },
      data: {
        formTitle: "Apply for the job",
        formDescription: "Upload your CV as a PDF or an image.",
        formFields: fields([
          { label: "Full name", type: "text", required: true },
          { label: "Email", type: "email", required: true },
          { label: "CV", type: "file", required: true },
        ]),
        submitLabel: "Send application",
        afterSubmit: "message",
        thankYouMessage: "Thank you. We received your application.",
      },
    },
    {
      id: "tpl_cv_model",
      type: "GEMINI",
      position: { x: 420, y: 220 },
      data: { variableName: "visionModel" },
    },
    {
      id: "tpl_cv_analyze",
      type: "ANALYZE_DOCUMENT",
      position: { x: 320, y: 0 },
      data: {
        variableName: "cv",
        operation: "extract_text",
        file: "form.cv",
        maxPages: "5",
      },
    },
    {
      id: "tpl_cv_score",
      type: "INFORMATION_EXTRACTOR",
      position: { x: 640, y: 0 },
      data: {
        variableName: "screening",
        inputText: "{{cv.text}}",
        attributes: [
          "score (number): 0 to 100, how well the CV fits the job described in the instructions",
          "yearsOfExperience (number): years of relevant work experience",
          "keySkills (list): the skills that matter for this job",
          "strengths: one or two sentences",
          "concerns: one or two sentences, or none",
          "recommendation: one of interview, maybe, reject",
        ].join("\n"),
        systemPrompt:
          "You screen CVs for the job below. Judge only on what the CV says about skills and experience. Ignore name, gender, age, religion, photo and address.\n\nJob: Customer support agent. Required: two or more years in customer support, good written English, experience with a help desk tool. Nice to have: Urdu, e-commerce experience.\n\n(Replace this job description with your own.)",
      },
    },
    {
      id: "tpl_cv_email",
      type: "EMAIL_SEND",
      position: { x: 960, y: 0 },
      data: {
        recipient: "hiring@example.com",
        subject: "CV screening: {{form.full_name}} scored {{screening.output.score}}",
        body: [
          "<p><strong>{{form.full_name}}</strong> ({{form.email}}) applied.</p>",
          "<p>Score: <strong>{{screening.output.score}}</strong> / 100<br>",
          "Recommendation: {{screening.output.recommendation}}<br>",
          "Experience: {{screening.output.yearsOfExperience}} years<br>",
          "Key skills: {{screening.output.keySkills}}</p>",
          "<p>Strengths: {{screening.output.strengths}}</p>",
          "<p>Concerns: {{screening.output.concerns}}</p>",
          "<p>The score is a first look made by a model. Read the attached CV before you decide.</p>",
        ].join("\n"),
        attachments: "form.cv",
      },
    },
  ],
  connections: [
    flow("tpl_cv_form", "tpl_cv_analyze"),
    model("tpl_cv_model", "tpl_cv_analyze"),
    flow("tpl_cv_analyze", "tpl_cv_score"),
    model("tpl_cv_model", "tpl_cv_score"),
    flow("tpl_cv_score", "tpl_cv_email"),
  ],
};

// An output of an IF node
const branch = (
  fromNodeId: string,
  output: "true" | "false",
  toNodeId: string
): TemplateConnection => ({
  fromNodeId,
  toNodeId,
  fromOutput: output,
  toInput: "target-1",
});

const ORDER_PAID_WHATSAPP: BuiltinTemplate = {
  id: "tpl_shopify_order_paid_whatsapp",
  name: "Shopify order paid: WhatsApp confirmation",
  description:
    "When an order is paid in your Shopify store, the customer gets a confirmation on WhatsApp. Orders without a phone number are skipped. WhatsApp only lets a business start a conversation with an approved message template, so first create one in WhatsApp Manager named order_confirmation with four variables, for example: \"Hi {{1}}, thank you for your order {{2}}. We received your payment of {{3}} {{4}}.\" To set it up: put your signing secret on the Shopify Trigger and create the Order payment webhook in Shopify with the trigger's Webhook URL; on the WhatsApp node pick your credential and type your Phone Number ID. Only message customers who agreed to be contacted on WhatsApp. For WooCommerce, replace the trigger with a WooCommerce Trigger set to Order paid and use {{woocommerce.phone}}, {{woocommerce.customerName}}, {{woocommerce.order.number}}, {{woocommerce.order.total}} and {{woocommerce.order.currency}}.",
  category: "E-commerce",
  nodes: [
    {
      id: "tpl_paid_trigger",
      type: "SHOPIFY_TRIGGER",
      position: { x: 0, y: 0 },
      data: { event: "orders/paid" },
    },
    {
      id: "tpl_paid_has_phone",
      type: "IF",
      position: { x: 320, y: 0 },
      data: {
        combinator: "and",
        conditions: [{ inputKey: "shopify.phone", operator: "exists", value: "" }],
      },
    },
    {
      id: "tpl_paid_whatsapp",
      type: "WHATSAPP",
      position: { x: 640, y: 0 },
      data: {
        variableName: "confirmation",
        operation: "send_template",
        phoneNumberId: "",
        to: "{{shopify.phone}}",
        templateName: "order_confirmation",
        languageCode: "en_US",
        // {{json ...}} writes each value as JSON text, quotes included
        templateParamsJson:
          "[{{json shopify.customerName}}, {{json shopify.order.name}}, {{json shopify.order.total_price}}, {{json shopify.order.currency}}]",
      },
    },
  ],
  connections: [
    flow("tpl_paid_trigger", "tpl_paid_has_phone"),
    branch("tpl_paid_has_phone", "true", "tpl_paid_whatsapp"),
  ],
};

const ABANDONED_CART_REMINDER: BuiltinTemplate = {
  id: "tpl_shopify_abandoned_cart_reminder",
  name: "Shopify abandoned cart: email reminder",
  description:
    "Every hour, looks for checkouts in your Shopify store that were started between one and two hours ago and never completed, and emails each shopper a link back to their cart. Because the schedule and the two time limits match, a checkout gets one reminder. To set it up: on the Shopify node pick your credential (its app needs the read_orders scope) and type your Shop Domain; on the Email node pick an SMTP credential and rewrite the message in your shop's voice. If you change how often it runs, change the two time limits on the Shopify node to match. Shopify can send abandoned checkout emails by itself: switch that off in Shopify (Settings > Checkout) or shoppers get two. Only email shoppers where the law and your privacy policy allow it.",
  category: "E-commerce",
  nodes: [
    {
      id: "tpl_cart_schedule",
      type: "SCHEDULE_TRIGGER",
      position: { x: 0, y: 0 },
      data: { variableName: "scheduleTrigger", cronExpression: "0 * * * *" },
    },
    {
      id: "tpl_cart_list",
      type: "SHOPIFY",
      position: { x: 320, y: 0 },
      data: {
        variableName: "abandoned",
        operation: "list_abandoned_checkouts",
        shopDomain: "",
        minAgeMinutes: "60",
        maxAgeMinutes: "120",
        contactOnly: "true",
        limit: "50",
      },
    },
    {
      id: "tpl_cart_split",
      type: "SPLIT_OUT",
      position: { x: 640, y: 0 },
      data: { variableName: "checkouts", inputPath: "abandoned", field: "", include: "none" },
    },
    {
      id: "tpl_cart_has_email",
      type: "IF",
      position: { x: 960, y: 0 },
      data: {
        combinator: "and",
        conditions: [{ inputKey: "item.email", operator: "exists", value: "" }],
      },
    },
    {
      id: "tpl_cart_email",
      type: "EMAIL_SEND",
      position: { x: 1280, y: 0 },
      data: {
        recipient: "{{item.email}}",
        subject: "You left something in your cart",
        body: [
          "<p>Hi {{item.customer.first_name}},</p>",
          "<p>You started an order with us and did not finish it. Your cart is saved:</p>",
          '<p><a href="{{item.abandoned_checkout_url}}">Return to your cart</a></p>',
          "<p>If you have a question about your order, reply to this email.</p>",
        ].join("\n"),
      },
    },
  ],
  connections: [
    flow("tpl_cart_schedule", "tpl_cart_list"),
    flow("tpl_cart_list", "tpl_cart_split"),
    flow("tpl_cart_split", "tpl_cart_has_email"),
    branch("tpl_cart_has_email", "true", "tpl_cart_email"),
  ],
};

// One group per migration that added templates
export const DOCUMENT_TEMPLATES: BuiltinTemplate[] = [INVOICE_TO_SHEETS, CV_SCREENING];
export const STORE_TEMPLATES: BuiltinTemplate[] = [ORDER_PAID_WHATSAPP, ABANDONED_CART_REMINDER];

export const BUILTIN_TEMPLATES: BuiltinTemplate[] = [...DOCUMENT_TEMPLATES, ...STORE_TEMPLATES];

// Who the gallery says made them: no user's account
export const BUILTIN_TEMPLATE_AUTHOR = "system";

/**
 * The rows of the template gallery for the built-in templates, cleaned the
 * same way a published workflow is (no credentials, no secrets).
 */
export const toSeedRows = (templates: BuiltinTemplate[] = BUILTIN_TEMPLATES) =>
  templates.map((template) => {
    const data = toTemplateData(template.nodes, template.connections);

    return {
      id: template.id,
      name: template.name,
      description: template.description,
      category: template.category,
      nodes: data.nodes,
      connections: data.connections,
      nodeTypes: data.nodeTypes,
    };
  });

const quote = (value: string) => `'${value.replace(/'/g, "''")}'`;

/**
 * The INSERT statements of the migration. Each can be run twice: a row
 * that is already there (also one an admin has edited since) is left as it
 * is.
 */
export const buildSeedSql = (templates: BuiltinTemplate[] = BUILTIN_TEMPLATES) =>
  toSeedRows(templates)
    .map(
      (row) =>
        `INSERT INTO "workflow_template" ("id", "name", "description", "category", "minPlan", "published", "nodes", "connections", "nodeTypes", "useCount", "createdById", "createdAt", "updatedAt")\n` +
        `VALUES (${quote(row.id)}, ${quote(row.name)}, ${quote(row.description)}, ${quote(row.category)}, 'FREE', true, ${quote(JSON.stringify(row.nodes))}::jsonb, ${quote(JSON.stringify(row.connections))}::jsonb, ARRAY[${row.nodeTypes.map(quote).join(", ")}]::text[], 0, ${quote(BUILTIN_TEMPLATE_AUTHOR)}, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)\n` +
        `ON CONFLICT ("id") DO NOTHING;`
    )
    .join("\n\n");
