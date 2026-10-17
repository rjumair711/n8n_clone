// Starter templates: seed data for an admin to add to the gallery, each in
// English, Urdu and Arabic. A seed file (../seed/*.json) holds one workflow
// once and its texts per language; a setting whose value is "@text:<key>"
// takes the text of that key in the template's language.
//
// Nothing here touches the database. Adding them to the gallery is an admin
// action (templates router, addStarters); they are not put there by a
// migration, so an admin decides which ones the gallery gets and when.

import clinicAppointmentBot from "../seed/clinic-appointment-bot.json";
import realEstateLeadBot from "../seed/real-estate-lead-bot.json";
import schoolFeeReminder from "../seed/school-fee-reminder.json";
import shopOrderBot from "../seed/shop-order-bot.json";
import supportFaqBot from "../seed/support-faq-bot.json";
// Added with the template gallery: Pro, Intermediate, then Free
import codOrderConfirmation from "../seed/cod-order-confirmation.json";
import whatsappOrderStatus from "../seed/whatsapp-order-status.json";
import whatsappVoiceHelper from "../seed/whatsapp-voice-helper.json";
import whatsappCatalogueAssistant from "../seed/whatsapp-catalogue-assistant.json";
import appointmentReminders from "../seed/appointment-reminders.json";
import afterSaleReviewRequest from "../seed/after-sale-review-request.json";
import telegramExpenseLogger from "../seed/telegram-expense-logger.json";
import overdueInvoiceReminder from "../seed/overdue-invoice-reminder.json";
import formToSheetWithEmail from "../seed/form-to-sheet-with-email.json";
import marketplaceOrderEmailsToSheet from "../seed/marketplace-order-emails-to-sheet.json";
import emailReplyWithApproval from "../seed/email-reply-with-approval.json";
import dailySalesEmail from "../seed/daily-sales-email.json";
import weeklyPdfReport from "../seed/weekly-pdf-report.json";
import schoolAdmissionEnquiries from "../seed/school-admission-enquiries.json";
import shopifyOrdersLedger from "../seed/shopify-orders-ledger.json";
import websiteOrderHelpChat from "../seed/website-order-help-chat.json";
import websiteChatFromDocuments from "../seed/website-chat-from-documents.json";
import staffCheckinTelegram from "../seed/staff-checkin-telegram.json";
import newOrderAlertTelegram from "../seed/new-order-alert-telegram.json";
import telegramAiBot from "../seed/telegram-ai-bot.json";
import staffKnowledgeBotTelegram from "../seed/staff-knowledge-bot-telegram.json";
import feedbackNegativeAlert from "../seed/feedback-negative-alert.json";
import messengerFaqBot from "../seed/messenger-faq-bot.json";
import voiceNotesToNotion from "../seed/voice-notes-to-notion.json";
import schoolAnnouncementsTelegram from "../seed/school-announcements-telegram.json";
import leaveAndExpenseApproval from "../seed/leave-and-expense-approval.json";
import bookingFormToCalendar from "../seed/booking-form-to-calendar.json";
import eventRegistrationPdfTicket from "../seed/event-registration-pdf-ticket.json";
import quoteRequestWithApproval from "../seed/quote-request-with-approval.json";
import lowStockAlert from "../seed/low-stock-alert.json";
import shippingEmailWithTracking from "../seed/shipping-email-with-tracking.json";
import productDescriptionsThreeLanguages from "../seed/product-descriptions-three-languages.json";
import cancelledOrderAlert from "../seed/cancelled-order-alert.json";
import documentSummaryByEmail from "../seed/document-summary-by-email.json";
import invoiceGenerator from "../seed/invoice-generator.json";
import {
  TEMPLATE_LANGUAGES,
  type TemplateLanguage,
} from "./template-languages";
import {
  toTemplateData,
  type TemplateConnection,
  type TemplateNode,
} from "./template-data";

export type StarterSeed = {
  // Lower case with underscores: part of the template's id
  key: string;
  category: string;
  minPlan: string;
  nodes: { id: string; type: string; position: { x: number; y: number }; data: Record<string, unknown> }[];
  connections: TemplateConnection[];
  // Per language: the template's name and description, and every text the
  // nodes refer to
  text: Record<string, Record<string, string>>;
};

export const STARTER_SEEDS: StarterSeed[] = [
  clinicAppointmentBot,
  schoolFeeReminder,
  shopOrderBot,
  realEstateLeadBot,
  supportFaqBot,
  codOrderConfirmation,
  whatsappOrderStatus,
  whatsappVoiceHelper,
  whatsappCatalogueAssistant,
  appointmentReminders,
  afterSaleReviewRequest,
  telegramExpenseLogger,
  overdueInvoiceReminder,
  formToSheetWithEmail,
  marketplaceOrderEmailsToSheet,
  emailReplyWithApproval,
  dailySalesEmail,
  weeklyPdfReport,
  schoolAdmissionEnquiries,
  shopifyOrdersLedger,
  websiteOrderHelpChat,
  websiteChatFromDocuments,
  staffCheckinTelegram,
  newOrderAlertTelegram,
  telegramAiBot,
  staffKnowledgeBotTelegram,
  feedbackNegativeAlert,
  messengerFaqBot,
  voiceNotesToNotion,
  schoolAnnouncementsTelegram,
  leaveAndExpenseApproval,
  bookingFormToCalendar,
  eventRegistrationPdfTicket,
  quoteRequestWithApproval,
  lowStockAlert,
  shippingEmailWithTracking,
  productDescriptionsThreeLanguages,
  cancelledOrderAlert,
  documentSummaryByEmail,
  invoiceGenerator,
];

const TEXT_MARKER = "@text:";

export type StarterTemplate = {
  // Fixed, so adding the starters twice adds each one once
  id: string;
  key: string;
  language: TemplateLanguage;
  name: string;
  description: string;
  category: string;
  minPlan: string;
  nodes: TemplateNode[];
  connections: TemplateConnection[];
  nodeTypes: string[];
};

export const toStarterId = (key: string, language: string) => `tpl_starter_${key}_${language}`;

/**
 * The text keys a seed's nodes refer to.
 */
export const findTextKeys = (value: unknown, found = new Set<string>()): Set<string> => {
  if (typeof value === "string") {
    if (value.startsWith(TEXT_MARKER)) found.add(value.slice(TEXT_MARKER.length));
  } else if (Array.isArray(value)) {
    for (const item of value) findTextKeys(item, found);
  } else if (value !== null && typeof value === "object") {
    for (const item of Object.values(value)) findTextKeys(item, found);
  }

  return found;
};

const fillTexts = (value: unknown, texts: Record<string, string>): unknown => {
  if (typeof value === "string") {
    if (!value.startsWith(TEXT_MARKER)) return value;

    const key = value.slice(TEXT_MARKER.length);

    if (typeof texts[key] !== "string") {
      throw new Error(`Starter template: the text "${key}" is missing`);
    }

    return texts[key];
  }

  if (Array.isArray(value)) return value.map((item) => fillTexts(item, texts));

  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, fillTexts(item, texts)])
    );
  }

  return value;
};

/**
 * One seed in one language, as a template of the gallery: its texts filled
 * in, node ids of its own, and cleaned the way a published workflow is (no
 * credentials, no secrets).
 */
export const buildStarterTemplate = (
  seed: StarterSeed,
  language: TemplateLanguage
): StarterTemplate => {
  const texts = seed.text[language];

  if (!texts?.name || !texts.description) {
    throw new Error(`Starter template ${seed.key}: no name or description in "${language}"`);
  }

  const id = toStarterId(seed.key, language);
  const nodeId = (seedId: string) => `${id}_${seedId}`;

  const nodes = seed.nodes.map((node) => {
    const data = fillTexts(node.data, texts) as Record<string, unknown>;

    // The AI Agent keeps each tool's name and description by node id
    if (data.toolSettings && typeof data.toolSettings === "object") {
      data.toolSettings = Object.fromEntries(
        Object.entries(data.toolSettings as Record<string, unknown>).map(
          ([toolNodeId, settings]) => [nodeId(toolNodeId), settings]
        )
      );
    }

    return { id: nodeId(node.id), type: node.type, position: node.position, data };
  });

  const data = toTemplateData(
    nodes,
    seed.connections.map((connection) => ({
      ...connection,
      fromNodeId: nodeId(connection.fromNodeId),
      toNodeId: nodeId(connection.toNodeId),
    }))
  );

  return {
    id,
    key: seed.key,
    language,
    name: texts.name,
    description: texts.description,
    category: seed.category,
    minPlan: seed.minPlan,
    ...data,
  };
};

/**
 * Every starter template: each seed in each language.
 */
export const buildStarterTemplates = (seeds: StarterSeed[] = STARTER_SEEDS): StarterTemplate[] =>
  seeds.flatMap((seed) =>
    TEMPLATE_LANGUAGES.map((language) => buildStarterTemplate(seed, language.value))
  );
