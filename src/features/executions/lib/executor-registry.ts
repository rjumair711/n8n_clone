import { calculatorExecutor } from './../components/calculator/executor';
import { stripeTriggerExecutor } from './../../triggers/components/stripe-trigger/executor';
import { NodeType } from "@prisma/client";
import { NodeExecutor } from "../types";
import { getMessageSend } from "@/config/message-caps";
import { consumeMessageQuota } from "@/lib/message-usage";
import { renderTemplate } from "./templates";
import { manualTriggerExecutor } from "@/features/triggers/components/manual-trigger/executor";
import { httpRequestExecutor } from "../components/http-request/executor";
import { googleFormTriggerExecutor } from "@/features/triggers/components/google-form-trigger/executor";
import { geminiExecutor } from '../components/gemini/executor';
import { OpenAIExecutor } from '../components/openai/executor';
import { AnthropicExecutor } from '../components/anthropic/executor';
import { discordExecutor } from '../components/discord/executor';
import { slackExecutor } from '../components/slack/executor';
import { filterExecutor } from '../components/filter/executor';
import { setVariableExecutor } from '../components/set-variable/executor';
import { delayExecutor } from '../components/delay/executor';
import { webhookResponseExecutor } from '../components/webhook/executor';
import { emailExecutor } from '../components/email/executor';
import { googleSheetsExecutor } from '../components/googleSheet/executor';
import { ScheduleExecutor } from '@/features/triggers/components/schedule-trigger/executor';
import { codeNodeExecutor } from '../components/code/executor';
import { aiAgentExecutor } from '../../editor/components/agent/executor';
import { bufferMemoryExecutor } from '@/features/editor/components/memory/executor';
import { googleCalendarExecutor } from '../components/googleCalender/executor';
import { notionExecutor } from '../components/notion/executor';
import { telegramExecutor } from '../components/telegram/executor';
import { dateTimeExecutor } from '../components/daytime/executor';
import { textFormatterExecutor } from '../components/textFormatter/executor';
import { switchExecutor } from '../components/switch/executor';
import { ifExecutor } from '../components/if/executor';
import { mergeExecutor } from '../components/merge/executor';
import { loopExecutor } from '../components/loop/executor';
import { webhookTriggerExecutor } from '@/features/triggers/components/webhook-trigger/executor';
import { chatTriggerExecutor } from '@/features/triggers/components/chat-trigger/executor';
import { githubExecutor } from '../components/github/executor';
import { airtableExecutor } from '../components/airtable/executor';
import { postgresExecutor } from '../components/postgres/executor';
import { whatsappExecutor } from '../components/whatsapp/executor';
import {
  contextTriggerExecutor,
  executeWorkflowExecutor,
  respondToWebhookExecutor,
  stopAndErrorExecutor,
} from '../components/core/executors';
import {
  aggregateExecutor,
  limitExecutor,
  removeDuplicatesExecutor,
  sortExecutor,
  splitOutExecutor,
  summarizeExecutor,
} from '../components/data/executors';
import { gmailExecutor } from '../components/gmail/executor';
import {
  chatModelExecutor,
  deepseekExecutor,
  kimiExecutor,
  qwenExecutor,
} from '../components/chat-model/executor';
import {
  informationExtractorExecutor,
  textClassifierExecutor,
  vectorStoreExecutor,
} from '../components/ai/executors';
import { mcpClientExecutor } from '../components/ai/mcp';
import { salesforceExecutor } from '../components/apps/salesforce';
import { sshExecutor } from '../components/apps/ssh';
import {
  convertToFileExecutor,
  extractFromFileExecutor,
  googleDriveExecutor,
  pdfGeneratorExecutor,
} from '../components/files/executors';
import {
  editFieldsExecutor,
  hubspotExecutor,
  jiraExecutor,
  mysqlExecutor,
  resendExecutor,
  rssReadExecutor,
  sendgridExecutor,
  twilioExecutor,
} from '../components/apps/executors';

const baseExecutors: Record<NodeType, NodeExecutor<any>> = {
  [NodeType.MANUAL_TRIGGER]: manualTriggerExecutor,
  [NodeType.INITIAL]: manualTriggerExecutor,
  [NodeType.HTTP_REQUEST]: httpRequestExecutor,
  [NodeType.GOOGLE_FORM_TRIGGER]: googleFormTriggerExecutor,
  [NodeType.STRIPE_TRIGGER]: stripeTriggerExecutor,
  [NodeType.GEMINI]: geminiExecutor,
  [NodeType.ANTHROPIC]: AnthropicExecutor,
  [NodeType.OPENAI]: OpenAIExecutor,
  [NodeType.DISCORD]: discordExecutor,
  [NodeType.SLACK]: slackExecutor,
  [NodeType.FILTER]: filterExecutor,
  [NodeType.SET_VARIABLE]: setVariableExecutor,
  [NodeType.DELAY]: delayExecutor,
  [NodeType.WEBHOOK_RESPONSE]: webhookResponseExecutor,
  [NodeType.GOOGLE_SHEETS]: googleSheetsExecutor,
  [NodeType.EMAIL_SEND]: emailExecutor,
  [NodeType.SCHEDULE_TRIGGER]: ScheduleExecutor,
  [NodeType.CODE]: codeNodeExecutor,
  [NodeType.AI_AGENT]: aiAgentExecutor,
  [NodeType.BUFFER_MEMORY]: bufferMemoryExecutor,
  [NodeType.GOOGLE_CALENDAR]: googleCalendarExecutor,
  [NodeType.NOTION]: notionExecutor,
  [NodeType.TELEGRAM]: telegramExecutor,
  [NodeType.DATE_TIME]: dateTimeExecutor,
  [NodeType.TEXT_FORMATTER]: textFormatterExecutor,
  [NodeType.CALCULATOR]: calculatorExecutor,
  [NodeType.SWITCH]: switchExecutor,
  [NodeType.IF]: ifExecutor,
  [NodeType.MERGE]: mergeExecutor,
  [NodeType.LOOP]: loopExecutor,
  [NodeType.WEBHOOK_TRIGGER]: webhookTriggerExecutor,
  [NodeType.CHAT_TRIGGER]: chatTriggerExecutor,
  [NodeType.GITHUB]: githubExecutor,
  [NodeType.AIRTABLE]: airtableExecutor,
  [NodeType.POSTGRES]: postgresExecutor,
  [NodeType.WHATSAPP]: whatsappExecutor,
  [NodeType.RESPOND_TO_WEBHOOK]: respondToWebhookExecutor,
  [NodeType.ERROR_TRIGGER]: contextTriggerExecutor,
  [NodeType.STOP_AND_ERROR]: stopAndErrorExecutor,
  [NodeType.TELEGRAM_TRIGGER]: contextTriggerExecutor,
  [NodeType.WHATSAPP_TRIGGER]: contextTriggerExecutor,
  [NodeType.GMAIL]: gmailExecutor,
  [NodeType.SPLIT_OUT]: splitOutExecutor,
  [NodeType.AGGREGATE]: aggregateExecutor,
  [NodeType.SORT]: sortExecutor,
  [NodeType.LIMIT]: limitExecutor,
  [NodeType.REMOVE_DUPLICATES]: removeDuplicatesExecutor,
  [NodeType.SUMMARIZE]: summarizeExecutor,
  [NodeType.EXECUTE_WORKFLOW]: executeWorkflowExecutor,
  [NodeType.EXECUTE_WORKFLOW_TRIGGER]: contextTriggerExecutor,
  [NodeType.CHAT_MODEL]: chatModelExecutor,
  [NodeType.DEEPSEEK]: deepseekExecutor,
  [NodeType.KIMI]: kimiExecutor,
  [NodeType.QWEN]: qwenExecutor,
  [NodeType.GMAIL_TRIGGER]: contextTriggerExecutor,
  // Only read by the AI Agent it is plugged into
  [NodeType.STRUCTURED_OUTPUT_PARSER]: contextTriggerExecutor,
  [NodeType.TEXT_CLASSIFIER]: textClassifierExecutor,
  [NodeType.INFORMATION_EXTRACTOR]: informationExtractorExecutor,
  [NodeType.VECTOR_STORE]: vectorStoreExecutor,
  [NodeType.MCP_CLIENT_TOOL]: mcpClientExecutor,
  [NodeType.EDIT_FIELDS]: editFieldsExecutor,
  [NodeType.TWILIO]: twilioExecutor,
  [NodeType.JIRA]: jiraExecutor,
  [NodeType.HUBSPOT]: hubspotExecutor,
  [NodeType.MYSQL]: mysqlExecutor,
  [NodeType.RESEND]: resendExecutor,
  [NodeType.SENDGRID]: sendgridExecutor,
  [NodeType.TYPEFORM_TRIGGER]: contextTriggerExecutor,
  [NodeType.RSS_READ]: rssReadExecutor,
  [NodeType.RSS_FEED_TRIGGER]: contextTriggerExecutor,
  [NodeType.GOOGLE_DRIVE]: googleDriveExecutor,
  [NodeType.PDF_GENERATOR]: pdfGeneratorExecutor,
  [NodeType.CONVERT_TO_FILE]: convertToFileExecutor,
  [NodeType.EXTRACT_FROM_FILE]: extractFromFileExecutor,
  [NodeType.SALESFORCE]: salesforceExecutor,
  [NodeType.SSH]: sshExecutor,
}

/**
 * Nodes that send email, WhatsApp, Twilio or Telegram messages count each
 * send against the user's daily cap before they run (see
 * src/config/message-caps.ts). Done here so it holds wherever a node runs:
 * in a workflow, once per item of a list, or as an AI Agent tool.
 *
 * The count is a step: when Inngest replays the run it is not counted again.
 */
const withMessageCap = (
  type: NodeType,
  executor: NodeExecutor<any>
): NodeExecutor<any> => {
  // Left as it is unless the node type can send at all (asked with a
  // sending operation, for the nodes that also read)
  if (!getMessageSend(type, { operation: "send_email" })) return executor;

  return async (params) => {
    const send = getMessageSend(type, params.data, (text) =>
      renderTemplate(text, params.context)
    );

    if (send) {
      await params.step.run(`message-cap-${params.nodeId}`, () =>
        consumeMessageQuota(params.userId, send.channel, send.count)
      );
    }

    return executor(params);
  };
};

export const executorRegistry = Object.fromEntries(
  Object.entries(baseExecutors).map(([type, executor]) => [
    type,
    withMessageCap(type as NodeType, executor),
  ])
) as Record<NodeType, NodeExecutor<any>>;

export const getExecutor = (type: NodeType): NodeExecutor<any> => {
  const executor = executorRegistry[type];
  if (!executor) {
    throw new Error(`No executor found for node type: ${type}`);
  }
  return executor;
};