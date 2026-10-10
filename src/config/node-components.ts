import { EmailSendNode } from './../features/executions/components/email/node';
import { InitialNode } from "@/components/initial-node";
import { AnthropicNode } from "@/features/executions/components/anthropic/node";
import { CodeNode } from '@/features/executions/components/code/node';
import { DelayNode } from "@/features/executions/components/delay/node";
import { DiscordNode } from "@/features/executions/components/discord/node";
import { FilterNode } from "@/features/executions/components/filter/node";
import { GeminiNode } from "@/features/executions/components/gemini/node";
import { GoogleSheetsNode } from '@/features/executions/components/googleSheet/node';
import { HttpRequestNode } from "@/features/executions/components/http-request/node";
import { OpenAINode } from "@/features/executions/components/openai/node";
import { SetVariableNode } from "@/features/executions/components/set-variable/node";
import { SlackNode } from "@/features/executions/components/slack/node";
import { WebhookResponseNode } from "@/features/executions/components/webhook/node";
import { GoogleFormTrigger } from "@/features/triggers/components/google-form-trigger/node";
import { ManualTriggerNode } from "@/features/triggers/components/manual-trigger/node";
import { ScheduleNode } from '@/features/triggers/components/schedule-trigger/node';
import { StripeTriggerNode } from "@/features/triggers/components/stripe-trigger/node";
import { NodeType } from "@prisma/client";
import { AIAgentNode } from '../features/editor/components/agent/node';
import { BufferMemoryNode } from '@/features/editor/components/memory/node';
import { NodeTypes } from '@xyflow/react';
import { GoogleCalendarNode } from '@/features/executions/components/googleCalender/node';
import { NotionNode } from '@/features/executions/components/notion/node';
import { TelegramNode } from '@/features/executions/components/telegram/node';
import { DateTimeNode } from '@/features/executions/components/daytime/node';
import { TextFormatterNode } from '../features/executions/components/textFormatter/node';
import { CalculatorNode } from '../features/executions/components/calculator/node';
import { SwitchNode } from '@/features/executions/components/switch/node';
import { IfNode } from '@/features/executions/components/if/node';
import { MergeNode } from '@/features/executions/components/merge/node';
import { LoopNode } from '@/features/executions/components/loop/node';
import { WebhookTriggerNode } from '@/features/triggers/components/webhook-trigger/node';
import { ChatTriggerNode } from '@/features/triggers/components/chat-trigger/node';
import { GithubNode } from '@/features/executions/components/github/node';
import { AirtableNode } from '@/features/executions/components/airtable/node';
import { PostgresNode } from '@/features/executions/components/postgres/node';
import { WhatsappNode } from '@/features/executions/components/whatsapp/node';
import {
    AggregateNode,
    ChatModelNode,
    ModelRouterNode,
    DeepSeekNode,
    KimiNode,
    QwenNode,
    ErrorTriggerNode,
    ExecuteWorkflowNode,
    ExecuteWorkflowTriggerNode,
    GmailNode,
    LimitNode,
    RemoveDuplicatesNode,
    RespondToWebhookNode,
    SortNode,
    SplitOutNode,
    StopAndErrorNode,
    SummarizeNode,
    TelegramTriggerNode,
    WhatsappTriggerNode,
} from '@/features/executions/components/core/nodes';
import {
    GmailTriggerNode,
    InformationExtractorNode,
    McpClientNode,
    StructuredOutputParserNode,
    TextClassifierNode,
    VectorStoreNode,
} from '@/features/executions/components/ai/nodes';
import {
    EditFieldsNode,
    HubspotNode,
    JiraNode,
    MysqlNode,
    ResendNode,
    RssFeedTriggerNode,
    RssReadNode,
    SalesforceNode,
    SendgridNode,
    SshNode,
    TwilioNode,
    TypeformTriggerNode,
} from '@/features/executions/components/apps/nodes';
import {
    ConvertToFileNode,
    ExtractFromFileNode,
    GoogleDriveNode,
    PdfGeneratorNode,
} from '@/features/executions/components/files/nodes';

export const nodeComponents: NodeTypes = {
    [NodeType.INITIAL]: InitialNode,
    [NodeType.HTTP_REQUEST]: HttpRequestNode,
    [NodeType.MANUAL_TRIGGER]: ManualTriggerNode,
    [NodeType.GOOGLE_FORM_TRIGGER]: GoogleFormTrigger,
    [NodeType.STRIPE_TRIGGER]: StripeTriggerNode,
    [NodeType.GEMINI]: GeminiNode,
    [NodeType.OPENAI]: OpenAINode,
    [NodeType.ANTHROPIC]: AnthropicNode,
    [NodeType.DISCORD]: DiscordNode,
    [NodeType.SLACK]: SlackNode,
    [NodeType.FILTER]: FilterNode,
    [NodeType.SET_VARIABLE]: SetVariableNode,
    [NodeType.DELAY]: DelayNode,
    [NodeType.WEBHOOK_RESPONSE]: WebhookResponseNode,
    [NodeType.EMAIL_SEND]: EmailSendNode,
    [NodeType.GOOGLE_SHEETS]: GoogleSheetsNode,
    [NodeType.SCHEDULE_TRIGGER]: ScheduleNode,
    [NodeType.CODE]: CodeNode,
    [NodeType.AI_AGENT]: AIAgentNode,
    [NodeType.BUFFER_MEMORY]: BufferMemoryNode,
    [NodeType.GOOGLE_CALENDAR]: GoogleCalendarNode,
    [NodeType.NOTION]: NotionNode,
    [NodeType.TELEGRAM]: TelegramNode,
    [NodeType.DATE_TIME]: DateTimeNode,
    [NodeType.TEXT_FORMATTER]: TextFormatterNode,
    [NodeType.CALCULATOR]: CalculatorNode,
    [NodeType.SWITCH]: SwitchNode,
    [NodeType.IF]: IfNode,
    [NodeType.MERGE]: MergeNode,
    [NodeType.LOOP]: LoopNode,
    [NodeType.WEBHOOK_TRIGGER]: WebhookTriggerNode,
    [NodeType.CHAT_TRIGGER]: ChatTriggerNode,
    [NodeType.GITHUB]: GithubNode,
    [NodeType.AIRTABLE]: AirtableNode,
    [NodeType.POSTGRES]: PostgresNode,
    [NodeType.WHATSAPP]: WhatsappNode,
    [NodeType.RESPOND_TO_WEBHOOK]: RespondToWebhookNode,
    [NodeType.ERROR_TRIGGER]: ErrorTriggerNode,
    [NodeType.STOP_AND_ERROR]: StopAndErrorNode,
    [NodeType.TELEGRAM_TRIGGER]: TelegramTriggerNode,
    [NodeType.WHATSAPP_TRIGGER]: WhatsappTriggerNode,
    [NodeType.GMAIL]: GmailNode,
    [NodeType.SPLIT_OUT]: SplitOutNode,
    [NodeType.AGGREGATE]: AggregateNode,
    [NodeType.SORT]: SortNode,
    [NodeType.LIMIT]: LimitNode,
    [NodeType.REMOVE_DUPLICATES]: RemoveDuplicatesNode,
    [NodeType.SUMMARIZE]: SummarizeNode,
    [NodeType.EXECUTE_WORKFLOW]: ExecuteWorkflowNode,
    [NodeType.EXECUTE_WORKFLOW_TRIGGER]: ExecuteWorkflowTriggerNode,
    [NodeType.CHAT_MODEL]: ChatModelNode,
    [NodeType.MODEL_ROUTER]: ModelRouterNode,
    [NodeType.DEEPSEEK]: DeepSeekNode,
    [NodeType.KIMI]: KimiNode,
    [NodeType.QWEN]: QwenNode,
    [NodeType.GMAIL_TRIGGER]: GmailTriggerNode,
    [NodeType.STRUCTURED_OUTPUT_PARSER]: StructuredOutputParserNode,
    [NodeType.TEXT_CLASSIFIER]: TextClassifierNode,
    [NodeType.INFORMATION_EXTRACTOR]: InformationExtractorNode,
    [NodeType.VECTOR_STORE]: VectorStoreNode,
    [NodeType.MCP_CLIENT_TOOL]: McpClientNode,
    [NodeType.EDIT_FIELDS]: EditFieldsNode,
    [NodeType.TWILIO]: TwilioNode,
    [NodeType.JIRA]: JiraNode,
    [NodeType.HUBSPOT]: HubspotNode,
    [NodeType.MYSQL]: MysqlNode,
    [NodeType.RESEND]: ResendNode,
    [NodeType.SENDGRID]: SendgridNode,
    [NodeType.TYPEFORM_TRIGGER]: TypeformTriggerNode,
    [NodeType.RSS_READ]: RssReadNode,
    [NodeType.RSS_FEED_TRIGGER]: RssFeedTriggerNode,
    [NodeType.GOOGLE_DRIVE]: GoogleDriveNode,
    [NodeType.PDF_GENERATOR]: PdfGeneratorNode,
    [NodeType.CONVERT_TO_FILE]: ConvertToFileNode,
    [NodeType.EXTRACT_FROM_FILE]: ExtractFromFileNode,
    [NodeType.SALESFORCE]: SalesforceNode,
    [NodeType.SSH]: SshNode,
};

export type RegisteredNodeType = keyof typeof nodeComponents;